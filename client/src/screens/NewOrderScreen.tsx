import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Plus, Minus, Search, X } from 'lucide-react';
import { api } from '../api';

interface NewOrderScreenProps {
  onBack: () => void;
  onOrderCreated: (orderId: string) => void;
  onNewCustomerFromOrder: () => void;
  orderIdToEdit?: string;
  onOrderUpdated?: (orderId: string) => void;
}

interface SizeRow {
  size_inches: string;
  pieces: string;
}

interface OrderProductEntry {
  product: any;
  sizes: SizeRow[];
}

export const NewOrderScreen: React.FC<NewOrderScreenProps> = ({
  onBack,
  onOrderCreated,
  onNewCustomerFromOrder,
  orderIdToEdit,
  onOrderUpdated
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [entries, setEntries] = useState<OrderProductEntry[]>([]);
  const [advanceAmount, setAdvanceAmount] = useState('0');
  const [specialNotes, setSpecialNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingOrderNumber, setExistingOrderNumber] = useState<string>('');
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Modals for selection
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);

  // Lists for modals
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    // Pre-load products and customers
    api.getCustomers().then(res => setCustomers(res.customers || [])).catch(() => {});
    api.getProducts().then(res => setProducts(res.products || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!orderIdToEdit) return;
    setLoadingExisting(true);
    api.getOrder(orderIdToEdit)
      .then(res => {
        if (res && res.order) {
          setExistingOrderNumber(res.order.order_number || '');
          setSelectedCustomer({
            id: res.order.customer_id,
            company_name: res.order.customer_company_name,
            poc_name: res.order.customer_poc_name,
            phone: res.order.customer_phone,
            city: res.order.customer_city
          });
          setAdvanceAmount(String(res.order.advance_amount || 0));
          setSpecialNotes(res.order.special_notes || '');

          const groupMap: Record<string, { product: any; sizes: SizeRow[] }> = {};
          res.items?.forEach((it: any) => {
            if (!groupMap[it.product_id]) {
              groupMap[it.product_id] = {
                product: {
                  id: it.product_id,
                  name: it.product_name,
                  sku: it.product_sku,
                  std_weight_per_20in: it.std_weight_per_20in || 20.0,
                  wire_size: it.wire_size,
                  category_name: it.category_name,
                  lock_type: it.lock_type,
                  physical_stock: it.physical_stock,
                  reserved_stock: it.reserved_stock
                },
                sizes: []
              };
            }
            groupMap[it.product_id].sizes.push({
              size_inches: String(it.size_inches),
              pieces: String(it.requested_pieces)
            });
          });
          setEntries(Object.values(groupMap));
        }
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load order for modifying');
      })
      .finally(() => {
        setLoadingExisting(false);
      });
  }, [orderIdToEdit]);

  const addProductToOrder = (prod: any) => {
    // If not already in order, add with initial size row
    const exists = entries.find(e => e.product.id === prod.id);
    if (!exists) {
      setEntries([
        ...entries,
        {
          product: prod,
          sizes: [{ size_inches: '20', pieces: '' }]
        }
      ]);
    }
    setProductModalOpen(false);
  };

  const removeProductFromOrder = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const addSizeRow = (prodIndex: number) => {
    const updated = [...entries];
    updated[prodIndex].sizes.push({ size_inches: '20', pieces: '' });
    setEntries(updated);
  };

  const removeSizeRow = (prodIndex: number, sizeIndex: number) => {
    const updated = [...entries];
    if (updated[prodIndex].sizes.length > 1) {
      updated[prodIndex].sizes = updated[prodIndex].sizes.filter((_, i) => i !== sizeIndex);
      setEntries(updated);
    }
  };

  const updateSizeRow = (prodIndex: number, sizeIndex: number, field: keyof SizeRow, val: string) => {
    const updated = [...entries];
    updated[prodIndex].sizes[sizeIndex][field] = val;
    setEntries(updated);
  };

  // Helper to calculate expected weight for a size row:
  // Formula: (size_inches / 20) * std_weight_per_20in * pieces
  const calculateRowWeight = (prod: any, row: SizeRow): number => {
    const size = parseFloat(row.size_inches) || 0;
    const pcs = parseInt(row.pieces, 10) || 0;
    const stdWeight = prod.std_weight_per_20in || 20.0;
    if (size <= 0 || pcs <= 0) return 0;
    return (size / 20.0) * stdWeight * pcs;
  };

  // Calculate Product Total
  const calculateProductTotal = (entry: OrderProductEntry): number => {
    return entry.sizes.reduce((acc, row) => acc + calculateRowWeight(entry.product, row), 0);
  };

  // Grand Totals
  const totalPieces = entries.reduce((acc, entry) => {
    return acc + entry.sizes.reduce((sAcc, row) => sAcc + (parseInt(row.pieces, 10) || 0), 0);
  }, 0);

  const totalExpectedWeight = entries.reduce((acc, entry) => {
    return acc + calculateProductTotal(entry);
  }, 0);

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      setError('Please select a customer');
      return;
    }

    if (entries.length === 0) {
      setError('Please add at least one product to the order');
      return;
    }

    if (totalPieces <= 0) {
      setError('Please enter pieces for the ordered items');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        customer_id: selectedCustomer.id,
        advance_amount: parseFloat(advanceAmount) || 0,
        special_notes: specialNotes,
        products: entries.map(e => ({
          product_id: e.product.id,
          sizes: e.sizes.filter(s => (parseInt(s.pieces, 10) || 0) > 0)
        }))
      };

      if (orderIdToEdit) {
        await api.updateOrder(orderIdToEdit, payload);
        if (onOrderUpdated) {
          onOrderUpdated(orderIdToEdit);
        } else {
          onOrderCreated(orderIdToEdit);
        }
      } else {
        const res = await api.createOrder(payload);
        onOrderCreated(res.order.id);
      }
    } catch (err: any) {
      setError(err.message || (orderIdToEdit ? 'Failed to modify order' : 'Failed to create order'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] pb-32 max-w-lg mx-auto">
      {/* Header matching Screenshot Image 19 */}
      <div className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-xs px-4 py-3 border-b border-[#D2BFA7]/40 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-base font-semibold text-[#2F2923] hover:text-[#6B5744]"
        >
          <ArrowLeft size={20} />
          <span>{orderIdToEdit ? `Modify Order ${existingOrderNumber}` : 'New Order'}</span>
        </button>
      </div>

      {loadingExisting ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-[#766B60]">Loading order details...</p>
        </div>
      ) : (

      <div className="px-4 pt-4 space-y-6">
        {error && (
          <div className="p-3 bg-[#FBE9E9] border border-[#C94C4C]/20 rounded-xl text-sm text-[#C94C4C]">
            {error}
          </div>
        )}

        {/* CUSTOMER Section matching Screenshot Image 19 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            CUSTOMER
          </label>
          <div
            onClick={() => setCustomerModalOpen(true)}
            className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-[#6B5744] shadow-card transition-colors"
          >
            {selectedCustomer ? (
              <div>
                <p className="font-bold text-base text-[#2F2923]">
                  {selectedCustomer.company_name}
                </p>
                <p className="text-xs text-[#766B60]">
                  {selectedCustomer.poc_name} · {selectedCustomer.phone} · {selectedCustomer.city}
                </p>
              </div>
            ) : (
              <span className="text-sm text-[#766B60]">Select a customer...</span>
            )}
            <span className="text-[#766B60] text-sm">›</span>
          </div>
        </div>

        {/* PRODUCTS Section matching Screenshot Image 19 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            PRODUCTS
          </label>

          <div className="space-y-4">
            {entries.map((entry, prodIndex) => (
              <div
                key={entry.product.id}
                className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-4 shadow-card"
              >
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-base text-[#2F2923]">
                      {entry.product.name}
                    </h3>
                    <p className="text-xs text-[#766B60]">
                      {entry.product.sku} · {entry.product.std_weight_per_20in}g/20in
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProductFromOrder(prodIndex)}
                    className="text-[#C94C4C] p-1 hover:bg-[#FBE9E9] rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Size Rows */}
                <div className="space-y-2 mb-3">
                  {entry.sizes.map((row, sizeIndex) => {
                    const rowWeight = calculateRowWeight(entry.product, row);
                    return (
                      <div key={sizeIndex} className="flex items-center gap-2">
                        {/* Size (in) Input */}
                        <div className="flex-1">
                          <input
                            type="number"
                            step="any"
                            value={row.size_inches}
                            onChange={(e) => updateSizeRow(prodIndex, sizeIndex, 'size_inches', e.target.value)}
                            placeholder="Size (in)"
                            className="w-full px-3 py-2 bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] text-center font-medium focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                          />
                        </div>

                        {/* Pieces Input */}
                        <div className="flex-1">
                          <input
                            type="number"
                            min="1"
                            value={row.pieces}
                            onChange={(e) => updateSizeRow(prodIndex, sizeIndex, 'pieces', e.target.value)}
                            placeholder="Pieces"
                            className="w-full px-3 py-2 bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] text-center font-medium focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                          />
                        </div>

                        {/* Weight Badge matching Screenshot 19 */}
                        <div className="w-20 py-2 bg-[#E8DCCB]/60 border border-[#D2BFA7]/50 rounded-xl text-center text-xs font-semibold text-[#2F2923]">
                          {rowWeight.toFixed(2)}g
                        </div>

                        {/* Remove Size Row Button */}
                        {entry.sizes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSizeRow(prodIndex, sizeIndex)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[#766B60] hover:text-[#C94C4C] hover:bg-[#FBE9E9]"
                          >
                            <Minus size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Size & Product Subtotal */}
                <div className="flex items-center justify-between pt-2 border-t border-[#E8DCCB]/60 text-xs">
                  <button
                    type="button"
                    onClick={() => addSizeRow(prodIndex)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#2F2923] hover:text-[#6B5744]"
                  >
                    <Plus size={15} />
                    <span>Add size</span>
                  </button>

                  <span className="font-semibold text-[#766B60]">
                    Total: {calculateProductTotal(entry).toFixed(3)}g
                  </span>
                </div>
              </div>
            ))}

            {/* + Add Product Button matching Screenshot Image 19 */}
            <button
              type="button"
              onClick={() => setProductModalOpen(true)}
              className="w-full py-3 bg-[#E8DCCB]/50 hover:bg-[#E8DCCB] border border-[#D2BFA7] rounded-2xl font-bold text-sm text-[#2F2923] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus size={18} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Advance Amount (₹) matching Screenshot Image 19 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            Advance Amount (₹)
          </label>
          <input
            type="number"
            min="0"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            className="w-full px-4 py-3 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-base text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
          />
        </div>

        {/* Special Notes matching Screenshot Image 19 */}
        <div>
          <label className="block text-xs font-bold tracking-wider text-[#766B60] uppercase mb-2">
            Special Notes
          </label>
          <textarea
            rows={3}
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            placeholder="Manufacturing instructions, packaging..."
            className="w-full px-4 py-3 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
          />
        </div>
      </div>
      )}

      {/* Bottom Sticky Action Bar matching Screenshot Image 24 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#F5F0E8] border-t border-[#D2BFA7] p-4 max-w-lg mx-auto space-y-2">
        {/* Dark Summary Pill Bar matching Image 24 */}
        <div className="bg-[#6B5744] text-white rounded-2xl p-3 flex items-center justify-between px-6 shadow-sm">
          <div>
            <span className="block text-[10px] font-bold tracking-wider text-[#D2BFA7] uppercase">
              TOTAL PIECES
            </span>
            <span className="text-xl font-bold">{totalPieces}</span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold tracking-wider text-[#D2BFA7] uppercase">
              EXPECTED WEIGHT
            </span>
            <span className="text-xl font-bold">{totalExpectedWeight.toFixed(3)}g</span>
          </div>
        </div>

        {/* Create / Save Order Button */}
        <button
          type="button"
          disabled={submitting || loadingExisting}
          onClick={handleSubmit}
          className="w-full py-3.5 bg-[#B49A7A] hover:bg-[#6B5744] active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-2xl transition-all shadow-xs"
        >
          {submitting
            ? (orderIdToEdit ? 'Saving Changes...' : 'Creating Order...')
            : (orderIdToEdit ? 'Save Order Modifications' : 'Create Order')}
        </button>
      </div>

      {/* SELECT CUSTOMER MODAL matching Screenshot Image 22 */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-[#F5F0E8] rounded-t-3xl border-t border-[#D2BFA7] max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
            <div className="p-4 border-b border-[#D2BFA7] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setCustomerModalOpen(false)} className="text-[#2F2923]">
                  <X size={20} />
                </button>
                <h3 className="text-lg font-bold text-[#2F2923]">Select Customer</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#766B60]" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setCustomerModalOpen(false);
                  onNewCustomerFromOrder();
                }}
                className="w-full py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm font-semibold text-[#2F2923] hover:bg-[#E8DCCB]/40 text-left px-4"
              >
                + Add new customer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
              {customers
                .filter(c =>
                  !customerSearch ||
                  c.poc_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.company_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.city?.toLowerCase().includes(customerSearch.toLowerCase())
                )
                .map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerModalOpen(false);
                    }}
                    className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3.5 cursor-pointer hover:border-[#6B5744] transition-colors"
                  >
                    <p className="font-bold text-sm text-[#2F2923]">{c.poc_name}</p>
                    <p className="text-xs text-[#766B60]">{c.company_name} · {c.city}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* SELECT PRODUCT MODAL matching Screenshot Image 21 */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-[#F5F0E8] rounded-t-3xl border-t border-[#D2BFA7] max-h-[85vh] flex flex-col max-w-lg mx-auto w-full">
            <div className="p-4 border-b border-[#D2BFA7] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setProductModalOpen(false)} className="text-[#2F2923]">
                  <X size={20} />
                </button>
                <h3 className="text-lg font-bold text-[#2F2923]">Select Product</h3>
              </div>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#766B60]" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
              {products
                .filter(p =>
                  !productSearch ||
                  p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                  p.sku?.toLowerCase().includes(productSearch.toLowerCase())
                )
                .map((p) => (
                  <div
                    key={p.id}
                    onClick={() => addProductToOrder(p)}
                    className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3.5 cursor-pointer hover:border-[#6B5744] transition-colors"
                  >
                    <p className="font-bold text-sm text-[#2F2923]">{p.name}</p>
                    <p className="text-xs text-[#766B60]">
                      {p.sku} · {p.category_name || 'Chains'} · {p.std_weight_per_20in}g/20in
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
