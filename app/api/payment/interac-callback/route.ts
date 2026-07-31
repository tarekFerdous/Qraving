import { NextRequest, NextResponse } from 'next/server'
import { getSession, setSession } from '@/lib/session-firestore'
import { allBasketsPaid, applyWholeTablePayment, computeBasketTotal } from '@/lib/payment'
import { getMenu } from '@/lib/menu'
import type { UserBasket } from '@/lib/session'

function fireSmsReceipt(basket: UserBasket, sessionId: string, companyId: string, branchId: string): void {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  void (async () => {
    try {
      const menuSections = await getMenu(companyId, branchId)
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
  const companyId = searchParams.get('companyId') ?? ''
  const branchId = searchParams.get('branchId') ?? ''
  const sessionId = searchParams.get('sessionId') ?? ''
  const basketId = searchParams.get('basketId') ?? ''

  const session = await getSession(companyId, branchId, sessionId)

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

  let updatedSession: typeof session

  if (status === 'approved' && session.paymentPlan === 'single') {
    // Whole-table payment: this one transaction covers every non-empty
    // basket, so every basket gets marked paid with the same transaction id.
    updatedSession = applyWholeTablePayment(session, transactionId, 'interac')
    fireSmsReceipt(updatedSession.baskets[basketIndex], sessionId, companyId, branchId)
  } else if (status === 'approved') {
    const updatedBaskets = [...session.baskets]
    updatedBaskets[basketIndex] = {
      ...updatedBaskets[basketIndex],
      paymentStatus: 'paid',
      helcimTransactionId: transactionId,
      paymentMethod: 'interac',
    }
    updatedSession = { ...session, baskets: updatedBaskets }
    fireSmsReceipt(updatedSession.baskets[basketIndex], sessionId, companyId, branchId)
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

  await setSession(companyId, branchId, sessionId, updatedSession)

  return NextResponse.redirect(
    new URL(`/${sessionId}?payment=${status === 'approved' ? 'success' : 'failed'}`, req.url),
  )
}
