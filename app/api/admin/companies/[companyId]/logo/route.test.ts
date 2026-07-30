import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { requireRole } from '@/lib/auth-server'
import { getCompany, setCompanyLogo, clearCompanyLogo } from '@/lib/company'
import { del } from '@vercel/blob'

vi.mock('@/lib/auth-server', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/company', () => ({
  getCompany: vi.fn(),
  setCompanyLogo: vi.fn(),
  clearCompanyLogo: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({
  del: vi.fn(),
}))

const mockRequireRole = vi.mocked(requireRole)
const mockGetCompany = vi.mocked(getCompany)
const mockSetCompanyLogo = vi.mocked(setCompanyLogo)
const mockClearCompanyLogo = vi.mocked(clearCompanyLogo)
const mockDel = vi.mocked(del)

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1/logo', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function callPost(body: unknown) {
  return POST(makeRequest(body), { params: Promise.resolve({ companyId: 'company-1' }) })
}

const baseCompany = {
  id: 'company-1',
  name: 'Test Co',
  slug: 'test-co',
  layers: [
    { index: 0, label: 'Branch', isLeafLayer: false },
    { index: 1, label: 'Table', isLeafLayer: true },
  ],
  managerLayerIndex: 0,
  createdAt: {} as never,
}

describe('POST /api/admin/companies/[companyId]/logo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompany.mockResolvedValue(baseCompany)
    mockDel.mockResolvedValue(undefined)
  })

  it('rejects a non-superadmin request with 401, no mutation performed', async () => {
    mockRequireRole.mockResolvedValue(null)

    const res = await callPost({ action: 'set', logoUrl: 'https://storage.example.com/logo.png' })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBeTruthy()
    expect(mockSetCompanyLogo).not.toHaveBeenCalled()
    expect(mockClearCompanyLogo).not.toHaveBeenCalled()
  })

  it('superadmin setting a logo persists logoUrl and returns the previous value (200)', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })
    mockGetCompany.mockResolvedValue({ ...baseCompany, logoUrl: 'https://storage.example.com/old-logo.png' })

    const res = await callPost({ action: 'set', logoUrl: 'https://storage.example.com/new-logo.png' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      logoUrl: 'https://storage.example.com/new-logo.png',
      previousLogoUrl: 'https://storage.example.com/old-logo.png',
    })
    expect(mockSetCompanyLogo).toHaveBeenCalledWith('company-1', 'https://storage.example.com/new-logo.png')
    expect(mockDel).toHaveBeenCalledWith('https://storage.example.com/old-logo.png')
  })

  it('superadmin removing a logo clears logoUrl and returns the previous value (200)', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })
    mockGetCompany.mockResolvedValue({ ...baseCompany, logoUrl: 'https://storage.example.com/old-logo.png' })

    const res = await callPost({ action: 'remove' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ previousLogoUrl: 'https://storage.example.com/old-logo.png' })
    expect(mockClearCompanyLogo).toHaveBeenCalledWith('company-1')
    expect(mockDel).toHaveBeenCalledWith('https://storage.example.com/old-logo.png')
  })

  it('returns 404 when the company does not exist', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })
    mockGetCompany.mockResolvedValue(null)

    const res = await callPost({ action: 'set', logoUrl: 'https://storage.example.com/new-logo.png' })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBeTruthy()
    expect(mockSetCompanyLogo).not.toHaveBeenCalled()
  })
})
