import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import type { BasketItem } from '@/lib/session'

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

vi.stubGlobal('fetch', vi.fn())

const mockFetch = fetch as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<BasketItem> = {}): BasketItem {
  return {
    itemId: 'item-1',
    name: 'Burger',
    size: 'Medium',
    addOns: [],
    instructions: '',
    quantity: 2,
    isShared: false,
    sharerIds: null,
    ...overrides,
  }
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/receipts/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function twilioOkResponse() {
  return {
    ok: true,
    json: async () => ({ sid: 'SM123' }),
    text: async () => '{}',
  }
}

function twilioErrorResponse() {
  return {
    ok: false,
    text: async () => 'Authentication failed',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/receipts/sms', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123'
    process.env.TWILIO_AUTH_TOKEN = 'authtoken456'
    process.env.TWILIO_FROM_NUMBER = '+15551234567'
    mockFetch.mockReset()
  })

  it('calls Twilio with correct URL and Basic auth header, returns 200', async () => {
    mockFetch.mockResolvedValueOnce(twilioOkResponse())

    const req = makeRequest({
      phone: '+14161234567',
      name: 'Alice',
      items: [makeItem({ name: 'Burger', quantity: 2 })],
      total: 24,
      sessionId: 'sess-1',
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]

    // Correct Twilio Messages endpoint
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json')

    // Basic auth: base64(accountSid:authToken)
    const expectedCredentials = Buffer.from('ACtest123:authtoken456').toString('base64')
    expect(options.headers['Authorization']).toBe(`Basic ${expectedCredentials}`)

    // Form-encoded body contains the correct To/From fields
    const params = new URLSearchParams(options.body as string)
    expect(params.get('To')).toBe('+14161234567')
    expect(params.get('From')).toBe('+15551234567')
  })

  it('SMS body contains customer name, total formatted as $X.XX CAD, and items list', async () => {
    mockFetch.mockResolvedValueOnce(twilioOkResponse())

    const req = makeRequest({
      phone: '+14161234567',
      name: 'Alice',
      items: [
        makeItem({ name: 'Burger', quantity: 2 }),
        makeItem({ itemId: 'item-2', name: 'Fries', quantity: 1 }),
      ],
      total: 24,
      sessionId: 'sess-1',
    })

    await POST(req)

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const params = new URLSearchParams(options.body as string)
    const smsBody = params.get('Body') ?? ''

    expect(smsBody).toContain('Alice')
    expect(smsBody).toContain('$24.00 CAD')
    expect(smsBody).toContain('Burger x2')
    expect(smsBody).toContain('Fries x1')
  })

  it('formats total to exactly 2 decimal places', async () => {
    mockFetch.mockResolvedValueOnce(twilioOkResponse())

    const req = makeRequest({
      phone: '+14161234567',
      name: 'Bob',
      items: [makeItem({ name: 'Coffee', quantity: 1 })],
      total: 5.5,
      sessionId: 'sess-2',
    })

    await POST(req)

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const params = new URLSearchParams(options.body as string)
    const smsBody = params.get('Body') ?? ''

    expect(smsBody).toContain('$5.50 CAD')
  })

  it('returns 500 when Twilio responds with a non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce(twilioErrorResponse())

    const req = makeRequest({
      phone: '+14161234567',
      name: 'Bob',
      items: [makeItem({ name: 'Pizza', quantity: 1 })],
      total: 15,
      sessionId: 'sess-2',
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('does not throw on Twilio error — resolves to a Response without rejecting', async () => {
    mockFetch.mockResolvedValueOnce(twilioErrorResponse())

    const req = makeRequest({
      phone: '+14161234567',
      name: 'Charlie',
      items: [makeItem({ name: 'Salad', quantity: 3 })],
      total: 30,
      sessionId: 'sess-3',
    })

    // Should resolve (not reject) even when Twilio returns an error
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
