import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, PackagePlus, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { api } from '../api';
import { STANDARD_INCHES, formatGrams, sameNum } from '../pricing';

export interface BulkInventoryEntry {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  stdWeightG: number;
  sizeInches: number;
  qty: number;
}

interface BulkAddInventoryModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
  initialProductId?: string;
}

export const BulkAddInventoryModal: React.FC<BulkAddInventoryModalProps> = ({
  onClose,
  onSuccess,
  initialProductId
}) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form row state
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [productDetails, setProductDetails] = useState<Record<string, { weights: number[]; sizes: number[] }>>({});

  const [stdWeight, setStdWeight] = useState<number>(20);
  const [sizeInches, setSizeInches] = useState<number>(20);
  const [customSize, setCustomSize] = useState<string>('');
  const [qty, setQty] = useState<number>(10);

  // Staged entries for preview
  const [entries, setEntries] = useState<BulkInventoryEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active products list
  useEffect(() => {
    api.getProducts()
      .then(res => {
        const list = res.products || [];
        setProducts(list);
        if (list.length > 0 && !selectedProductId) {
          setSelectedProductId(initialProductId || list[0].id);
        }
      })
      .catch(err => setError(err.message || 'Failed to load products'))
      .finally(() => setLoadingProducts(false));
  }, []);

  // When a product is selected, fetch its available weights
  useEffect(() => {
    if (!selectedProductId) return;
    if (productDetails[selectedProductId]) {
      const d = productDetails[selectedProductId];
      if (d.weights.length > 0) setStdWeight(d.weights[0]);
      return;
    }

    api.getProduct(selectedProductId)
      .then(res => {
        const p = res.product;
        const weights: number[] = [];
        const addW = (w: number) => { if (w > 0 && !weights.some(x => sameNum(x, w))) weights.push(w); };
        (res.weight_options || []).forEach((o: any) => addW(o.std_weight_g));
        (res.variants || []).forEach((v: any) => addW(v.std_weight_g));
        if (p.std_weight_per_20in) addW(p.std_weight_per_20in);
        weights.sort((a, b) => a - b);

        const sizes = Array.from(new Set([...STANDARD_INCHES, ...(res.variants || []).map((v: any) => Number(v.size_inches))])).sort((a, b) => a - b);
        setProductDetails(prev => ({ ...prev, [selectedProductId]: { weights, sizes } }));
        if (weights.length > 0) setStdWeight(weights[0]);
      })
      .catch(console.error);
  }, [selectedProductId]);

  const currentProduct = products.find(p => p.id === selectedProductId);
  const currentDetail = productDetails[selectedProductId] || { weights: [20], sizes: STANDARD_INCHES };

  const handleAddEntry = () => {
    setError(null);
    if (!currentProduct) {
      setError('Please select a product');
      return;
    }
    const finalSize = customSize.trim() ? parseFloat(customSize) : sizeInches;
    if (isNaN(finalSize) || finalSize < 1 || finalSize > 60) {
      setError('Please enter a valid size between 1 and 60 inches');
      return;
    }
    if (!qty || qty <= 0) {
      setError('Please enter a quantity of at least 1 piece');
      return;
    }

    const newEntry: BulkInventoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: currentProduct.id,
      productName: currentProduct.name,
      sku: currentProduct.sku,
      stdWeightG: stdWeight,
      sizeInches: finalSize,
      qty: Math.floor(qty)
    };

    setEntries(prev => [...prev, newEntry]);
    setCustomSize('');
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const calculateUnitWeight = (stdWeightG: number, sizeInches: number) => {
    return (stdWeightG * sizeInches) / 20;
  };

  const totalPieces = entries.reduce((sum, e) => sum + e.qty, 0);
  const totalWeightG = entries.reduce((sum, e) => sum + calculateUnitWeight(e.stdWeightG, e.sizeInches) * e.qty, 0);

  const handleSubmitBulk = async () => {
    if (entries.length === 0) {
      setError('Add at least one inventory entry to submit');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const items = entries.map(e => ({
        product_id: e.productId,
        std_weight_g: e.stdWeightG,
        size_inches: e.sizeInches,
        qty: e.qty
      }));
      const res = await api.bulkAddInventory(items);
      onSuccess(res.message || `Successfully added ${totalPieces} pcs (${formatGrams(totalWeightG)}) across ${entries.length} variants.`);
    } catch (err: any) {
      setError(err.message || 'Failed to add bulk inventory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-2xl bg-[#FFFCF7] border border-[#D2BFA7] rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3 border-b border-[#D2BFA7]">
          <div>
            <h2 className="text-lg font-bold text-[#2F2923] flex items-center gap-2">
              <PackagePlus size={20} className="text-[#6B5744]" />
              Bulk Add Inventory
            </h2>
            <p className="text-xs text-[#766B60]">
              Add multiple standard weights and sizes across products in one single operation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[#766B60] hover:bg-[#F5F0E8] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs font-semibold text-[#C94C4C] flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Add Row Controls */}
          <div className="bg-[#F5F0E8] border border-[#D2BFA7] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-[#6B5744] uppercase tracking-wider">
              Add Inventory Row
            </h3>

            {/* Product Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                Select Product
              </label>
              {loadingProducts ? (
                <div className="py-2 flex items-center gap-2 text-xs text-[#766B60]">
                  <Loader2 size={14} className="animate-spin" /> Loading products...
                </div>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Standard Weight & Size & Quantity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Standard Weight */}
              <div>
                <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                  Standard Wt. (20")
                </label>
                <select
                  value={stdWeight}
                  onChange={(e) => setStdWeight(parseFloat(e.target.value))}
                  className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                >
                  {currentDetail.weights.map(w => (
                    <option key={w} value={w}>
                      {formatGrams(w)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                  Size (inches)
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={sizeInches}
                    onChange={(e) => { setSizeInches(parseFloat(e.target.value)); setCustomSize(''); }}
                    className="flex-1 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-2.5 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                  >
                    {currentDetail.sizes.map(s => (
                      <option key={s} value={s}>
                        {s}"
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="60"
                    placeholder="Custom"
                    value={customSize}
                    onChange={(e) => setCustomSize(e.target.value)}
                    className="w-16 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-2 py-2 text-xs font-bold text-center text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                    title="Or enter custom size in inches"
                  />
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[11px] font-bold text-[#766B60] uppercase mb-1">
                  Quantity (pcs)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-3 py-2 text-xs font-bold text-[#2F2923] focus:outline-none focus:border-[#6B5744]"
                  />
                  <button
                    type="button"
                    onClick={handleAddEntry}
                    className="px-3 py-2 bg-[#6B5744] hover:bg-[#584534] text-white font-bold rounded-xl text-xs flex items-center gap-1 shrink-0 shadow-xs transition-all"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Simultaneous Live Preview Table (Requirement 11) */}
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-[#E8DCCB]/50 border-b border-[#D2BFA7] flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#2F2923] flex items-center gap-1.5 uppercase tracking-wider">
                <Eye size={14} className="text-[#6B5744]" />
                Simultaneous Entry Preview ({entries.length} items)
              </h3>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEntries([])}
                  className="text-[11px] font-bold text-[#C94C4C] hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {entries.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#766B60]">
                No entries added yet. Select product, standard weight, size, and quantity above, then click <strong>"Add Row"</strong>.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F5F0E8] text-[10px] uppercase font-bold text-[#766B60] sticky top-0 border-b border-[#D2BFA7]">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Standard Wt.</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2">Unit Wt.</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Total Wt.</th>
                      <th className="px-2 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DCCB]">
                    {entries.map((entry) => {
                      const unitWeight = calculateUnitWeight(entry.stdWeightG, entry.sizeInches);
                      const rowTotalWeight = unitWeight * entry.qty;
                      return (
                        <tr key={entry.id} className="hover:bg-[#F5F0E8]/50">
                          <td className="px-3 py-2 font-bold text-[#2F2923] max-w-[140px] truncate">
                            {entry.productName}
                          </td>
                          <td className="px-3 py-2 font-semibold text-[#766B60]">
                            {formatGrams(entry.stdWeightG)}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#2F2923]">
                            {entry.sizeInches}"
                          </td>
                          <td className="px-3 py-2 font-semibold text-[#766B60]">
                            {formatGrams(unitWeight)}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#4F7D5B]">
                            {entry.qty} pcs
                          </td>
                          <td className="px-3 py-2 font-bold text-[#2F2923]">
                            {formatGrams(rowTotalWeight)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveEntry(entry.id)}
                              className="p-1 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-md transition-colors"
                              title="Remove"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total Summary Footer */}
            {entries.length > 0 && (
              <div className="px-4 py-3 bg-[#F5F0E8] border-t border-[#D2BFA7] flex items-center justify-between text-xs">
                <span className="font-semibold text-[#766B60]">
                  Grand Total across all items:
                </span>
                <div className="flex items-center gap-4 font-bold text-[#2F2923]">
                  <span>Total Pieces: <strong className="text-[#4F7D5B]">{totalPieces} pcs</strong></span>
                  <span>Total Weight: <strong>{formatGrams(totalWeightG)}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-3 border-t border-[#D2BFA7] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[#D2BFA7] text-[#2F2923] text-xs font-bold hover:bg-[#E8DCCB] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={entries.length === 0 || submitting}
            onClick={handleSubmitBulk}
            className="px-5 py-2.5 rounded-xl bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Submitting Inventory...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Submit All {entries.length} Entries</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
