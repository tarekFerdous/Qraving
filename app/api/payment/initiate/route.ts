import { NextRequest, NextResponse } from 'next/server'
import { getSession, setSession } from '@/lib/session-firestore'
import {
  computeBasketDue,
  computeSessionTotal,
  resolvePaymentMode,
  isPaymentDeadlineExpired,
} from '@/lib/payment'
import { getMenu } from '@/lib/menu'
import { isTestMode } from '@/lib/helcim'

// Helcim uses the same base URL for both sandbox and production environments.
// The test vs. production distinction is made by the API key supplied in
// HELCIM_API_KEY — a test key activates sandbox mode; a live key activates
// production. isTestMode (HELCIM_TEST_MODE=true) signals which key type to use.
const HELCIM_BASE_URL = isTestMode
  ? 'https://api.helcim.com/v2' // sandbox: same URL, test API key
  : 'https://api.helcim.com/v2' // production: same URL, live API key

export async function POST(req: NextRequest) {
  const { sessionId, basketId, paymentMode, paymentPlan } = (await req.json()) as {
    sessionId: string
    basketId: string
    paymentMode: 'wallet' | 'card' | 'interac'
    // The plan the client chose on PaymentPlanSheet (or null when the
    // session never needed one, e.g. a single-basket session). Persisted
    // onto the session here so it's authoritative for the webhook/callback
    // routes even if the client's own optimistic Firestore write hasn't
    // landed yet.
    paymentPlan?: 'single' | 'split' | null
  }

  let session = await getSession(sessionId)

  // 410 Gone when the split-payment deadline has passed
  if (isPaymentDeadlineExpired(session)) {
    return NextResponse.json({ error: 'Payment deadline expired' }, { status: 410 })
  }

  const basket = session.baskets.find((b) => b.userId === basketId)
  if (!basket) {
    return NextResponse.json({ error: 'Basket not found' }, { status: 404 })
  }

  // Record the client's chosen payment plan on the session, once, if it
  // hasn't been recorded yet.
  if (paymentPlan && session.paymentPlan === null) {
    session = { ...session, paymentPlan }
  }

  // paymentPlan (once chosen) drives downstream behavior; resolvePaymentMode
  // is only the inferred fallback for sessions that never needed a choice
  // (e.g. a single non-empty basket).
  const effectivePlan = session.paymentPlan ?? resolvePaymentMode(session)

  // Resolve menu items to compute an accurate total. Split-mode charges
  // computeBasketDue (not computeBasketTotal) so the actual Helcim charge
  // reflects this basket's share of any items it's splitting with other
  // baskets — this is the security-relevant amount, since this route (not
  // the client) determines what's really charged.
  const menuSections = await getMenu('demo-company', 'demo-branch')
  const menuItems = menuSections.flatMap((s) => s.items)
  const totalCents = Math.round(
    (effectivePlan === 'single'
      ? computeSessionTotal(session, menuItems)
      : computeBasketDue(basket, session, menuItems)) * 100,
  )

  // Build the Helcim initialisation payload
  const helcimBody: Record<string, unknown> = {
    paymentType: 'purchase',
    amount: totalCents,
    currency: 'CAD',
  }
  if (paymentMode === 'interac') {
    helcimBody.paymentMethod = 'interac'
  }

  let helcimToken: string | undefined
  let helcimRedirectUrl: string | undefined

  if (!process.env.HELCIM_API_KEY) {
    // No credentials configured — use a sentinel so the client can simulate success
    helcimToken = '__test__'
    helcimRedirectUrl = `/api/payment/interac-callback?sessionId=${sessionId}&basketId=${basketId}&result=APPROVED`
  } else {
    const helcimRes = await fetch(`${HELCIM_BASE_URL}/helcim-pay/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiToken ${process.env.HELCIM_API_KEY}`,
      },
      body: JSON.stringify(helcimBody),
    })

    if (!helcimRes.ok) {
      return NextResponse.json({ error: 'Payment provider error' }, { status: 502 })
    }

    const helcimData = (await helcimRes.json()) as {
      secretToken?: string
      redirectUrl?: string
    }
    helcimToken = helcimData.secretToken
    helcimRedirectUrl = helcimData.redirectUrl
  }

  // On the first initiation call: transition orderStatus to payment_pending
  let updatedSession = session
  if (updatedSession.orderStatus !== 'payment_pending') {
    updatedSession = { ...updatedSession, orderStatus: 'payment_pending' }
  }

  // On the first split-flow initiation: stamp a 30-minute payment deadline.
  // Reads paymentPlan (falling back to the inference only when no plan has
  // been chosen), not the raw resolvePaymentMode result — a whole-table
  // payment never needs a per-basket deadline even if there are 2+ baskets.
  if (effectivePlan === 'split' && updatedSession.paymentDeadline === null) {
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    updatedSession = { ...updatedSession, paymentDeadline: deadline }
  }

  await setSession(sessionId, updatedSession)

  if (paymentMode === 'interac') {
    return NextResponse.json({ redirectUrl: helcimRedirectUrl })
  }
  return NextResponse.json({ token: helcimToken })
}
