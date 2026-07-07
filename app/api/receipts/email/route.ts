import { NextRequest, NextResponse } from 'next/server'
import type { BasketItem } from '@/lib/session'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type EmailRequestBody = {
  email: string
  name: string
  items: BasketItem[]
  total: number
  sessionId: string
}

export async function POST(req: NextRequest) {
  const { email, name, total, sessionId } = (await req.json()) as EmailRequestBody

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  console.log('[receipts/email] stub:', { email, name, total, sessionId })

  return NextResponse.json({ sent: true })
}
