'use client';

import { useState } from 'react';
import { Download, RefreshCw, PowerOff, Plus, X, Check, QrCode } from 'lucide-react';
import type { LayerConfig, CompanyNode } from '@/lib/company';

interface NodeWithQR extends CompanyNode {
  qrDataUrl?: string;
  publicUrl?: string;
  generating?: boolean;
}

interface Props {
  companyId: string;
  companyName: string;
  layers: LayerConfig[];
  managerNodeId: string;
  ancestorLabels: string[];
  initialDescendants: CompanyNode[];
  firstLeafLayerIndex: number;
}

export default function ManagerAdminPanel({
  companyId,
  companyName,
  layers,
  managerNodeId,
  ancestorLabels,
  initialDescendants,
  firstLeafLayerIndex,
}: Props) {
  const [nodes, setNodes] = useState<NodeWithQR[]>(initialDescendants);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [addingDepth, setAddingDepth] = useState(firstLeafLayerIndex);
  const [addingLabel, setAddingLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null);

  const lastLayerIndex = layers.length - 1;

  function childrenOf(parentId: string): NodeWithQR[] {
    return nodes.filter((n) => n.parentId === parentId);
  }

  function showAddForm(parentId: string, depth: number) {
    setAddingParentId(parentId);
    setAddingDepth(depth);
    setAddingLabel('');
  }

  function hideAddForm() {
    setAddingParentId(null);
    setAddingLabel('');
  }

  async function handleAdd() {
    if (!addingLabel.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          parentId: addingParentId,
          label: addingLabel.trim(),
          depth: addingDepth,
          isLeaf: addingDepth >= lastLayerIndex,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { nodeId: string };
        const slug = addingLabel
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-');
        const newNode: NodeWithQR = {
          id: data.nodeId,
          parentId: addingParentId,
          label: addingLabel.trim(),
          slug,
          depth: addingDepth,
          isLeaf: addingDepth >= lastLayerIndex,
          qrCode: null,
          fullPath: null,
          active: true,
          createdAt: null as unknown as ReturnType<typeof import('firebase-admin/firestore').Timestamp.now>,
        };
        setNodes((prev) => [...prev, newNode]);
        hideAddForm();
      }
    } finally {
      setSaving(false);
    }
  }

  async function doGenerateQR(nodeId: string) {
    setConfirmRegenId(null);
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, generating: true } : n)));

    const res = await fetch(`/api/admin/companies/${companyId}/nodes/${nodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'generate-qr' }),
    });

    if (res.ok) {
      const data = (await res.json()) as { fullPath: string; publicUrl: string; qrDataUrl: string };
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, qrCode: 'generated', fullPath: data.fullPath, qrDataUrl: data.qrDataUrl, publicUrl: data.publicUrl, generating: false }
            : n,
        ),
      );
    } else {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, generating: false } : n)));
    }
  }

  async function handleDeactivate(nodeId: string) {
    await fetch(`/api/admin/companies/${companyId}/nodes/${nodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'deactivate' }),
    });
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }

  function downloadQR(node: NodeWithQR) {
    if (!node.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = node.qrDataUrl;
    a.download = `qr-${node.slug}.png`;
    a.click();
  }

  function renderNode(node: NodeWithQR): React.ReactNode {
    const children = childrenOf(node.id);
    const nextDepth = node.depth + 1;
    const nextLayerLabel = layers[nextDepth]?.label;
    const isDeepestLeaf = node.depth >= lastLayerIndex;
    const isAddingHere = addingParentId === node.id;

    return (
      <div key={node.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900">{node.label}</span>
            <span className="ml-2 text-xs text-gray-400">/{node.slug}</span>
          </div>
          <button
            onClick={() => handleDeactivate(node.id)}
            className="ml-2 shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
            title="Deactivate"
          >
            <PowerOff size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {isDeepestLeaf && (
            <div>
              {node.qrCode ? (
                <div className="space-y-2">
                  {node.qrDataUrl && (
                    <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <img src={node.qrDataUrl} alt="QR code" className="w-20 h-20 rounded shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 break-all mb-2">{node.publicUrl}</p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => downloadQR(node)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            <Download size={12} />
                            Download PNG
                          </button>
                          <button
                            onClick={() => setConfirmRegenId(node.id)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <RefreshCw size={12} />
                            Regenerate
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!node.qrDataUrl && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">QR generated</span>
                      <button onClick={() => setConfirmRegenId(node.id)} className="text-gray-400 hover:text-gray-700">
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => doGenerateQR(node.id)}
                  disabled={node.generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-60"
                >
                  <QrCode size={12} />
                  {node.generating ? 'Generating…' : 'Generate QR Code'}
                </button>
              )}

              {confirmRegenId === node.id && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800 mb-2">
                    Are you sure? You will need to replace the physical QR code.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmRegenId(null)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <X size={11} />
                      Cancel
                    </button>
                    <button
                      onClick={() => doGenerateQR(node.id)}
                      disabled={node.generating}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                      <Check size={11} />
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isDeepestLeaf && nextLayerLabel && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{nextLayerLabel}</p>
              <div className="space-y-0 pl-2 border-l border-gray-100">
                {children.map((child) => renderNode(child))}
              </div>

              {isAddingHere ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={addingLabel}
                    onChange={(e) => setAddingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd();
                      if (e.key === 'Escape') hideAddForm();
                    }}
                    placeholder={`${nextLayerLabel} name`}
                    autoFocus
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={saving || !addingLabel.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button onClick={hideAddForm} className="p-1.5 text-gray-400 hover:text-gray-700">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => showAddForm(node.id, nextDepth)}
                  className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Plus size={12} />
                  Add {nextLayerLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const topLevelNodes = childrenOf(managerNodeId);
  const topLayerLabel = layers[firstLeafLayerIndex]?.label ?? `Layer ${firstLeafLayerIndex + 1}`;
  const isAddingTopLevel = addingParentId === managerNodeId;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-base font-bold text-gray-900 leading-tight">{companyName}</h1>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-xs text-gray-400">{companyName}</span>
            {ancestorLabels.map((label, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-gray-300">/</span>
                <span className={`text-xs ${i === ancestorLabels.length - 1 ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
                  {label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{topLayerLabel}</h2>

          <div>{topLevelNodes.map((node) => renderNode(node))}</div>

          {isAddingTopLevel ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={addingLabel}
                onChange={(e) => setAddingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') hideAddForm();
                }}
                placeholder={`${topLayerLabel} name`}
                autoFocus
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              />
              <button
                onClick={handleAdd}
                disabled={saving || !addingLabel.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-60"
              >
                Save
              </button>
              <button onClick={hideAddForm} className="p-1.5 text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => showAddForm(managerNodeId, firstLeafLayerIndex)}
              className="mt-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Plus size={14} />
              Add {topLayerLabel}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
