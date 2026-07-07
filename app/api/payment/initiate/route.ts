import { NextRequest, NextResponse } from 'next/server'
import { sessionStore } from '@/lib/session-store'
import { computeBasketTotal, resolvePaymentMode, isPaymentDeadlineExpired } from '@/lib/payment'
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
  const { sessionId, basketId, paymentMode } = (await req.json()) as {
    sessionId: string
    basketId: string
    paymentMode: 'wallet' | 'card' | 'interac'
  }

  const session = sessionStore.get(sessionId)

  // 410 Gone when the split-payment deadline has passed
  if (isPaymentDeadlineExpired(session)) {
    return NextResponse.json({ error: 'Payment deadline expired' }, { status: 410 })
  }

  const basket = session.baskets.find((b) => b.userId === basketId)
  if (!basket) {
    return NextResponse.json({ error: 'Basket not found' }, { status: 404 })
  }

  // Resolve menu items to compute an accurate basket total
  const menuSections = await getMenu()
  const menuItems = menuSections.flatMap((s) => s.items)
  const totalCents = Math.round(computeBasketTotal(basket, menuItems) * 100)

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

  // On the first split-flow initiation: stamp a 30-minute payment deadline
  if (resolvePaymentMode(updatedSession) === 'split' && updatedSession.paymentDeadline === null) {
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    updatedSession = { ...updatedSession, paymentDeadline: deadline }
  }

  sessionStore.set(sessionId, updatedSession)

  if (paymentMode === 'interac') {
    return NextResponse.json({ redirectUrl: helcimRedirectUrl })
  }
  return NextResponse.json({ token: helcimToken })
}
