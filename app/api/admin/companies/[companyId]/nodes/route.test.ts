import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { requireRole } from '@/lib/auth-server'
import { createNode, getCompany, isNodeInBranch } from '@/lib/company'

vi.mock('@/lib/auth-server', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/company', () => ({
  createNode: vi.fn(),
  getCompany: vi.fn(),
  isNodeInBranch: vi.fn(),
}))

const mockRequireRole = vi.mocked(requireRole)
const mockCreateNode = vi.mocked(createNode)
const mockGetCompany = vi.mocked(getCompany)
const mockIsNodeInBranch = vi.mocked(isNodeInBranch)

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/companies/company-1/nodes', {
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

describe('POST /api/admin/companies/[companyId]/nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompany.mockResolvedValue(baseCompany)
    mockCreateNode.mockResolvedValue('new-node-id')
  })

  it('manager creating a node under their own branch is allowed (201)', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'mgr-1', email: 'mgr@test.com', companyId: 'company-1', branchId: 'branch-1' }
      }
      return null
    })
    mockIsNodeInBranch.mockResolvedValue(true)

    const res = await callPost({ parentId: 'branch-1', label: 'Table 1', depth: 1, isLeaf: true })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ nodeId: 'new-node-id' })
    expect(mockIsNodeInBranch).toHaveBeenCalledWith('company-1', 'branch-1', 'branch-1')
    expect(mockCreateNode).toHaveBeenCalledWith('company-1', {
      parentId: 'branch-1',
      label: 'Table 1',
      depth: 1,
      isLeaf: true,
    })
  })

  it('manager creating a node with a parentId from another branch is rejected (403), no node created', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'mgr-1', email: 'mgr@test.com', companyId: 'company-1', branchId: 'branch-1' }
      }
      return null
    })
    mockIsNodeInBranch.mockResolvedValue(false)

    const res = await callPost({ parentId: 'other-branch-node', label: 'Table 1', depth: 1, isLeaf: true })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBeTruthy()
    expect(mockCreateNode).not.toHaveBeenCalled()
  })

  it('manager creating a node with parentId null is rejected (403), no node created', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'manager') {
        return { uid: 'mgr-1', email: 'mgr@test.com', companyId: 'company-1', branchId: 'branch-1' }
      }
      return null
    })

    const res = await callPost({ parentId: null, label: 'Root Node', depth: 0, isLeaf: false })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBeTruthy()
    expect(mockCreateNode).not.toHaveBeenCalled()
    expect(mockIsNodeInBranch).not.toHaveBeenCalled()
  })

  it('superadmin creating a node anywhere is allowed (201), unaffected by branch check', async () => {
    mockRequireRole.mockImplementation(async (role: string) => {
      if (role === 'superadmin') {
        return { uid: 'admin-1', email: 'admin@test.com' }
      }
      return null
    })

    const res = await callPost({ parentId: null, label: 'Branch 2', depth: 0, isLeaf: false })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ nodeId: 'new-node-id' })
    expect(mockIsNodeInBranch).not.toHaveBeenCalled()
    expect(mockCreateNode).toHaveBeenCalledWith('company-1', {
      parentId: null,
      label: 'Branch 2',
      depth: 0,
      isLeaf: false,
    })
  })
})
