import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/receipts/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  email: 'alice@example.com',
  name: 'Alice',
  items: [],
  total: 24,
  sessionId: 'sess-1',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/receipts/email', () => {
  it('returns 200 for a valid email address', async () => {
    const req = makeRequest(validBody)
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 400 with error message for a plain string (no @ or domain)', async () => {
    const req = makeRequest({ ...validBody, email: 'foo' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid email address' })
  })

  it('returns 400 for "foo@" (missing domain)', async () => {
    const req = makeRequest({ ...validBody, email: 'foo@' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid email address' })
  })

  it('returns 400 for "@bar.com" (missing local part)', async () => {
    const req = makeRequest({ ...validBody, email: '@bar.com' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid email address' })
  })

  it('returns 400 for "foo @bar.com" (space in local part)', async () => {
    const req = makeRequest({ ...validBody, email: 'foo @bar.com' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid email address' })
  })
})
