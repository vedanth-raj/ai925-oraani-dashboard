import React from 'react';
import { LogIn, UserPlus, Briefcase } from 'lucide-react';
import { getBrandConfig, getActiveBrand, setActiveBrand, type Brand } from '../brand';

interface LandingScreenProps {
  onSignIn: () => void;
  onSignUp: () => void;
  onStaffLogin: () => void;
}

// Logo only, with the sign-in buttons below it
export const LandingScreen: React.FC<LandingScreenProps> = ({ onSignIn, onSignUp, onStaffLogin }) => {
  const [currentBrand, setCurrentBrand] = React.useState<Brand>(getActiveBrand());
  const brandConfig = getBrandConfig(currentBrand);

  const handleSwitchBrand = (newBrand: Brand) => {
    setActiveBrand(newBrand);
    setCurrentBrand(newBrand);
    // Update URL query or path nicely without full page reload
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('brand', newBrand.toLowerCase());
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col max-w-lg mx-auto px-5 py-8">
      {/* Brand Selector Pill */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-[#E8DCCB] p-1 rounded-full text-xs font-semibold">
          <button
            onClick={() => handleSwitchBrand('AI925')}
            className={`px-3 py-1 rounded-full transition-all ${currentBrand === 'AI925' ? 'bg-[#6B5744] text-[#FFFCF7] shadow-xs' : 'text-[#766B60] hover:text-[#2F2923]'}`}
          >
            AI 925
          </button>
          <button
            onClick={() => handleSwitchBrand('ORAANI')}
            className={`px-3 py-1 rounded-full transition-all ${currentBrand === 'ORAANI' ? 'bg-[#6B5744] text-[#FFFCF7] shadow-xs' : 'text-[#766B60] hover:text-[#2F2923]'}`}
          >
            Oraani
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <img
          src={brandConfig.logoUrl}
          alt={brandConfig.displayName}
          className="h-28 w-auto max-w-[260px] object-contain mb-12 filter drop-shadow-xs"
        />

        <div className="w-full space-y-3">
          <button
            onClick={onSignIn}
            className="w-full py-3.5 bg-[#6B5744] hover:bg-[#584534] text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm"
          >
            <LogIn size={18} /> Sign In to {brandConfig.displayName}
          </button>
          <button
            onClick={onSignUp}
            className="w-full py-3.5 bg-[#FFFCF7] border border-[#6B5744] text-[#6B5744] font-bold rounded-2xl flex items-center justify-center gap-2"
          >
            <UserPlus size={18} /> Create a new {brandConfig.displayName} account
          </button>
        </div>
      </div>

      <button onClick={onStaffLogin} className="mt-8 mx-auto flex items-center gap-1.5 text-xs font-semibold text-[#766B60] hover:text-[#2F2923]">
        <Briefcase size={14} /> Staff login
      </button>
    </div>
  );
};
