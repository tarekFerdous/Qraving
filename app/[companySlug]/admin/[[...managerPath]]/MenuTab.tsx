'use client';

import { useState, useEffect, useRef } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
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
import CategoryItemsSection from '@/components/manager/CategoryItemsSection';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MenuTabProps {
  companyId: string;
  branchId: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
//
// This is the Menu tab body rendered (unconditionally, always-mounted) inside
// AdminShell. AdminShell toggles visibility purely via CSS `display`, so this
// component must never gate its own rendering on any "is this tab active"
// concept — doing so would defeat the whole point of keeping tabs mounted
// (in-progress edits, like an open inline rename or a half-typed new category
// name, must survive switching to another tab and back).

export default function MenuTab({ companyId, branchId }: MenuTabProps) {
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

  // ─── One-time fetch: menu publish state ─────────────────────────────────────

  useEffect(() => {
    getMenuConfig(companyId, branchId).then((config) => {
      setPublished(config?.published ?? false);
    });
  }, [companyId, branchId]);

  // ─── Real-time subscription: categories ──────────────────────────────────────

  useEffect(() => {
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

  async function handleTogglePublish() {
    if (published === null) return;
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
    if (!name) return;
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
    if (!id || !name) return;
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
    await reorderCategories(
      companyId,
      branchId,
      reordered.map((c) => c.id),
    );
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
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

                  {/* Items section */}
                  <div className="px-12 pb-4">
                    <CategoryItemsSection
                      companyId={companyId}
                      branchId={branchId}
                      categoryId={cat.id}
                    />
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
    </div>
  );
}
