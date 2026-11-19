import React, { useState, useEffect } from 'react';
import { LogIn, UserPlus, Briefcase } from 'lucide-react';
import { getBrandConfig, getActiveBrand, type Brand } from '../brand';

interface LandingScreenProps {
  onSignIn: () => void;
  onSignUp: () => void;
  onStaffLogin: () => void;
}

// Logo only, with the sign-in buttons below it (Standalone per brand link)
export const LandingScreen: React.FC<LandingScreenProps> = ({ onSignIn, onSignUp, onStaffLogin }) => {
  const [brand, setBrand] = useState<Brand>(getActiveBrand);

  useEffect(() => {
    setBrand(getActiveBrand());
    const handlePopState = () => setBrand(getActiveBrand());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const brandConfig = getBrandConfig(brand);

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col max-w-lg mx-auto px-5 py-8">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <img
          src={brandConfig.logoUrl}
          alt={brandConfig.displayName}
          className="h-24 w-auto max-w-[260px] object-contain mb-12 select-none"
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
            className="w-full py-3.5 bg-white hover:bg-[#FAF6F0] text-[#2F2923] border border-[#D2BFA7] font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-xs"
          >
            <UserPlus size={18} /> Apply for New Account
          </button>
        </div>
      </div>

      {/* Subtle staff login footer */}
      <div className="mt-8 pt-4 border-t border-[#D2BFA7]/40 text-center">
        <button
          onClick={onStaffLogin}
          className="text-xs text-[#766B60] hover:text-[#2F2923] flex items-center justify-center gap-1.5 mx-auto font-medium"
        >
          <Briefcase size={13} />
          Internal Staff Login
        </button>
      </div>
    </div>
  );
};
