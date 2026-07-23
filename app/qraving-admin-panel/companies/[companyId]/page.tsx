'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, RefreshCw, ChevronDown, ChevronRight, Plus, PowerOff, Ban } from 'lucide-react';
import type { Company, CompanyNode } from '@/lib/company';
import { CompanyLogoSection } from '@/components/admin/CompanyLogoSection';

interface NodeWithQR extends CompanyNode {
  qrDataUrl?: string;
  publicUrl?: string;
  generating?: boolean;
}

function buildTree(nodes: NodeWithQR[]): Map<string | null, NodeWithQR[]> {
  const map = new Map<string | null, NodeWithQR[]>();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    const children = map.get(key) ?? [];
    children.push(node);
    map.set(key, children);
  }
  return map;
}

function NodeRow({
  node,
  company,
  depth,
  tree,
  onAddChild,
  onGenerateQR,
  onDeactivate,
}: {
  node: NodeWithQR;
  company: Company;
  depth: number;
  tree: Map<string | null, NodeWithQR[]>;
  onAddChild: (parentId: string, childDepth: number, isLeaf: boolean) => void;
  onGenerateQR: (nodeId: string) => void;
  onDeactivate: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = tree.get(node.id) ?? [];
  const layerLabel = company.layers[node.depth]?.label ?? `Layer ${node.depth + 1}`;
  const nextLayerLabel = company.layers[node.depth + 1]?.label;
  const isLastLayer = node.depth >= company.layers.length - 1;
  const childIsLeaf = node.depth + 1 >= company.layers.length - 1;
  const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);
  const isSchemaLeafLayer = firstLeafLayerIndex !== -1 && node.depth >= firstLeafLayerIndex;
  const superAdminCanAddChild = firstLeafLayerIndex === -1 || node.depth < firstLeafLayerIndex - 1;

  function downloadQR() {
    if (!node.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = node.qrDataUrl;
    a.download = `qr-${node.slug}.png`;
    a.click();
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group"
        style={{ marginLeft: `${depth * 20}px` }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 w-4 shrink-0"
        >
          {children.length > 0 ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-4 inline-block" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-900">{node.label}</span>
          <span className="ml-2 text-xs text-gray-400">/{node.slug}</span>
          <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{layerLabel}</span>
          {isSchemaLeafLayer && (
            <span className="ml-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Leaf</span>
          )}
        </div>

        {node.isLeaf && (
          <div className="flex items-center gap-2 shrink-0">
            {node.qrCode ? (
              <>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">QR generated</span>
                {node.qrDataUrl && (
                  <button
                    onClick={downloadQR}
                    className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                    title="Download QR PNG"
                  >
                    <Download size={14} />
                  </button>
                )}
                <button
                  onClick={() => onGenerateQR(node.id)}
                  disabled={node.generating}
                  className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Regenerate QR (invalidates old)"
                >
                  <RefreshCw size={14} className={node.generating ? 'animate-spin' : ''} />
                </button>
              </>
            ) : (
              <button
                onClick={() => onGenerateQR(node.id)}
                disabled={node.generating}
                className="px-2.5 py-1 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-60"
              >
                {node.generating ? 'Generating…' : 'Generate QR'}
              </button>
            )}
          </div>
        )}

        {!node.isLeaf && nextLayerLabel && superAdminCanAddChild && (
          <button
            onClick={() => onAddChild(node.id, node.depth + 1, childIsLeaf)}
            className="hidden group-hover:flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Plus size={12} />
            {nextLayerLabel}
          </button>
        )}

        <button
          onClick={() => onDeactivate(node.id)}
          className="hidden group-hover:block p-1.5 text-gray-300 hover:text-red-500 transition-colors"
          title="Deactivate"
        >
          <PowerOff size={14} />
        </button>
      </div>

      {node.qrCode && node.qrDataUrl && expanded && (
        <div
          className="ml-6 mb-3 flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200"
          style={{ marginLeft: `${depth * 20 + 24}px` }}
        >
          <img src={node.qrDataUrl} alt={`QR for ${node.label}`} className="w-24 h-24 rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 mb-1">Public URL</p>
            <p className="text-xs text-gray-500 break-all">{node.publicUrl}</p>
            <button
              onClick={downloadQR}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Download size={12} />
              Download PNG
            </button>
          </div>
        </div>
      )}

      {expanded && children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          company={company}
          depth={depth + 1}
          tree={tree}
          onAddChild={onAddChild}
          onGenerateQR={onGenerateQR}
          onDeactivate={onDeactivate}
        />
      ))}
    </div>
  );
}

interface AddNodeModal {
  parentId: string | null;
  depth: number;
  isLeaf: boolean;
}

export default function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [nodes, setNodes] = useState<NodeWithQR[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [addModal, setAddModal] = useState<AddNodeModal | null>(null);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [addingNode, setAddingNode] = useState(false);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateChoice, setDeactivateChoice] = useState<'soft' | 'hard' | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/companies/${companyId}`, { credentials: 'include' });
    if (!res.ok) {
      setLoadError('Failed to load company data. Please refresh the page.');
      setLoading(false);
      return;
    }
    const data = await res.json() as { company: Company; nodes: CompanyNode[] };
    setCompany(data.company);
    setNodes(data.nodes);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function handleAddNode() {
    if (!addModal || !newNodeLabel.trim()) return;
    setAddingNode(true);

    await fetch(`/api/admin/companies/${companyId}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        parentId: addModal.parentId,
        label: newNodeLabel.trim(),
        depth: addModal.depth,
        isLeaf: addModal.isLeaf,
      }),
    });

    setAddModal(null);
    setNewNodeLabel('');
    setAddingNode(false);
    await load();
  }

  async function handleGenerateQR(nodeId: string) {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, generating: true } : n));

    const res = await fetch(`/api/admin/companies/${companyId}/nodes/${nodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'generate-qr' }),
    });

    if (res.ok) {
      const data = await res.json() as { fullPath: string; publicUrl: string; qrDataUrl: string };
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, qrCode: 'generated', fullPath: data.fullPath, qrDataUrl: data.qrDataUrl, publicUrl: data.publicUrl, generating: false }
            : n,
        ),
      );
    } else {
      setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, generating: false } : n));
    }
  }

  async function handleDeactivate(nodeId: string) {
    if (!confirm('Deactivate this node? It will be hidden but not deleted.')) return;

    await fetch(`/api/admin/companies/${companyId}/nodes/${nodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'deactivate' }),
    });

    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }

  function closeDeactivateCompanyModal() {
    setDeactivateModalOpen(false);
    setDeactivateChoice(null);
    setDeactivateError('');
  }

  async function handleConfirmDeactivateCompany() {
    if (!deactivateChoice) return;
    setDeactivating(true);
    setDeactivateError('');

    try {
      const res =
        deactivateChoice === 'soft'
          ? await fetch(`/api/admin/companies/${companyId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ action: 'lock' }),
            })
          : await fetch(`/api/admin/companies/${companyId}`, {
              method: 'DELETE',
              credentials: 'include',
            });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDeactivateError(data.error ?? 'Something went wrong. Please try again.');
        setDeactivating(false);
        return;
      }

      router.push('/qraving-admin-panel');
    } catch {
      setDeactivateError('Network error. Please try again.');
      setDeactivating(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;
  if (loadError) return <div className="text-sm text-red-500">{loadError}</div>;
  if (!company) return null;

  const tree = buildTree(nodes);
  const rootNodes = tree.get(null) ?? [];
  const rootLayerLabel = company.layers[0]?.label ?? 'Branch';
  const rootIsLeaf = company.layers.length === 1;
  const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);
  const superAdminCanAddRoot = firstLeafLayerIndex === -1 || 0 < firstLeafLayerIndex;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">/{company.slug}</p>
        </div>
        <button
          type="button"
          onClick={() => setDeactivateModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shrink-0"
        >
          <Ban size={14} />
          Deactivate
        </button>
      </div>

      <CompanyLogoSection
        companyId={companyId}
        logoUrl={company.logoUrl}
        onLogoChange={(logoUrl) => setCompany((prev) => (prev ? { ...prev, logoUrl } : prev))}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-700">Venue hierarchy</h2>
          {superAdminCanAddRoot && (
            <button
              onClick={() => setAddModal({ parentId: null, depth: 0, isLeaf: rootIsLeaf })}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Plus size={14} />
              Add {rootLayerLabel}
            </button>
          )}
        </div>

        {rootNodes.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No {rootLayerLabel.toLowerCase()}s yet.</p>
            {superAdminCanAddRoot && (
              <button
                onClick={() => setAddModal({ parentId: null, depth: 0, isLeaf: rootIsLeaf })}
                className="mt-2 text-sm text-gray-700 underline underline-offset-2"
              >
                Add your first {rootLayerLabel.toLowerCase()} →
              </button>
            )}
          </div>
        ) : (
          <div>
            {rootNodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                company={company}
                depth={0}
                tree={tree}
                onAddChild={(parentId, depth, isLeaf) => setAddModal({ parentId, depth, isLeaf })}
                onGenerateQR={handleGenerateQR}
                onDeactivate={handleDeactivate}
              />
            ))}
          </div>
        )}
      </div>

      {addModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Add {company.layers[addModal.depth]?.label ?? 'node'}
            </h3>
            <input
              type="text"
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNode()}
              placeholder="Display name"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setAddModal(null); setNewNodeLabel(''); }}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNode}
                disabled={addingNode || !newNodeLabel.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-60"
              >
                {addingNode ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Deactivate company</h3>
            <p className="text-xs text-gray-400 mb-4">Choose how you want to deactivate {company.name}.</p>

            <div className="space-y-2 mb-4">
              <button
                type="button"
                onClick={() => setDeactivateChoice('soft')}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  deactivateChoice === 'soft' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Soft Delete</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Locks the company. Public pages and manager logins are blocked. Fully reversible via Restore.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDeactivateChoice('hard')}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  deactivateChoice === 'hard' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Hard Delete</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permanently deletes everything — company data, managers, and storage assets. Cannot be undone.
                </p>
              </button>
            </div>

            {deactivateError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {deactivateError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeDeactivateCompanyModal}
                disabled={deactivating}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              {deactivateChoice && (
                <button
                  type="button"
                  onClick={handleConfirmDeactivateCompany}
                  disabled={deactivating}
                  className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-60 ${
                    deactivateChoice === 'soft' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {deactivating
                    ? 'Working…'
                    : deactivateChoice === 'soft'
                    ? 'Yes, soft delete this company'
                    : 'Yes, permanently delete this company'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
