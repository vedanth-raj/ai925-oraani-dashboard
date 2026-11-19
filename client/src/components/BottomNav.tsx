import React from 'react';
import { LayoutGrid, FileText, Package, Users, Menu } from 'lucide-react';

export type TabKey = 'dashboard' | 'orders' | 'products' | 'customers' | 'more';

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { key: 'orders', label: 'Orders', icon: FileText },
    { key: 'products', label: 'Products', icon: Package },
    { key: 'customers', label: 'Customers', icon: Users },
    { key: 'more', label: 'More', icon: Menu },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 bg-[#FFFCF7] border-t border-[#D2BFA7] safe-bottom w-full max-w-lg shadow-sm">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key as TabKey)}
              className="flex-1 flex flex-col items-center justify-center py-1 transition-colors"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.8}
                className={isActive ? 'text-[#6B5744]' : 'text-[#766B60]'}
              />
              <span
                style={{ fontSize: '11px', letterSpacing: '0.2px' }}
                className={`mt-1 font-semibold ${
                  isActive ? 'text-[#6B5744]' : 'text-[#766B60]'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
