import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Image as ImageIcon, Crop, Trash2, Check, Plus, X, PackageCheck, Scale } from 'lucide-react';
import { api, type PriceTier, type ProductOptionLists, type WeightSlab } from '../api';
import { DEFAULT_WEIGHT_SLABS, tiersForMode, tierMaking } from '../pricing';
import { OptionSelect } from '../components/OptionSelect';
import { ReadyStockTable, WeightOptionsTable } from '../components/ProductTables';
import { WeightSlabDropdown, slabDraftError, sortSlabDrafts, type WeightSlabDraft } from '../components/WeightSlabDropdown';

// Ready Stock window row: standard weight (g per 20 in) × size × pieces on the shelf
interface ReadyRow {
  std_weight_g: string;
  size_inches: string;
  stock_qty: string;
}

// Standard weight option with its making charge slabs (₹/g by net grams of that weight in an order),
// SKU code, build details and custom columns
interface WeightRow {
  std_weight_g: string;
  slabs: WeightSlabDraft[];
  sku_code: string;
  wire_size: string;
  thickness: string;
  endings: string;
  lock_type: string;
  extra: Record<string, string>;
}

const emptyReady = (std = ''): ReadyRow => ({ std_weight_g: std, size_inches: '', stock_qty: '' });
const toDraft = (s: WeightSlab): WeightSlabDraft =>
  ({ min_g: String(s.min_g), max_g: s.max_g === null ? '' : String(s.max_g), making: String(s.making), order_type: s.order_type || 'ALL' });
const defaultSlabs = () => DEFAULT_WEIGHT_SLABS.map(toDraft);

// Older weights open with slabs that keep their prices: the product's old quantity slabs in g / kg per purchase
// type (the removed "Order Quantity" section), with the weight's own pricing outside them; without those, one
// slab at the weight's pricing
function legacySlabs(making: number | null | undefined, tiers: PriceTier[]): WeightSlabDraft[] {
  const base = making === null || making === undefined ? null : Number(making);
  const byGrams = tiers.filter(t => t.qty_unit === 'g' || t.qty_unit === 'kg');
  if (byGrams.length === 0) return base === null ? defaultSlabs() : [toDraft({ min_g: 1, max_g: null, making: base })];
  const grams = (t: PriceTier, v: number) => (t.qty_unit === 'kg' ? v * 1000 : v);
  const forMode = (mode: 'READY_STOCK' | 'ON_ORDER'): WeightSlab[] => {
    const list: WeightSlab[] = tiersForMode(byGrams, mode)
      .map(t => ({ min_g: grams(t, t.min_qty), max_g: t.max_qty === null || t.max_qty === undefined ? null : grams(t, t.max_qty), making: tierMaking(t) }))
      .sort((a, b) => a.min_g - b.min_g);
    if (base === null) return list;
    if (list.length === 0) return [{ min_g: 1, max_g: null, making: base }];
    if (list[0].min_g >= 2) list.unshift({ min_g: 1, max_g: list[0].min_g - 1, making: base });
    const last = list[list.length - 1];
    if (last.max_g !== null) list.push({ min_g: last.max_g + 1, max_g: null, making: base });
    return list;
  };
  const ready = forMode('READY_STOCK');
  const order = forMode('ON_ORDER');
  if (JSON.stringify(ready) === JSON.stringify(order)) return ready.map(t => toDraft({ ...t, order_type: 'ALL' }));
  return [...ready.map(t => toDraft({ ...t, order_type: 'READY_STOCK' })), ...order.map(t => toDraft({ ...t, order_type: 'ON_ORDER' }))];
}

const MAX_IMAGES = 10;
const emptyWeight = (): WeightRow => ({ std_weight_g: '', slabs: defaultSlabs(), sku_code: '', wire_size: '', thickness: '', endings: '', lock_type: 'Fish Lock', extra: {} });
const filled = (v: string) => v.trim() !== '';
const slabsPayload = (rows: WeightSlabDraft[]) =>
  sortSlabDrafts(rows).map(s => ({ min_g: parseFloat(s.min_g), max_g: filled(s.max_g) ? parseFloat(s.max_g) : null, making: parseFloat(s.making), order_type: s.order_type }));

const inputCls = 'w-full px-2.5 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-sm text-[#2F2923] text-center focus:outline-none focus:ring-1 focus:ring-[#6B5744] disabled:bg-[#F5F0E8] disabled:text-[#766B60]';
const fieldCls = 'w-full px-2.5 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-sm text-[#2F2923] placeholder-[#766B60]/70 focus:outline-none focus:ring-1 focus:ring-[#6B5744]';
const miniLabel = 'block text-[10px] font-bold text-[#766B60] uppercase mb-1';
const cardCls = 'bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card';

const SectionHeader: React.FC<{ step: number; icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }> = ({ step, icon, title, hint, action }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-[#6B5744] text-white text-[10px] flex items-center justify-center shrink-0">{step}</span>
        {icon}
        {title}
      </h3>
      {action}
    </div>
    <p className="text-[11px] text-[#766B60] mt-1">{hint}</p>
  </div>
);

const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1 text-xs font-semibold text-[#6B5744] px-2 py-1 rounded-lg hover:bg-[#E8DCCB]/60 whitespace-nowrap">
    <Plus size={14} /> {children}
  </button>
);

const RemoveButton: React.FC<{ onClick: () => void; title: string }> = ({ onClick, title }) => (
  <button type="button" onClick={onClick} title={title} aria-label={title}
    className="w-7 h-7 rounded-lg text-[#C94C4C] hover:bg-[#FBE9E9] flex items-center justify-center shrink-0">
    <Trash2 size={14} />
  </button>
);

interface NewProductScreenProps {
  onBack: () => void;
  onProductCreated: (productId: string) => void;
  productIdToEdit?: string;
  onProductUpdated?: (productId: string) => void;
}

export const NewProductScreen: React.FC<NewProductScreenProps> = ({
  onBack,
  onProductCreated,
  productIdToEdit,
  onProductUpdated
}) => {
  const isEditing = Boolean(productIdToEdit);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Product photos in order (the first is the cover) and the queue of non-square picks waiting to be cropped
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [cropQueue, setCropQueue] = useState<{ file: File; src: string }[]>([]);
  const uploadingImage = uploadingCount > 0;

  // The product tables (prices follow the silver rate set on the Dashboard)
  const [readyRows, setReadyRows] = useState<ReadyRow[]>(isEditing ? [] : [emptyReady()]);
  const [weightRows, setWeightRows] = useState<WeightRow[]>(isEditing ? [] : [emptyWeight()]);
  const [columns, setColumns] = useState<string[]>([]);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  // Saved dropdown values shared by all products
  const [optionLists, setOptionLists] = useState<ProductOptionLists>({ lock_type: [], wire_size: [], endings: [] });
  const [newCategory, setNewCategory] = useState<string | null>(null);
  // Older products keep an overall stock count without ready stock rows
  const [legacyStock, setLegacyStock] = useState(0);

  const [categories, setCategories] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProductOptions().then(res => setOptionLists(res.options)).catch(() => {});

    api.getCategories().then(res => {
      const cats = res.categories || [];
      setCategories(cats);
      if (!isEditing && cats.length > 0) setCategoryId(cats[0].id);
    }).catch(() => {});

    if (productIdToEdit) {
      setInitialLoading(true);
      api.getProduct(productIdToEdit)
        .then(res => {
          if (res && res.product) {
            const p = res.product;
            setName(p.name || '');
            setSku(p.sku || '');
            setCategoryId(p.category_id || '');
            setDescription(p.description || '');
            setStatus(p.status === 'inactive' ? 'inactive' : 'active');
            setImagePaths(p.image_paths && p.image_paths.length > 0 ? p.image_paths : p.image_path ? [p.image_path] : []);
            setLegacyStock((res.variants || []).length === 0 ? Math.max(0, (p.physical_stock || 0) - (p.reserved_stock || 0)) : 0);
            setReadyRows((res.variants || []).map(v => ({
              std_weight_g: String(v.std_weight_g),
              size_inches: String(v.size_inches),
              stock_qty: String(v.stock_qty)
            })));
            const opts = res.weight_options || [];
            setWeightRows(opts.length > 0
              ? opts.map(o => ({
                  std_weight_g: String(o.std_weight_g),
                  slabs: o.weight_slabs && o.weight_slabs.length > 0 ? o.weight_slabs.map(toDraft) : legacySlabs(o.making_charge, res.tiers || []),
                  sku_code: o.sku_code || '',
                  wire_size: o.wire_size || '',
                  thickness: o.thickness || p.thickness || '',
                  endings: o.endings || '',
                  lock_type: o.lock_type || '',
                  extra: { ...(o.extra || {}) }
                }))
              : [{ ...emptyWeight(), std_weight_g: String(p.std_weight_per_20in || ''), slabs: legacySlabs(p.labour_per_gram || null, res.tiers || []), sku_code: p.sku || '' }]);
            setColumns(res.weight_columns || []);
          }
        })
        .catch(err => {
          setError(err.message || 'Failed to load product details');
        })
        .finally(() => {
          setInitialLoading(false);
        });
    }
  }, [productIdToEdit]);

  // Square photos upload straight away; others wait in the crop queue (one prompt each)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, MAX_IMAGES - imagePaths.length - cropQueue.length));
    e.target.value = '';
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const src = loadEvent.target?.result as string;
        const img = new Image();
        img.onload = () => {
          if (Math.abs(img.width - img.height) <= 4) uploadProcessedFile(file);
          else setCropQueue(q => [...q, { file, src }]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
  };

  const executeSquareCrop = () => {
    const pending = cropQueue[0];
    if (!pending) return;
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const startX = (img.width - size) / 2;
      const startY = (img.height - size) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, startX, startY, size, size, 0, 0, 800, 800);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], pending.file.name || 'product_square.jpg', { type: 'image/jpeg' });
        setCropQueue(q => q.slice(1));
        uploadProcessedFile(croppedFile);
      }, 'image/jpeg', 0.88);
    };
    img.src = pending.src;
  };

  const uploadProcessedFile = async (fileToUpload: File) => {
    try {
      setUploadingCount(c => c + 1);
      setError(null);
      // Saved on the server as "<SKU code>.jpg", "<SKU code>-1.jpg", ...
      const fd = new FormData();
      fd.append('name', name.trim() || sku.trim() || 'product');
      fd.append('sku', sku.trim() || 'sku');
      fd.append('image', fileToUpload);

      const res = await api.uploadProductImage(fd);
      if (res && res.file_path) {
        setImagePaths(list => (list.length < MAX_IMAGES ? [...list, res.file_path] : list));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload product image');
    } finally {
      setUploadingCount(c => c - 1);
    }
  };

  const removeImage = (i: number) => setImagePaths(list => list.filter((_, j) => j !== i));
  const makeCover = (i: number) => setImagePaths(list => [list[i], ...list.filter((_, j) => j !== i)]);

  const setReady = (i: number, field: keyof ReadyRow, val: string) =>
    setReadyRows(rows => rows.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
  const setWeight = (i: number, field: Exclude<keyof WeightRow, 'extra' | 'slabs'>, val: string) =>
    setWeightRows(rows => rows.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
  const setWeightSlabs = (i: number, slabRows: WeightSlabDraft[]) =>
    setWeightRows(rows => rows.map((r, j) => (j === i ? { ...r, slabs: slabRows } : r)));
  const setExtra = (i: number, col: string, val: string) =>
    setWeightRows(rows => rows.map((r, j) => (j === i ? { ...r, extra: { ...r.extra, [col]: val } } : r)));

  const addColumn = () => {
    const col = (newColumn || '').trim();
    if (!col) return setNewColumn(null);
    const fixed = ['standard wt.', 'pricing', 'sku code', 'wire size', 'endings', 'lock type'];
    if (fixed.includes(col.toLowerCase()) || columns.some(c => c.toLowerCase() === col.toLowerCase())) {
      setError(`There is already a "${col}" column`);
      return;
    }
    setColumns([...columns, col]);
    setNewColumn(null);
  };

  const removeColumn = (col: string) => {
    setColumns(columns.filter(c => c !== col));
    setWeightRows(rows => rows.map(r => {
      const extra = { ...r.extra };
      delete extra[col];
      return { ...r, extra };
    }));
  };

  // Parsed rows for the reference tables shown under each section
  const readyPreview = readyRows
    .filter(r => parseFloat(r.std_weight_g) > 0 && parseFloat(r.size_inches) > 0)
    .map(r => {
      const std = parseFloat(r.std_weight_g);
      const size = parseFloat(r.size_inches);
      return { std_weight_g: std, size_inches: size, stock_qty: parseInt(r.stock_qty, 10) || 0, weight_g: (std * size) / 20 };
    });
  const weightPreview = weightRows
    .filter(r => parseFloat(r.std_weight_g) > 0)
    .map(r => ({
      std_weight_g: parseFloat(r.std_weight_g),
      making_charge: r.slabs.length > 0 && filled(sortSlabDrafts(r.slabs)[0].making) ? parseFloat(sortSlabDrafts(r.slabs)[0].making) : null,
      weight_slabs: slabDraftError(r.slabs) ? [] : slabsPayload(r.slabs),
      sku_code: r.sku_code,
      wire_size: r.wire_size,
      thickness: r.thickness,
      endings: r.endings,
      lock_type: r.lock_type,
      extra: r.extra
    }));

  const addOption = async (field: keyof ProductOptionLists, value: string) => {
    const res = await api.addProductOption(field, value);
    setOptionLists(res.options);
  };

  const addCategory = async () => {
    const nameValue = (newCategory || '').trim();
    if (!nameValue) return setNewCategory(null);
    try {
      const res = await api.createCategory({ name: nameValue });
      setCategories(prev => [...prev, res.category]);
      setCategoryId(res.category.id);
      setNewCategory(null);
    } catch (err: any) {
      setError(err.message || 'Could not add the category');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product Name is required');
      return;
    }
    if (!sku.trim()) {
      setError('SKU is required');
      return;
    }

    const usedWeights = weightRows.filter(r => filled(r.std_weight_g) || filled(r.sku_code));
    if (usedWeights.length === 0) {
      setError('Add at least one standard weight with its pricing');
      return;
    }
    if (usedWeights.some(r => !(parseFloat(r.std_weight_g) > 0))) {
      setError('Every standard weight row needs a weight in grams');
      return;
    }
    const badSlabs = usedWeights.find(r => slabDraftError(r.slabs));
    if (badSlabs) {
      setError(`Making charges for ${badSlabs.std_weight_g} g: ${slabDraftError(badSlabs.slabs)}`);
      return;
    }
    const usedReady = readyRows.filter(r => filled(r.std_weight_g) || filled(r.size_inches) || filled(r.stock_qty));
    if (usedReady.some(r => !(parseFloat(r.std_weight_g) > 0) || !(parseFloat(r.size_inches) > 0))) {
      setError('Every ready stock row needs a standard weight and a size');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
        sku: sku.trim(),
        category_id: categoryId || null,
        description,
        status,
        image_path: imagePaths[0] || null,
        image_paths: imagePaths,
        variants: usedReady.map(r => ({ std_weight_g: r.std_weight_g, size_inches: r.size_inches, stock_qty: r.stock_qty || '0' })),
        weight_columns: columns,
        weight_options: usedWeights.map(r => ({
          std_weight_g: r.std_weight_g,
          weight_slabs: slabsPayload(r.slabs),
          sku_code: r.sku_code,
          wire_size: r.wire_size,
          thickness: r.thickness,
          endings: r.endings,
          lock_type: r.lock_type,
          extra: r.extra
        })),
        // Order quantity slabs are retired: every standard weight carries its own slabs now
        tiers: []
      };

      if (isEditing && productIdToEdit) {
        await api.updateProduct(productIdToEdit, payload);
        if (onProductUpdated) {
          onProductUpdated(productIdToEdit);
        } else {
          onBack();
        }
      } else {
        const res = await api.createProduct({ ...payload, reorder_threshold: 50 });
        onProductCreated(res.product.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] pb-32 max-w-lg mx-auto">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-xs px-4 py-3 border-b border-[#D2BFA7]/40 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-base font-semibold text-[#2F2923] hover:text-[#6B5744] cursor-pointer"
        >
          <ArrowLeft size={20} />
          <span>{isEditing ? 'Modify Product' : 'Add Product'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-4 space-y-4">
        {error && (
          <div className="p-3 bg-[#FBE9E9] border border-[#C94C4C]/20 rounded-xl text-sm text-[#C94C4C]">
            {error}
          </div>
        )}

        {/* Product photos: several per product, customers swipe through them; the first is the cover */}
        <div className={cardCls}>
          <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5 flex items-center justify-between">
            <span>Product Photos (Square 1:1) · {imagePaths.length}/{MAX_IMAGES}</span>
            {uploadingImage && (
              <span className="text-[#6B5744] flex items-center gap-1 font-semibold text-[11px]">
                <Loader2 size={12} className="animate-spin" /> Uploading...
              </span>
            )}
          </label>

          <div className="grid grid-cols-4 gap-2">
            {imagePaths.map((path, i) => (
              <div key={path} className="relative aspect-square rounded-lg overflow-hidden border border-[#D2BFA7] bg-white">
                <img src={path} alt={`Product photo ${i + 1}`} className="w-full h-full object-cover" />
                {i === 0 ? (
                  <span className="absolute bottom-0 inset-x-0 bg-[#6B5744]/90 text-white text-[9px] font-bold text-center py-0.5">Cover</span>
                ) : (
                  <button type="button" onClick={() => makeCover(i)} className="absolute bottom-0 inset-x-0 bg-black/45 hover:bg-black/60 text-white text-[9px] font-bold py-0.5">
                    Make cover
                  </button>
                )}
                <button type="button" onClick={() => removeImage(i)} title="Remove photo" aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-[#C94C4C] flex items-center justify-center shadow-sm">
                  <X size={12} />
                </button>
              </div>
            ))}
            {imagePaths.length + cropQueue.length < MAX_IMAGES && (
              <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-[#D2BFA7] rounded-lg bg-[#F5F0E8]/40 hover:bg-[#F5F0E8] cursor-pointer transition-colors text-center">
                <ImageIcon size={20} className="text-[#6B5744] mb-1" />
                <span className="text-[10px] font-bold text-[#2F2923]">Add photos</span>
                <input type="file" accept="image/*" multiple onChange={handleFileSelected} className="hidden" />
              </label>
            )}
          </div>
          <p className="text-[10px] text-[#766B60] mt-2">
            Pick one or more photos. Customers swipe through them (they also slide on their own); the cover shows in product lists. Non-square photos prompt to crop.
          </p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Anchor Chain"
            className="w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
          />
        </div>

        {/* SKU + Category */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5">
              Product SKU *
            </label>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. CH018"
              className="w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5">
              Category
            </label>
            {newCategory !== null ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } if (e.key === 'Escape') setNewCategory(null); }}
                  placeholder="New category"
                  aria-label="New category name"
                  className="w-full min-w-0 px-3 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                />
                <button type="button" onClick={addCategory} className="w-9 h-9 shrink-0 rounded-lg bg-[#6B5744] text-white flex items-center justify-center" aria-label="Add category"><Check size={14} /></button>
                <button type="button" onClick={() => setNewCategory(null)} className="w-9 h-9 shrink-0 rounded-lg bg-[#F5F0E8] border border-[#D2BFA7] text-[#766B60] flex items-center justify-center" aria-label="Cancel"><X size={14} /></button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => (e.target.value === '__new__' ? setNewCategory('') : setCategoryId(e.target.value))}
                className="w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New category…</option>
              </select>
            )}
          </div>
        </div>

        <p className="text-[11px] text-[#766B60] -mt-1">
          Price = (silver ₹/g + making ₹/g) × weight, plus 3% GST. The silver rate is set on the Dashboard and every price follows it automatically.
        </p>

        {/* 1. READY STOCK WINDOW: standard weight × size × pieces */}
        <div className={cardCls}>
          <SectionHeader
            step={1}
            icon={<PackageCheck size={14} className="text-[#4F7D5B]" />}
            title="Ready Stock Window"
            hint="Pieces on the shelf now. Standard weight is the weight of a 20 in piece; other sizes weigh standard × size ÷ 20 (3 g at 14 in = 2.1 g)."
            action={<AddButton onClick={() => setReadyRows([...readyRows, emptyReady(readyRows[readyRows.length - 1]?.std_weight_g || '')])}>Add row</AddButton>}
          />
          {readyRows.length === 0 ? (
            <p className="text-xs text-[#766B60] italic">
              {legacyStock > 0
                ? `No rows yet — the overall stock of ${legacyStock} pcs is shown to customers as 20 in pieces. Add rows to track ready stock by weight and size.`
                : 'No ready stock — this product is sold On Order only.'}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[10px] font-bold text-[#766B60] uppercase text-center">
                <span>Standard Wt. (g)</span><span>Size (in)</span><span>Qty (pcs)</span><span />
              </div>
              {readyRows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 items-center">
                  <input type="number" step="any" min="0" value={r.std_weight_g} placeholder="3.00" className={inputCls} aria-label="Standard weight in grams"
                    onChange={(e) => setReady(i, 'std_weight_g', e.target.value)} />
                  <input type="number" step="any" min="0" value={r.size_inches} placeholder="16" className={inputCls} aria-label="Size in inches"
                    onChange={(e) => setReady(i, 'size_inches', e.target.value)} />
                  <input type="number" step="1" min="0" value={r.stock_qty} placeholder="10" className={inputCls} aria-label="Ready stock pieces"
                    onChange={(e) => setReady(i, 'stock_qty', e.target.value)} />
                  <RemoveButton title="Remove row" onClick={() => setReadyRows(readyRows.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
          )}
          {readyPreview.length > 0 && (
            <div className="mt-4">
              <ReadyStockTable rows={readyPreview} />
            </div>
          )}
        </div>

        {/* 2. STANDARD WEIGHTS: pricing, SKU code, wire size, endings, lock type + custom columns */}
        <div className={cardCls}>
          <SectionHeader
            step={2}
            icon={<Scale size={14} className="text-[#6B5744]" />}
            title="Standard Weights"
            hint="Every weight this product is made in (per 20 in piece), separate from ready stock. Making charges are per gram, by the net grams of that weight a customer orders."
            action={<AddButton onClick={() => setWeightRows([...weightRows, emptyWeight()])}>Add weight</AddButton>}
          />

          {/* Custom columns */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] font-bold text-[#766B60] uppercase mr-1">Extra columns:</span>
            {columns.map(c => (
              <span key={c} className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-[#E8DCCB] text-[11px] font-semibold text-[#2F2923]">
                {c}
                <button type="button" onClick={() => removeColumn(c)} className="w-4 h-4 rounded-full hover:bg-[#D2BFA7] flex items-center justify-center" aria-label={`Remove ${c} column`}>
                  <X size={10} />
                </button>
              </span>
            ))}
            {newColumn !== null ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newColumn}
                  onChange={e => setNewColumn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } if (e.key === 'Escape') setNewColumn(null); }}
                  placeholder="e.g. Finish"
                  className="w-28 px-2 py-1 bg-[#FFFCF7] border border-[#D2BFA7] rounded-lg text-xs"
                  aria-label="New column name"
                />
                <button type="button" onClick={addColumn} className="w-6 h-6 rounded-lg bg-[#6B5744] text-white flex items-center justify-center" aria-label="Add column"><Check size={12} /></button>
              </span>
            ) : (
              <AddButton onClick={() => setNewColumn('')}>Column</AddButton>
            )}
          </div>

          <div className="space-y-3">
            {weightRows.map((r, i) => (
              <div key={i} className="rounded-xl border border-[#E8DCCB] bg-[#F5F0E8]/50 p-3">
                <div className="grid grid-cols-[1fr_28px] gap-2 items-end mb-2">
                  <div>
                    <label className={miniLabel}>Standard Wt. (g) *</label>
                    <input type="number" step="any" min="0" value={r.std_weight_g} placeholder="3.00" className={fieldCls}
                      onChange={e => setWeight(i, 'std_weight_g', e.target.value)} />
                  </div>
                  {weightRows.length > 1 ? <RemoveButton title="Remove weight" onClick={() => setWeightRows(weightRows.filter((_, j) => j !== i))} /> : <span />}
                </div>
                <div className="mb-2">
                  <WeightSlabDropdown slabs={r.slabs} onChange={v => setWeightSlabs(i, v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={miniLabel}>SKU Code</label>
                    <input value={r.sku_code} placeholder="CH018-3G" className={fieldCls} onChange={e => setWeight(i, 'sku_code', e.target.value)} />
                  </div>
                  <div>
                    <label className={miniLabel}>Wire Size</label>
                    <OptionSelect value={r.wire_size} options={optionLists.wire_size} className={fieldCls} ariaLabel="wire size"
                      onChange={v => setWeight(i, 'wire_size', v)} onCreate={v => addOption('wire_size', v)} />
                  </div>
                  <div>
                    <label className={miniLabel}>Thickness</label>
                    <input
                      value={r.thickness || ''}
                      placeholder="e.g. 1.8 mm"
                      className={fieldCls}
                      onChange={e => setWeight(i, 'thickness', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={miniLabel}>Endings</label>
                    <OptionSelect value={r.endings} options={optionLists.endings} className={fieldCls} ariaLabel="endings"
                      onChange={v => setWeight(i, 'endings', v)} onCreate={v => addOption('endings', v)} />
                  </div>
                  <div>
                    <label className={miniLabel}>Lock Type</label>
                    <OptionSelect value={r.lock_type} options={optionLists.lock_type} className={fieldCls} ariaLabel="lock type"
                      onChange={v => setWeight(i, 'lock_type', v)} onCreate={v => addOption('lock_type', v)} />
                  </div>
                  {columns.map(c => (
                    <div key={c}>
                      <label className={miniLabel}>{c}</label>
                      <input value={r.extra[c] || ''} className={fieldCls} onChange={e => setExtra(i, c, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {weightPreview.length > 0 && (
            <div className="mt-4">
              <WeightOptionsTable rows={weightPreview} columns={columns} />
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5">
            Status
          </label>
          <div className="flex bg-[#E8DCCB] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setStatus('active')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                status === 'active'
                  ? 'bg-[#6B5744] text-[#FFFCF7] shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatus('inactive')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                status === 'inactive'
                  ? 'bg-[#6B5744] text-[#FFFCF7] shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-[#766B60] uppercase mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add product design details or notes..."
            className="w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744] resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-[#6B5744] hover:bg-[#5C4E43] active:bg-[#473B32] disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-sm cursor-pointer"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              {isEditing ? 'Updating...' : 'Saving...'}
            </span>
          ) : (
            isEditing ? 'Save Product Modifications' : 'Create Product'
          )}
        </button>
      </form>

      {/* Square Crop Prompt Modal */}
      {cropQueue.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#E8DCCB] text-[#6B5744] flex items-center justify-center mx-auto">
              <Crop size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-[#2F2923]">Crop Image to Square?{cropQueue.length > 1 ? ` (${cropQueue.length} left)` : ''}</h3>
              <p className="text-xs text-[#766B60] mt-1">
                The image uploaded is not square (1:1). Products require square images to display uniformly.
              </p>
            </div>

            {cropQueue[0] && (
              <div className="w-48 h-48 mx-auto relative rounded-xl overflow-hidden border-2 border-[#6B5744] shadow-md">
                <img
                  src={cropQueue[0].src}
                  alt="Raw preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-2 border-dashed border-white/80 pointer-events-none"></div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCropQueue(q => q.slice(1))}
                className="flex-1 py-2.5 bg-[#F5F0E8] border border-[#D2BFA7] text-[#2F2923] text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSquareCrop}
                className="flex-1 py-2.5 bg-[#6B5744] text-white text-xs font-semibold rounded-xl hover:bg-[#5C4E43] flex items-center justify-center gap-1.5"
              >
                <Check size={14} />
                <span>Crop to Square</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
