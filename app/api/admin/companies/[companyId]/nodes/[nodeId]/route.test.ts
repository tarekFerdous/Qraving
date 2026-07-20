import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { requireRole } from '@/lib/auth-server'
import { generateQRCode, deactivateNode, isNodeInBranch } from '@/lib/company'

vi.mock('@/lib/auth-server', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/company', () => ({
  generateQRCode: vi.fn(),
  deactivateNode: vi.fn(),
  isNodeInBranch: vi.fn(),
}))

const mockRequireRole = vi.mocked(requireRole)
const mockGenerateQRCode = vi.mocked(generateQRCode)
const mockDeactivateNode = vi.mocked(deactivateNode)
const mockIsNodeInBranch = vi.mocked(isNodeInBranch)

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1/nodes/node-1', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function callPost(body: unknown, nodeId = 'node-1') {
  return POST(makeRequest(body), { params: Promise.resolve({ companyId: 'company-1', nodeId }) })
}

function mockAsManager(branchId = 'branch-1') {
  mockRequireRole.mockImplementation(async (role: string) => {
    if (role === 'manager') {
      return { uid: 'mgr-1', email: 'mgr@test.com', companyId: 'company-1', branchId }
    }
    return null
  })
}

function mockAsSuperadmin() {
  mockRequireRole.mockImplementation(async (role: string) => {
    if (role === 'superadmin') {
      return { uid: 'admin-1', email: 'admin@test.com' }
    }
    return null
  })
}

describe('POST /api/admin/companies/[companyId]/nodes/[nodeId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateQRCode.mockResolvedValue('/test-co/branch-1/table-1/ABC12345')
    mockDeactivateNode.mockResolvedValue(undefined)
  })

  describe('generate-qr action', () => {
    it('manager on own-branch node is allowed', async () => {
      mockAsManager()
      mockIsNodeInBranch.mockResolvedValue(true)

      const res = await callPost({ action: 'generate-qr' })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.fullPath).toBe('/test-co/branch-1/table-1/ABC12345')
      expect(mockIsNodeInBranch).toHaveBeenCalledWith('company-1', 'node-1', 'branch-1')
      expect(mockGenerateQRCode).toHaveBeenCalledWith('company-1', 'node-1')
    })

    it('manager on other-branch node is rejected (403), generateQRCode not called', async () => {
      mockAsManager()
      mockIsNodeInBranch.mockResolvedValue(false)

      const res = await callPost({ action: 'generate-qr' })
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBeTruthy()
      expect(mockGenerateQRCode).not.toHaveBeenCalled()
    })

    it('superadmin on any node is allowed, unaffected by branch check', async () => {
      mockAsSuperadmin()

      const res = await callPost({ action: 'generate-qr' })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.fullPath).toBe('/test-co/branch-1/table-1/ABC12345')
      expect(mockIsNodeInBranch).not.toHaveBeenCalled()
      expect(mockGenerateQRCode).toHaveBeenCalledWith('company-1', 'node-1')
    })
  })

  describe('deactivate action', () => {
    it('manager on own-branch node is allowed', async () => {
      mockAsManager()
      mockIsNodeInBranch.mockResolvedValue(true)

      const res = await callPost({ action: 'deactivate' })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ success: true })
      expect(mockIsNodeInBranch).toHaveBeenCalledWith('company-1', 'node-1', 'branch-1')
      expect(mockDeactivateNode).toHaveBeenCalledWith('company-1', 'node-1')
    })

    it('manager on other-branch node is rejected (403), deactivateNode not called', async () => {
      mockAsManager()
      mockIsNodeInBranch.mockResolvedValue(false)

      const res = await callPost({ action: 'deactivate' })
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toBeTruthy()
      expect(mockDeactivateNode).not.toHaveBeenCalled()
    })

    it('superadmin on any node is allowed, unaffected by branch check', async () => {
      mockAsSuperadmin()

      const res = await callPost({ action: 'deactivate' })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ success: true })
      expect(mockIsNodeInBranch).not.toHaveBeenCalled()
      expect(mockDeactivateNode).toHaveBeenCalledWith('company-1', 'node-1')
    })
  })
})
