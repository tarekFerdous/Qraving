import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { getSession, setSession } from '@/lib/session-firestore'
import { allBasketsPaid, applyWholeTablePayment, computeBasketTotal } from '@/lib/payment'
import { getMenu } from '@/lib/menu'
import type { UserBasket } from '@/lib/session'

function fireSmsReceipt(basket: UserBasket, sessionId: string): void {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  void (async () => {
    try {
      const menuSections = await getMenu('demo-company', 'demo-branch')
      const menuItems = menuSections.flatMap((s) => s.items)
      const total = computeBasketTotal(basket, menuItems)
      await fetch(`${baseUrl}/api/receipts/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: basket.phone,
          name: basket.name,
          items: basket.items,
          total,
          sessionId,
        }),
      })
    } catch (err) {
      console.error('[webhook] SMS fire-and-forget failed:', err)
    }
  })()
}

type WebhookPayload = {
  sessionId: string
  basketId: string
  transactionId: string
  status: 'approved' | 'declined'
  paymentMethod: 'apple_pay' | 'google_pay' | 'card' | 'interac'
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('helcim-signature') ?? ''

  // Verify HMAC-SHA256 signature before processing any payload
  const webhookSecret = process.env.HELCIM_WEBHOOK_SECRET ?? ''
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as WebhookPayload
  const { sessionId, basketId, transactionId, status, paymentMethod } = payload

  const session = await getSession(sessionId)

  const basketIndex = session.baskets.findIndex((b) => b.userId === basketId)
  if (basketIndex === -1) {
    // Basket not found — still return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  }

  let updatedSession: typeof session

  if (status === 'approved' && session.paymentPlan === 'single') {
    // Whole-table payment: this one transaction covers every non-empty
    // basket, so every basket gets marked paid with the same transaction id.
    updatedSession = applyWholeTablePayment(session, transactionId, paymentMethod)
    fireSmsReceipt(updatedSession.baskets[basketIndex], sessionId)
  } else if (status === 'approved') {
    const updatedBaskets = [...session.baskets]
    updatedBaskets[basketIndex] = {
      ...updatedBaskets[basketIndex],
      paymentStatus: 'paid',
      helcimTransactionId: transactionId,
      paymentMethod,
    }
    updatedSession = { ...session, baskets: updatedBaskets }
    fireSmsReceipt(updatedSession.baskets[basketIndex], sessionId)
  } else {
    // declined — only the initiating basket failed; other baskets are
    // untouched and can still be paid independently
    const updatedBaskets = [...session.baskets]
    updatedBaskets[basketIndex] = {
      ...updatedBaskets[basketIndex],
      paymentStatus: 'failed',
    }
    updatedSession = { ...session, baskets: updatedBaskets }
  }

  // Advance to 'submitted' once every basket with items has been paid
  if (allBasketsPaid(updatedSession)) {
    updatedSession = { ...updatedSession, orderStatus: 'submitted' }
  }

  await setSession(sessionId, updatedSession)

  // Always 200 — Helcim will retry on non-2xx; we must not cause retries for
  // expected business events like declines.
  return NextResponse.json({ received: true })
}
