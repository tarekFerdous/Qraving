import { NextRequest, NextResponse } from 'next/server'
import { getSession, setSession } from '@/lib/session-firestore'
import { allBasketsPaid, computeBasketTotal } from '@/lib/payment'
import { getMenu } from '@/lib/menu'
import type { UserBasket } from '@/lib/session'

function fireSmsReceipt(basket: UserBasket, sessionId: string): void {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  void (async () => {
    try {
      const menuSections = await getMenu()
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
      console.error('[interac-callback] SMS fire-and-forget failed:', err)
    }
  })()
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const transactionId = searchParams.get('transactionId') ?? ''
  const status = searchParams.get('status') ?? ''
  const sessionId = searchParams.get('sessionId') ?? ''
  const basketId = searchParams.get('basketId') ?? ''

  const session = await getSession(sessionId)

  const basketIndex = session.baskets.findIndex((b) => b.userId === basketId)

  // Unknown basket — still redirect gracefully
  if (basketIndex === -1) {
    return NextResponse.redirect(
      new URL(`/${sessionId}?payment=${status === 'approved' ? 'success' : 'failed'}`, req.url),
    )
  }

  const basket = session.baskets[basketIndex]

  // Idempotency: already paid — skip all updates and redirect success
  if (basket.paymentStatus === 'paid') {
    return NextResponse.redirect(new URL(`/${sessionId}?payment=success`, req.url))
  }

  const updatedBaskets = [...session.baskets]

  if (status === 'approved') {
    updatedBaskets[basketIndex] = {
      ...updatedBaskets[basketIndex],
      paymentStatus: 'paid',
      helcimTransactionId: transactionId,
      paymentMethod: 'interac',
    }
    fireSmsReceipt(updatedBaskets[basketIndex], sessionId)
  } else {
    updatedBaskets[basketIndex] = {
      ...updatedBaskets[basketIndex],
      paymentStatus: 'failed',
    }
  }

  let updatedSession = { ...session, baskets: updatedBaskets }

  // Advance to 'submitted' once every basket with items has been paid
  if (allBasketsPaid(updatedSession)) {
    updatedSession = { ...updatedSession, orderStatus: 'submitted' }
  }

  await setSession(sessionId, updatedSession)

  return NextResponse.redirect(
    new URL(`/${sessionId}?payment=${status === 'approved' ? 'success' : 'failed'}`, req.url),
  )
}
