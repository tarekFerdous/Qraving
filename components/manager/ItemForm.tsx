'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Trash2, Plus, ImageIcon, Loader2 } from 'lucide-react';
import { put } from '@vercel/blob/client';
import { createItem, updateItem, MenuItem, Customizations } from '@/lib/manager-menu';
import { requestUploadClientToken, messageForUploadErrorReason } from '@/lib/upload-client';
import { compressImageFile } from '@/lib/image-compression';

const MAX_ITEM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemFormProps {
  companyId: string;
  branchId: string;
  categoryId: string;
  item?: MenuItem | null;
  onClose: () => void;
}

const ALL_DIETARY_TAGS = [
  { value: 'vegan', label: 'Vegan', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'vegetarian', label: 'Vegetarian', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'halal', label: 'Halal', color: 'bg-teal-100 text-teal-700 border-teal-300' },
  { value: 'gluten-free', label: 'Gluten-Free', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'nut-free', label: 'Nut-Free', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'dairy-free', label: 'Dairy-Free', color: 'bg-blue-100 text-blue-700 border-blue-300' },
] as const;

type CustomizationRow = { label: string; priceDelta: number };

// ─── Helper: price formatting ─────────────────────────────────────────────────

/** Converts a dollar string like "12.50" to integer cents 1250 */
function dollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

/** Converts cents to a display string like "12.50" */
function centsToDisplayString(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ─── Customization row editor ─────────────────────────────────────────────────

function CustomizationRowEditor({
  row,
  onUpdate,
  onRemove,
}: {
  row: CustomizationRow;
  onUpdate: (updated: CustomizationRow) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Label"
        value={row.label}
        onChange={(e) => onUpdate({ ...row, label: e.target.value })}
        className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50"
      />
      <div className="relative flex items-center">
        <span className="absolute left-2 text-sm text-gray-500">+$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={row.priceDelta === 0 ? '' : centsToDisplayString(row.priceDelta)}
          onChange={(e) =>
            onUpdate({ ...row, priceDelta: dollarsToCents(e.target.value) })
          }
          className="w-20 pl-7 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export default function ItemForm({
  companyId,
  branchId,
  categoryId,
  item,
  onClose,
}: ItemFormProps) {
  const isEdit = Boolean(item);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceDisplay, setPriceDisplay] = useState(
    item ? centsToDisplayString(item.price) : '',
  );
  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null);
  const [dietaryTags, setDietaryTags] = useState<string[]>(item?.dietaryTags ?? []);
  // Lazy conversion: if this item already has a tag list, use it. Otherwise, if it
  // only has the old free-text allergen note, split it into tags once on mount so
  // managers don't have to manually re-enter existing allergen info.
  const [allergens, setAllergens] = useState<string[]>(() => {
    if (item?.allergens && item.allergens.length > 0) return item.allergens;
    if (item?.allergenNote) {
      return item.allergenNote
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  });
  const [allergenInput, setAllergenInput] = useState('');

  // Customizations
  const [sizes, setSizes] = useState<CustomizationRow[]>(
    item?.customizations?.sizes ?? [],
  );
  const [addOns, setAddOns] = useState<CustomizationRow[]>(
    item?.customizations?.addOns ?? [],
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    item?.customizations?.specialInstructions ?? false,
  );

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Image upload ─────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadError(null);
      setUploadProgress(0);

      let fileToUpload: File = file;
      if (file.size > MAX_ITEM_IMAGE_SIZE_BYTES) {
        fileToUpload = await compressImageFile(file, MAX_ITEM_IMAGE_SIZE_BYTES);
        if (fileToUpload.size > MAX_ITEM_IMAGE_SIZE_BYTES) {
          setUploadError(messageForUploadErrorReason('invalid_file'));
          setUploadProgress(null);
          return;
        }
      }

      const itemId = item?.id ?? 'new';
      const pathname = `companies/${companyId}/branches/${branchId}/items/${itemId}/${file.name}`;

      // upload() can't be used here: on a non-2xx response from our token
      // route it throws a fixed generic error and discards the response
      // body, so we can't read the `reason` field it returns. Fetch the
      // client token ourselves, then hand it to the lower-level put().
      const tokenResult = await requestUploadClientToken(
        `/api/admin/companies/${companyId}/items/upload`,
        pathname,
      );

      if (!tokenResult.ok) {
        setUploadError(messageForUploadErrorReason(tokenResult.reason));
        setUploadProgress(null);
        return;
      }

      try {
        const blob = await put(pathname, fileToUpload, {
          access: 'public',
          token: tokenResult.clientToken,
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        });
        setImageUrl(blob.url);
      } catch (error) {
        console.error('Upload error:', error);
        setUploadError(messageForUploadErrorReason('unknown'));
      } finally {
        setUploadProgress(null);
      }
    },
    [companyId, branchId, item?.id],
  );

  // ── Dietary tag toggle ────────────────────────────────────────────────────────

  function toggleTag(tag: string) {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  // ── Allergen tag helpers ──────────────────────────────────────────────────────

  const MAX_ALLERGENS = 50;

  function addAllergen() {
    const trimmed = allergenInput.trim();
    if (!trimmed || allergens.length >= MAX_ALLERGENS) return;
    setAllergens((prev) => [...prev, trimmed]);
    setAllergenInput('');
  }

  function removeAllergen(index: number) {
    setAllergens((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Customization helpers ─────────────────────────────────────────────────────

  function updateRow(
    list: CustomizationRow[],
    setList: (v: CustomizationRow[]) => void,
    index: number,
    updated: CustomizationRow,
  ) {
    const next = [...list];
    next[index] = updated;
    setList(next);
  }

  function removeRow(
    list: CustomizationRow[],
    setList: (v: CustomizationRow[]) => void,
    index: number,
  ) {
    setList(list.filter((_, i) => i !== index));
  }

  function addRow(list: CustomizationRow[], setList: (v: CustomizationRow[]) => void) {
    setList([...list, { label: '', priceDelta: 0 }]);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setValidationError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Name is required.');
      return;
    }

    const priceCents = dollarsToCents(priceDisplay);
    if (priceCents < 0) {
      setValidationError('Price must be 0 or more.');
      return;
    }

    const customizations: Customizations = {
      sizes: sizes.filter((r) => r.label.trim()),
      addOns: addOns.filter((r) => r.label.trim()),
      specialInstructions,
    };

    const payload = {
      name: trimmedName,
      description: description.trim(),
      price: priceCents,
      imageUrl,
      available: item?.available ?? true,
      order: item?.order ?? 0,
      dietaryTags,
      allergens,
      customizations,
    };

    setSaving(true);
    try {
      if (isEdit && item) {
        await updateItem(companyId, branchId, categoryId, item.id, payload);
      } else {
        await createItem(companyId, branchId, categoryId, payload);
      }
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      setValidationError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit item' : 'New item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* ── Image ─────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Image
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {imageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Item preview"
                  className="w-full h-44 object-cover rounded-xl"
                />
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-white/90 backdrop-blur-sm border border-gray-200 px-3 py-1.5 rounded-lg font-medium text-gray-700 hover:bg-white transition-colors shadow-sm"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="text-xs bg-white/90 backdrop-blur-sm border border-gray-200 px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-white transition-colors shadow-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : uploadProgress !== null ? (
              <div className="h-44 rounded-xl bg-gray-50 border border-gray-200 flex flex-col items-center justify-center gap-3">
                <Loader2 size={20} className="text-gray-400 animate-spin" />
                <div className="w-40 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-gray-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{uploadProgress}%</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-44 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
              >
                <ImageIcon size={24} />
                <span className="text-sm font-medium">Add image</span>
              </button>
            )}

            {uploadError && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}
          </div>

          {/* ── Name ──────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="Add name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 placeholder-gray-400"
            />
          </div>

          {/* ── Description ───────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Description
            </label>
            <textarea
              placeholder="Add description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 placeholder-gray-400 resize-none"
            />
          </div>

          {/* ── Price ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Price
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-sm text-gray-500 pointer-events-none">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={priceDisplay}
                onChange={(e) => setPriceDisplay(e.target.value)}
                className="w-full pl-7 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 placeholder-gray-400"
              />
            </div>
          </div>

          {/* ── Dietary tags ───────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Dietary tags
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_DIETARY_TAGS.map((tag) => {
                const active = dietaryTags.includes(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => toggleTag(tag.value)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                      active
                        ? `${tag.color} border-current`
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Allergen note ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Allergen note
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addAllergen();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="e.g. Peanuts"
                value={allergenInput}
                onChange={(e) => setAllergenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAllergen();
                  }
                }}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={!allergenInput.trim() || allergens.length >= MAX_ALLERGENS}
                className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-xl px-3.5 py-2.5 hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
              >
                Add
              </button>
            </form>
            {allergens.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allergens.map((allergen, i) => (
                  <span
                    key={`${allergen}-${i}`}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium border bg-red-50 text-red-700 border-red-200"
                  >
                    {allergen}
                    <button
                      type="button"
                      onClick={() => removeAllergen(i)}
                      aria-label={`Remove ${allergen}`}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Customizations ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
              Customizations
            </label>

            {/* Sizes */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Sizes</p>
              {sizes.map((row, i) => (
                <CustomizationRowEditor
                  key={i}
                  row={row}
                  onUpdate={(updated) => updateRow(sizes, setSizes, i, updated)}
                  onRemove={() => removeRow(sizes, setSizes, i)}
                />
              ))}
              <button
                type="button"
                onClick={() => addRow(sizes, setSizes)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Plus size={13} />
                Add size
              </button>
            </div>

            {/* Add-ons */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Add-ons</p>
              {addOns.map((row, i) => (
                <CustomizationRowEditor
                  key={i}
                  row={row}
                  onUpdate={(updated) => updateRow(addOns, setAddOns, i, updated)}
                  onRemove={() => removeRow(addOns, setAddOns, i)}
                />
              ))}
              <button
                type="button"
                onClick={() => addRow(addOns, setAddOns)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Plus size={13} />
                Add add-on
              </button>
            </div>

            {/* Special instructions toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Special instructions</p>
                <p className="text-xs text-gray-500">Allow customers to add a free-text note</p>
              </div>
              <button
                type="button"
                onClick={() => setSpecialInstructions((v) => !v)}
                className={`relative inline-flex w-10 h-5 rounded-full transition-colors shrink-0 ${
                  specialInstructions ? 'bg-gray-800' : 'bg-gray-200'
                }`}
                role="switch"
                aria-checked={specialInstructions}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    specialInstructions ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-red-500 bg-red-50 px-3.5 py-2.5 rounded-xl">
              {validationError}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadProgress !== null}
            className="flex-1 text-sm font-semibold text-white bg-gray-900 rounded-xl py-2.5 hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Add item'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
