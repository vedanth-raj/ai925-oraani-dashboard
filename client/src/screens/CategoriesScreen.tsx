import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Layers, Trash2, Loader2, Package } from 'lucide-react';
import { api } from '../api';

interface CategoriesScreenProps {
  onBack: () => void;
}

export const CategoriesScreen: React.FC<CategoriesScreenProps> = ({ onBack }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.getCategories();
      setCategories(res.categories || []);
    } catch (err: any) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await api.createCategory({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      setSuccess('Category added successfully');
      fetchCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (catId: string, catName: string) => {
    if (!confirm(`Are you sure you want to archive "${catName}"?`)) return;

    try {
      await api.archiveCategory(catId);
      fetchCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to archive category');
    }
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Categories</h1>
          <p className="text-xs text-[#766B60]">Manage jewelry catalog categories</p>
        </div>
      </div>

      {/* Add Category Card */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
            New Category
          </h2>
        </div>

        {error && (
          <div className="bg-[#FBE9E9] border border-[#C94C4C]/30 text-[#C94C4C] p-2.5 rounded-lg text-xs mb-3">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-[#E3EEE6] border border-[#4F7D5B]/30 text-[#4F7D5B] p-2.5 rounded-lg text-xs mb-3">
            {success}
          </div>
        )}

        <form onSubmit={handleAddCategory} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bracelets, Pendants..."
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this collection..."
              className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full bg-[#6B5744] text-[#FFFCF7] py-2.5 rounded-lg font-bold text-xs shadow-xs hover:bg-[#584534] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={15} strokeWidth={2.5} />
            )}
            <span>Add Category</span>
          </button>
        </form>
      </div>

      {/* Existing Categories List */}
      <div>
        <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-2.5">
          Existing Categories ({categories.length})
        </h2>

        {loading && categories.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-6 text-center">
            <p className="text-xs text-[#766B60]">No categories created yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {categories.map((c) => {
              const productCount = Number(c.product_count || 0);

              return (
                <div
                  key={c.id}
                  className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3.5 flex items-center justify-between shadow-xs"
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-[#2F2923]">{c.name}</h3>
                    {c.description && (
                      <p className="text-xs text-[#766B60] truncate mt-0.5">{c.description}</p>
                    )}
                    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-[#6B5744]">
                      <Package size={11} />
                      <span>{productCount} {productCount === 1 ? 'product' : 'products'}</span>
                    </span>
                  </div>

                  {productCount === 0 && (
                    <button
                      onClick={() => handleArchive(c.id, c.name)}
                      className="p-2 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors"
                      title="Archive Category"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
