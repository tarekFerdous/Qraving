'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { GripVertical, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase-client';
import { useAuth, clearFirebaseTokenCookie } from '@/lib/auth';
import {
  Category,
  getMenuConfig,
  setMenuPublished,
  subscribeCategories,
  createCategory,
  updateCategoryName,
  reorderCategories,
  deleteCategory,
} from '@/lib/manager-menu';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MenuEditorPage() {
  const router = useRouter();
  const params = useParams();
  const companySlug = params.companySlug as string;
  const branchSlug = params.branchSlug as string;

  const { user, role, companyId, branchId, companySlug: authCompanySlug, loading } = useAuth();

  // Publish state
  const [published, setPublished] = useState<boolean | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);

  // Category list (real-time)
  const [categories, setCategories] = useState<Category[]>([]);

  // New category inline input
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const newCatInputRef = useRef<HTMLInputElement>(null);

  // Inline name editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // ─── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'manager') {
      router.replace(`/${companySlug}/login`);
      return;
    }
    if (authCompanySlug && authCompanySlug !== companySlug) {
      router.replace(`/${companySlug}/login`);
    }
  }, [user, role, loading, companySlug, authCompanySlug, router]);

  // ─── One-time fetch: menu publish state ─────────────────────────────────────

  useEffect(() => {
    if (!companyId || !branchId) return;
    getMenuConfig(companyId, branchId).then((config) => {
      setPublished(config?.published ?? false);
    });
  }, [companyId, branchId]);

  // ─── Real-time subscription: categories ──────────────────────────────────────

  useEffect(() => {
    if (!companyId || !branchId) return;
    const unsub = subscribeCategories(companyId, branchId, (cats) => {
      setCategories(cats);
    });
    return unsub;
  }, [companyId, branchId]);

  // ─── Focus helpers ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (showNewCatInput) {
      newCatInputRef.current?.focus();
    }
  }, [showNewCatInput]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleSignOut() {
    clearFirebaseTokenCookie();
    await signOut(auth);
    router.replace(`/${companySlug}/login`);
  }

  async function handleTogglePublish() {
    if (!companyId || !branchId || published === null) return;
    const next = !published;
    setPublished(next); // optimistic update
    setPublishLoading(true);
    try {
      await setMenuPublished(companyId, branchId, next);
    } catch {
      setPublished(!next); // revert on error
    } finally {
      setPublishLoading(false);
    }
  }

  async function handleCreateCategory() {
    const name = newCatName.trim();
    setNewCatName('');
    setShowNewCatInput(false);
    if (!name || !companyId || !branchId) return;
    await createCategory(companyId, branchId, name);
  }

  function handleNewCatKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // triggers onBlur → handleCreateCategory
    } else if (e.key === 'Escape') {
      setNewCatName('');
      setShowNewCatInput(false);
    }
  }

  function startEditing(cat: Category) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  async function commitEdit() {
    const id = editingId;
    const name = editingName.trim();
    setEditingId(null);
    if (!id || !name || !companyId || !branchId) return;
    const current = categories.find((c) => c.id === id);
    if (current && current.name === name) return; // no change
    await updateCategoryName(companyId, branchId, id, name);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // triggers onBlur → commitEdit
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  }

  async function handleDelete(cat: Category) {
    if (!companyId || !branchId) return;
    const confirmed = window.confirm(`Delete category "${cat.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteCategory(companyId, branchId, cat.id);
  }

  // ─── Drag-and-drop handlers ──────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }

  async function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const reordered = [...categories];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setCategories(reordered);
    setDragIndex(null);
    setDropIndex(null);
    if (companyId && branchId) {
      await reorderCategories(
        companyId,
        branchId,
        reordered.map((c) => c.id),
      );
    }
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  // ─── Loading / auth gate ─────────────────────────────────────────────────────

  if (loading || !user || role !== 'manager') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const companyDisplayName = capitalize(companySlug);
  const branchDisplayName = capitalize(branchSlug);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">
              {companyDisplayName}
            </h1>
            <p className="text-xs text-gray-500">{branchDisplayName}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Nav tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 border-t border-gray-100">
          <Link
            href={`/${companySlug}/${branchSlug}`}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Dashboard
          </Link>
          <span className="px-3 py-2 text-sm font-medium text-gray-900 border-b-2 border-gray-900">
            Menu
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Publish / Draft toggle */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          {published === null ? (
            <span className="text-sm text-gray-400">Loading…</span>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${
                  published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${published ? 'bg-green-500' : 'bg-gray-400'}`}
                />
                {published ? 'Published' : 'Draft'}
              </span>
              <button
                onClick={handleTogglePublish}
                disabled={publishLoading}
                className="text-sm font-medium text-gray-700 underline hover:no-underline disabled:opacity-50 transition-opacity"
              >
                {publishLoading ? '…' : published ? 'Unpublish' : 'Publish'}
              </button>
            </>
          )}
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Categories</h2>
          </div>

          {categories.length === 0 && !showNewCatInput ? (
            /* Empty state */
            <div className="px-5 py-10 text-center">
              <button
                onClick={() => setShowNewCatInput(true)}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline decoration-dashed underline-offset-2"
              >
                + Create a category
              </button>
            </div>
          ) : (
            <>
              <ul>
                {categories.map((cat, index) => (
                  <li
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={[
                      'border-b border-gray-100 last:border-b-0 transition-all duration-100',
                      dragIndex === index ? 'opacity-50' : 'opacity-100',
                      dropIndex === index && dragIndex !== index ? 'bg-blue-50' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {/* Category row */}
                    <div className="flex items-center gap-3 px-5 py-3">
                      {/* Drag handle */}
                      <span className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0">
                        <GripVertical size={16} />
                      </span>

                      {/* Name / inline edit input */}
                      {editingId === cat.id ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleEditKeyDown}
                          className="flex-1 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                      ) : (
                        <button
                          onClick={() => startEditing(cat)}
                          className="flex-1 text-left text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors py-1"
                        >
                          {cat.name}
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(cat)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-1 rounded"
                        aria-label={`Delete category ${cat.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Items placeholder */}
                    <div className="px-12 pb-3">
                      <p className="text-xs text-gray-400 italic">
                        No items yet — items editor coming soon
                      </p>
                    </div>
                  </li>
                ))}

                {/* Inline new-category input (appended to list) */}
                {showNewCatInput && (
                  <li className="border-t border-gray-100 px-5 py-3 flex items-center gap-3">
                    <span className="text-gray-200 shrink-0">
                      <GripVertical size={16} />
                    </span>
                    <input
                      ref={newCatInputRef}
                      type="text"
                      placeholder="Category name"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onBlur={handleCreateCategory}
                      onKeyDown={handleNewCatKeyDown}
                      className="flex-1 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </li>
                )}
              </ul>

              {/* Add category button */}
              {!showNewCatInput && (
                <div className="px-5 py-4 border-t border-gray-100">
                  <button
                    onClick={() => setShowNewCatInput(true)}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    + Add category
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
