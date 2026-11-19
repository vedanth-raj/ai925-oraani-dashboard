import React from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { StatePremiumCard } from '../components/StatePremiumCard';

interface StatePricingScreenProps {
  onBack: () => void;
}

export const StatePricingScreen: React.FC<StatePricingScreenProps> = ({ onBack }) => {
  return (
    <div className="pb-28 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">State Labour Extra Cost</h1>
          <p className="text-xs text-[#766B60]">Set extra costs according to states in percent of labour charges</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-[#E8DCCB]/40 border border-[#D2BFA7] rounded-2xl p-4 mb-4 shadow-card">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={16} className="text-[#6B5744]" />
          <h2 className="text-xs font-bold text-[#6B5744] uppercase tracking-wider">State-Wise Pricing Rules</h2>
        </div>
        <p className="text-xs text-[#2F2923] leading-relaxed">
          Admin sets the markup prior for each state. For example: if <strong>Goa is set to +20%</strong>, customers belonging to Goa will see 20% extra added to the labour charges when viewing and buying products.
        </p>
      </div>

      <StatePremiumCard />
    </div>
  );
};
