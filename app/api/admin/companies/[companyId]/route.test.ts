import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH, DELETE } from './route'
import { requireRole } from '@/lib/auth-server'
import { getCompany, hardDeleteCompany, lockCompany, restoreCompany } from '@/lib/company'

vi.mock('@/lib/auth-server', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/company', () => ({
  getCompany: vi.fn(),
  getNodes: vi.fn(),
  lockCompany: vi.fn(),
  restoreCompany: vi.fn(),
  hardDeleteCompany: vi.fn(),
}))

const mockRequireRole = vi.mocked(requireRole)
const mockGetCompany = vi.mocked(getCompany)
const mockHardDeleteCompany = vi.mocked(hardDeleteCompany)
const mockLockCompany = vi.mocked(lockCompany)
const mockRestoreCompany = vi.mocked(restoreCompany)

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1', {
    method: 'DELETE',
  })
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function callDelete() {
  return DELETE(makeRequest(), { params: Promise.resolve({ companyId: 'company-1' }) })
}

function callPatch(body: unknown) {
  return PATCH(makePatchRequest(body), { params: Promise.resolve({ companyId: 'company-1' }) })
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

describe('DELETE /api/admin/companies/[companyId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompany.mockResolvedValue(baseCompany)
  })

  it('rejects a non-superadmin request with 401, no hard delete performed', async () => {
    mockRequireRole.mockResolvedValue(null)

    const res = await callDelete()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBeTruthy()
    expect(mockHardDeleteCompany).not.toHaveBeenCalled()
  })

  it('superadmin hard-deleting a company invokes hardDeleteCompany and returns 200', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })

    const res = await callDelete()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockHardDeleteCompany).toHaveBeenCalledWith('company-1')
  })

  it('returns 404 when the company does not exist, no hard delete performed', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })
    mockGetCompany.mockResolvedValue(null)

    const res = await callDelete()
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBeTruthy()
    expect(mockHardDeleteCompany).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/companies/[companyId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompany.mockResolvedValue(baseCompany)
  })

  it('rejects a non-superadmin lock request with 401, no lock performed', async () => {
    mockRequireRole.mockResolvedValue(null)

    const res = await callPatch({ action: 'lock' })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBeTruthy()
    expect(mockLockCompany).not.toHaveBeenCalled()
  })

  it('rejects a non-superadmin restore request with 401, no restore performed', async () => {
    mockRequireRole.mockResolvedValue(null)

    const res = await callPatch({ action: 'restore' })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBeTruthy()
    expect(mockRestoreCompany).not.toHaveBeenCalled()
  })

  it('superadmin locking a company invokes lockCompany and returns 200', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })

    const res = await callPatch({ action: 'lock' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockLockCompany).toHaveBeenCalledWith('company-1')
    expect(mockRestoreCompany).not.toHaveBeenCalled()
  })

  it('superadmin restoring a company invokes restoreCompany and returns 200', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })

    const res = await callPatch({ action: 'restore' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockRestoreCompany).toHaveBeenCalledWith('company-1')
    expect(mockLockCompany).not.toHaveBeenCalled()
  })

  it('returns 404 when the company does not exist, no lock/restore performed', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })
    mockGetCompany.mockResolvedValue(null)

    const res = await callPatch({ action: 'lock' })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBeTruthy()
    expect(mockLockCompany).not.toHaveBeenCalled()
  })

  it('returns 400 for an unknown action, no lock/restore performed', async () => {
    mockRequireRole.mockResolvedValue({ uid: 'admin-1', email: 'admin@test.com' })

    const res = await callPatch({ action: 'bogus' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBeTruthy()
    expect(mockLockCompany).not.toHaveBeenCalled()
    expect(mockRestoreCompany).not.toHaveBeenCalled()
  })
})
