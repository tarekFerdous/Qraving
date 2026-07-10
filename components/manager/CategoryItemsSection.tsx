'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { subscribeItems, updateItem, deleteItem, MenuItem } from '@/lib/manager-menu';
import ItemForm from './ItemForm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryItemsSectionProps {
  companyId: string;
  branchId: string;
  categoryId: string;
}

// ─── Dietary tag colours ──────────────────────────────────────────────────────

const DIETARY_COLOURS: Record<string, string> = {
  vegan: 'bg-green-100 text-green-700',
  vegetarian: 'bg-green-100 text-green-700',
  halal: 'bg-teal-100 text-teal-700',
  'gluten-free': 'bg-yellow-100 text-yellow-700',
  'nut-free': 'bg-orange-100 text-orange-700',
  'dairy-free': 'bg-blue-100 text-blue-700',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onEdit,
  onDelete,
  onToggleAvailable,
}: {
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onToggleAvailable: (item: MenuItem) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors">
      {/* Clickable main area */}
      <button
        onClick={() => onEdit(item)}
        className="w-full text-left flex gap-3 p-3"
        type="button"
      >
        {/* Image */}
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-gray-300 text-xs font-medium">No img</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
          {item.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
          )}
          <p className="text-sm font-medium text-gray-900 mt-1">{formatCents(item.price)}</p>

          {/* Dietary tags */}
          {item.dietaryTags && item.dietaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.dietaryTags.map((tag) => (
                <span
                  key={tag}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIETARY_COLOURS[tag] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Footer controls */}
      <div className="border-t border-gray-100 flex items-center justify-between px-3 py-2">
        {/* Availability toggle */}
        <button
          type="button"
          onClick={() => onToggleAvailable(item)}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
            item.available
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${item.available ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          {item.available ? 'Available' : 'Out of stock'}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CategoryItemsSection({
  companyId,
  branchId,
  categoryId,
}: CategoryItemsSectionProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Real-time subscription
  useEffect(() => {
    const unsub = subscribeItems(companyId, branchId, categoryId, setItems);
    return unsub;
  }, [companyId, branchId, categoryId]);

  function openCreate() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingItem(null);
  }

  async function handleDelete(item: MenuItem) {
    const confirmed = window.confirm(`Delete "${item.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteItem(companyId, branchId, categoryId, item.id);
  }

  async function handleToggleAvailable(item: MenuItem) {
    await updateItem(companyId, branchId, categoryId, item.id, {
      available: !item.available,
    });
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Existing items */}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggleAvailable={handleToggleAvailable}
          />
        ))}

        {/* Ghost "add" card */}
        <button
          type="button"
          onClick={openCreate}
          className="border-2 border-dashed border-gray-200 rounded-xl h-24 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Add item"
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Item form panel */}
      {formOpen && (
        <ItemForm
          companyId={companyId}
          branchId={branchId}
          categoryId={categoryId}
          item={editingItem}
          onClose={closeForm}
        />
      )}
    </>
  );
}
