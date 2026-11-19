import React, { useState } from 'react';
import { useAuth } from '../auth';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { getBrandConfig, getActiveBrand } from '../brand';

export const LoginScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { login } = useAuth();
  const brandConfig = getBrandConfig(getActiveBrand());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false); // Default option MUST be unticked
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    if (!password) {
      setError('Please enter your password / PIN');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(username.trim(), password, rememberMe);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto">
      {onBack && (
        <button onClick={onBack} className="self-start flex items-center gap-1.5 text-sm font-semibold text-[#2F2923] mb-4">
          <ArrowLeft size={18} /> Customer sign in
        </button>
      )}
      {/* Brand Logo */}
      <div className="mb-6 flex flex-col items-center">
        <img
          src={brandConfig.logoUrl}
          alt={`${brandConfig.displayName} Logo`}
          className="h-16 w-auto max-w-[220px] object-contain filter drop-shadow-xs"
        />
        <p className="text-[11px] font-semibold tracking-widest text-[#766B60] uppercase mt-2">
          {brandConfig.displayName} ORDER MANAGEMENT SYSTEM
        </p>
      </div>

      {/* Unified Login Card without any role toggle */}
      <div className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={20} className="text-[#6B5744]" />
          <h2 className="text-xl font-bold text-[#2F2923]">
            Sign In
          </h2>
        </div>
        <p className="text-xs text-[#766B60] mb-6">
          Enter your assigned username and password to access your dashboard.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-[#FBE9E9] border border-[#C94C4C]/20 rounded-xl text-xs font-medium text-[#C94C4C]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <User
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]"
              />
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-2.5 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60]/50 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1.5">
              Password / PIN
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#766B60]"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password or PIN"
                className="w-full pl-10 pr-10 py-2.5 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60]/50 focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744] transition-all font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#766B60] hover:text-[#2F2923] p-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox - default unticked */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[#D2BFA7] text-[#6B5744] focus:ring-[#6B5744]/30 focus:ring-offset-0 cursor-pointer accent-[#6B5744]"
              />
              <span className="text-xs font-medium text-[#766B60]">Remember me</span>
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 bg-[#6B5744] hover:bg-[#584534] active:bg-[#473B32] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-[#E8DCCB] text-[11px] text-[#766B60] text-center space-y-1">
          <p>Credentials are configured and managed by the System Administrator.</p>
          <p className="text-[10px] text-[#766B60]/80">Master Code emergency backup access supported.</p>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-[#766B60]">
        AI925 Order Management System · v1.0
      </div>
    </div>
  );
};
