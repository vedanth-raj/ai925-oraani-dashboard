import React from 'react';
import { 
  Building2, Layers, Settings, LogOut, ChevronRight, HardDrive, Boxes,
  Truck, Scale, TrendingUp
} from 'lucide-react';
import { useAuth } from '../auth';

interface MoreScreenProps {
  onNavigate: (route: 'companies' | 'categories' | 'settings' | 'cloud' | 'inventory' | 'state_pricing' | 'delivery_charges' | 'slab_discounts') => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({ onNavigate }) => {
  const { user, isAdmin, isBusinessAdmin, isRep, logout } = useAuth();
  const canAccessCloud = isAdmin || isBusinessAdmin;

  return (
    <div className="pb-28 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#2F2923]">More</h1>
        <p className="text-xs text-[#766B60]">System management, catalogs & cloud storage</p>
      </div>

      {/* User Status Card */}
      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#E8DCCB] text-[#6B5744] flex items-center justify-center font-bold text-base border border-[#D2BFA7]">
            {user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'AI'}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#2F2923]">
              {user?.full_name || user?.username || 'User'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4F7D5B]"></span>
              <p className="text-xs font-semibold text-[#6B5744]">
                {isAdmin 
                  ? 'System Administrator' 
                  : isBusinessAdmin 
                    ? 'Business Administrator' 
                    : `Sales Representative · ${user?.assigned_region || 'West'}`}
              </p>
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-[#F5F0E8] text-[#766B60] border border-[#D2BFA7]">
          v1.0
        </span>
      </div>

      {/* TOP FEATURE: Private Cloud (Available to System Administrator and Business Administrator ONLY) */}
      {canAccessCloud && (
        <div className="mb-4">
          <div
            onClick={() => onNavigate('cloud')}
            className="bg-gradient-to-r from-[#6B5744] to-[#544333] text-white rounded-2xl p-4 shadow-md flex items-center justify-between hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
                <HardDrive size={22} className="text-[#FFFCF7]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-white">Private Cloud Drive</h3>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-white/80 mt-0.5">
                  Create folders, store data & upload any file type
                </p>
              </div>
            </div>
            <ChevronRight size={20} className="text-white/70 shrink-0" />
          </div>
        </div>
      )}

      {/* Main Menu Cards */}
      <div className="space-y-3 mb-6">
        {/* Whole Inventory: System Administrator and Business Administrator only */}
        {canAccessCloud && (
          <div
            onClick={() => onNavigate('inventory')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('inventory'); } }}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <Boxes size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">Whole Inventory</h3>
                <p className="text-xs text-[#766B60]">All stock by chain, weight & size · total stock weight</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* Companies: HIDDEN for Sales Representatives to prevent data leakages */}
        {!isRep && (
          <div
            onClick={() => onNavigate('companies')}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">Companies</h3>
                <p className="text-xs text-[#766B60]">Manage business accounts and assigned entities</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* Categories: For Administrators */}
        {isAdmin && (
          <div
            onClick={() => onNavigate('categories')}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <Layers size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">Categories</h3>
                <p className="text-xs text-[#766B60]">Chains, earrings, bracelets, and collection tags</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* State Labour Extra Costs: For Administrators */}
        {canAccessCloud && (
          <div
            onClick={() => onNavigate('state_pricing')}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">State Labour Extra Cost</h3>
                <p className="text-xs text-[#766B60]">Extra costs by state in % of labour charges (e.g. Goa +20%)</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* Customize Delivery Charges: For Administrators */}
        {canAccessCloud && (
          <div
            onClick={() => onNavigate('delivery_charges')}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <Truck size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">Customize Delivery Charges</h3>
                <p className="text-xs text-[#766B60]">Upload Excel file, download current list, or edit by PIN</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* Discount on Slab: For Administrators */}
        {canAccessCloud && (
          <div
            onClick={() => onNavigate('slab_discounts')}
            className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                <Scale size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F2923]">Discount on Slab</h3>
                <p className="text-xs text-[#766B60]">Weight-based labour discounts (₹/g off for 1-2kg, 2kg+)</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
          </div>
        )}

        {/* Settings: For Administrators */}
        <div
          onClick={() => onNavigate('settings')}
          className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between hover:border-[#B49A7A] active:bg-[#F5F0E8] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#2F2923]">Settings & Security</h3>
              <p className="text-xs text-[#766B60]">
                {isAdmin
                  ? 'Accounts, credentials, audits, backups & exports'
                  : 'Change security PIN / password'}
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-[#B49A7A] shrink-0" />
        </div>
      </div>

      {/* Sign Out Button */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="w-full bg-[#FFFCF7] border border-[#C94C4C]/40 text-[#C94C4C] py-3 rounded-full font-bold text-sm shadow-xs hover:bg-[#FBE9E9] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
