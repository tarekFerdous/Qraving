import { NextRequest, NextResponse } from 'next/server'
import type { BasketItem } from '@/lib/session'

type SmsRequestBody = {
  phone: string
  name: string
  items: BasketItem[]
  total: number
  sessionId: string
}

function buildSmsText(name: string, total: number, items: BasketItem[]): string {
  const itemsList = items.map((item) => `${item.name} x${item.quantity}`).join(', ')
  return `Thanks ${name}! Your Qraving order total: $${total.toFixed(2)} CAD. Items: ${itemsList}. Keep this as your receipt.`
}

export async function POST(req: NextRequest) {
  const { phone, name, items, total } = (await req.json()) as SmsRequestBody

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? ''

  const body = buildSmsText(name, total, items)
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({ From: fromNumber, To: phone, Body: body }).toString(),
    },
  )

  if (!twilioRes.ok) {
    const errorText = await twilioRes.text()
    console.error('[receipts/sms] Twilio error:', errorText)
    return NextResponse.json({ error: 'SMS delivery failed' }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
