import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

interface OrderItem {
  itemId: string
  name: string
  quantity: number
  price: number
  customizations: {
    size: string
    addOns: string[]
  }
}

interface OrderUser {
  name: string
  phone: string
  email?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    companyId: string
    branchId: string
    sessionId: string
    items: OrderItem[]
    totalCents: number
    user: OrderUser
  }

  const { companyId, branchId, sessionId, items, totalCents, user } = body

  if (!companyId || !branchId || !sessionId || !items || totalCents == null || !user) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const orderRef = adminDb
    .collection(`companies/${companyId}/branches/${branchId}/orders`)
    .doc()
  await orderRef.set({
    companyId,
    branchId,
    tableNodeId: sessionId, // placeholder — full node mapping is out of scope for this version
    sessionId,
    items,
    totalCents,
    paidAt: Timestamp.now(),
    user,
    status: 'pending',
  })

  return NextResponse.json({ orderId: orderRef.id })
}
