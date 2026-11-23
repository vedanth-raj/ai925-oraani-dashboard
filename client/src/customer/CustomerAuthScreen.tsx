import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, IdCard, KeyRound, Loader2, ShieldCheck, Trash2, Upload, Smartphone } from 'lucide-react';
import { useCustomerSession } from './customerSession';
import { compressImage } from '../utils/imageCompressor';
import { ACCOUNT_TYPES, portalApi, type AccountType } from '../api';
import { getBrandConfig, getActiveBrand } from '../brand';
import { getIndianStateFromPincode, normalizeIndianState } from '../utils/pincode';
import { sendFirebasePhoneOtp, type ConfirmationResult } from '../firebase';

interface CustomerAuthScreenProps {
  mode: 'signin' | 'signup';
  onSwitchMode: (mode: 'signin' | 'signup') => void;
  onBack: () => void;
}

const field = 'w-full px-4 py-2.5 bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] placeholder-[#766B60]/60 focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744]';
const label = 'block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1.5';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Chandigarh', 'Puducherry'
];

export const CustomerAuthScreen: React.FC<CustomerAuthScreenProps> = ({ mode, onSwitchMode, onBack }) => {
  const { signIn, signInWithOtp, signInWithFirebase, register } = useCustomerSession();
  const activeBrand = getActiveBrand();
  const brandConfig = getBrandConfig(activeBrand);

  // Sign In tabs: OTP (default) or Password
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('otp');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP flow state
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [firebaseConfirmation, setFirebaseConfirmation] = useState<ConfirmationResult | null>(null);

  // Sign Up form state
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [gstin, setGstin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  const [idCard, setIdCard] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  // Timer for OTP resend countdown
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  // Automatic state detection when entering 6 digits of PIN code
  const handlePinChange = async (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPinCode(digits);
    setPinNotice(null);

    // Instant offline state detection (0ms delay)
    const instantState = getIndianStateFromPincode(digits);
    if (instantState) {
      setSelectedState(instantState);
      setPinNotice(`Detected: ${instantState}`);
    }

    if (digits.length === 6) {
      setPinLoading(true);
      try {
        const res = await portalApi.lookupPincode(digits);
        if (res.state) {
          const normalized = normalizeIndianState(res.state);
          setSelectedState(normalized);
          setPinNotice(`Auto-fetched: ${normalized}${res.city ? ` (${res.city})` : ''}`);
        }
      } catch (err) {
        // Fallback continues with instant state
      } finally {
        setPinLoading(false);
      }
    }
  };

  const handleIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setIdCard(compressed);
    setIdCardPreview(URL.createObjectURL(compressed));
  };

  // Request Phone OTP for sign in via Firebase Phone Auth (Google SMS)
  const handleSendOtp = async () => {
    const cleanPhone = identifier.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const confirmation = await sendFirebasePhoneOtp(cleanPhone);
      setFirebaseConfirmation(confirmation);
      setOtpSent(true);
      setOtpCountdown(45);
      setOtpNotice(`Verification code sent via SMS to +91 ${cleanPhone}`);
    } catch (err: any) {
      console.error('[Firebase Phone Auth Error]', err);
      const code = err?.code || '';
      let msg = err?.message || 'Could not send verification code';
      if (code === 'auth/invalid-app-credential') {
        msg = window.location.hostname === 'localhost'
          ? 'Google blocks live SMS on "localhost". Please open http://127.0.0.1:3000/oraani in your browser instead!'
          : 'App verification failed. Please reload and try again.';
      } else if (code === 'auth/invalid-phone-number') {
        msg = 'Invalid mobile number format';
      } else if (code === 'auth/quota-exceeded') {
        msg = 'SMS quota exceeded for today. Please try again later.';
      } else if (code === 'auth/captcha-check-failed') {
        msg = 'reCAPTCHA verification failed. Please try again.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many requests. Please wait a minute before requesting another code.';
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignUp) {
      const digits = phone.replace(/\D/g, '');
      if (!fullName.trim()) return setError('Please enter your name');
      if (!accountType) return setError('Please choose Retailer, Wholesaler or Both');
      if (digits.length < 10) return setError('Please enter a valid 10-digit mobile number');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email address');
      if (!address.trim()) return setError('Please enter your address');
      if (pinCode.trim() && !/^\d{6}$/.test(pinCode.trim())) return setError('Please enter a valid 6-digit PIN code');

      // Mandatory business verification: Must provide either GST number or Business Card upload
      if (!gstin.trim() && !idCard) {
        return setError('Business verification is mandatory: Please enter your GST registration number OR upload your business card / ID proof to register.');
      }

      if (password.length < 6) return setError('Password must be at least 6 characters');
      if (password !== confirm) return setError('Passwords do not match');

      setBusy(true);
      try {
        const fd = new FormData();
        fd.append('full_name', fullName.trim());
        fd.append('company_name', companyName.trim());
        fd.append('phone', phone.trim());
        fd.append('email', email.trim());
        fd.append('address', address.trim());
        fd.append('pin_code', pinCode.trim());
        fd.append('state', selectedState.trim());
        fd.append('password', password);
        fd.append('account_type', accountType || '');
        fd.append('brand', activeBrand);
        if (gstin.trim()) fd.append('gstin', gstin.trim().toUpperCase());
        if (idCard) fd.append('id_card', idCard);
        await register(fd);
      } catch (err: any) {
        setError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Sign in flow: OTP (Firebase Phone SMS)
    if (authMethod === 'otp') {
      const cleanPhone = identifier.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) return setError('Please enter a valid 10-digit mobile number');
      if (!otpCode.trim() || otpCode.trim().length !== 6) return setError('Please enter the 6-digit verification code');

      setBusy(true);
      try {
        if (firebaseConfirmation) {
          const cred = await firebaseConfirmation.confirm(otpCode.trim());
          const idToken = await cred.user.getIdToken();
          await signInWithFirebase(idToken, rememberMe);
        } else {
          await signInWithOtp(cleanPhone, otpCode.trim(), rememberMe);
        }
      } catch (err: any) {
        console.error('[Verification Error]', err);
        setError(err.message || 'Invalid or expired verification code');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Password sign in
    const cleanPhone = identifier.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || !password) {
      return setError('Enter your 10-digit mobile number and password');
    }

    setBusy(true);
    try {
      await signIn(cleanPhone, password, rememberMe);
    } catch (err: any) {
      setError(err.message || 'Invalid mobile number or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] max-w-lg mx-auto px-4 pt-5 pb-[max(3rem,calc(env(safe-area-inset-bottom)+2rem))]">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-[#2F2923] mb-4">
        <ArrowLeft size={18} /> Back
      </button>

      <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-sm">
        <div className="flex justify-center mb-5">
          <img
            src={brandConfig.logoUrl}
            alt={brandConfig.displayName}
            className="h-16 md:h-20 w-auto max-w-[280px] object-contain"
          />
        </div>
        <h1 className="text-xl font-bold text-[#2F2923]">
          {isSignUp ? `Create your ${brandConfig.displayName} account` : `Welcome back to ${brandConfig.displayName}`}
        </h1>
        <p className="text-xs text-[#766B60] mb-5">
          {isSignUp
            ? 'Your profile will be verified by our team before you can buy.'
            : 'Sign in with your registered mobile number.'}
        </p>

        {/* Sign In Method Toggle: Password vs OTP */}
        {!isSignUp && (
          <div className="grid grid-cols-2 p-1 bg-[#F5F0E8] rounded-xl mb-4 border border-[#D2BFA7]">
            <button
              type="button"
              onClick={() => { setAuthMethod('password'); setError(null); }}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'password'
                  ? 'bg-[#6B5744] text-white shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              <KeyRound size={14} /> Password
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod('otp'); setError(null); }}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'otp'
                  ? 'bg-[#6B5744] text-white shadow-xs'
                  : 'text-[#766B60] hover:text-[#2F2923]'
              }`}
            >
              <ShieldCheck size={14} /> OTP Sign In
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-[#FBE9E9] border border-[#C94C4C]/30 rounded-xl text-xs font-medium text-[#C94C4C] space-y-2">
            <div>{error}</div>
            {error.includes('app.ai925.in') && (
              <a
                href="https://app.ai925.in"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6B5744] text-white rounded-lg font-bold text-[11px] hover:bg-[#584534]"
              >
                Go to AI 925 Portal (app.ai925.in) →
              </a>
            )}
            {error.includes('app.oraani.in') && (
              <a
                href="https://app.oraani.in"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#4A3B32] text-white rounded-lg font-bold text-[11px] hover:bg-[#392C24]"
              >
                Go to Oraani Portal (app.oraani.in) →
              </a>
            )}
          </div>
        )}
        {otpNotice && <div className="mb-4 p-3 bg-[#E3EEE6] border border-[#4F7D5B]/30 rounded-xl text-xs font-medium text-[#4F7D5B]">{otpNotice}</div>}

        <form onSubmit={submit} className="space-y-4" noValidate>
          {isSignUp ? (
            <>
              <div>
                <label className={label} htmlFor="su-name">Full name *</label>
                <input id="su-name" className={field} value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" placeholder="e.g. Gaurav Agarwal" />
              </div>
              <div>
                <label className={label} htmlFor="su-company">Shop / company name</label>
                <input id="su-company" className={field} value={companyName} onChange={e => setCompanyName(e.target.value)} autoComplete="organization" placeholder="Optional" />
              </div>
              <div role="radiogroup" aria-labelledby="su-type-label">
                <span id="su-type-label" className={label}>Account type *</span>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_TYPES.map(t => {
                    const active = accountType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setAccountType(t)}
                        className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                          active ? 'bg-[#6B5744] text-white border-[#6B5744]' : 'bg-[#FFFCF7] text-[#2F2923] border-[#D2BFA7] hover:border-[#6B5744]/60'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={label} htmlFor="su-phone">Mobile number *</label>
                  <input id="su-phone" type="tel" inputMode="numeric" className={field} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="10-digit mobile" />
                </div>
                <div>
                  <label className={label} htmlFor="su-email">Email *</label>
                  <input id="su-email" type="email" className={field} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="su-address">Address *</label>
                <textarea id="su-address" rows={2} className={`${field} resize-none`} value={address} onChange={e => setAddress(e.target.value)} autoComplete="street-address" placeholder="Shop / delivery address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider" htmlFor="su-pin">
                      PIN code
                    </label>
                    {pinLoading && <Loader2 size={12} className="animate-spin text-[#6B5744]" />}
                  </div>
                  <input
                    id="su-pin"
                    inputMode="numeric"
                    maxLength={6}
                    className={field}
                    value={pinCode}
                    onChange={e => handlePinChange(e.target.value)}
                    autoComplete="postal-code"
                    placeholder="e.g. 403001"
                  />
                  {pinNotice && (
                    <p className="text-[10px] text-[#4F7D5B] font-semibold mt-1 flex items-center gap-1">
                      <Check size={12} /> {pinNotice}
                    </p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="su-state">State</label>
                  <select
                    id="su-state"
                    className={field}
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                  >
                    <option value="">Select state...</option>
                    {INDIAN_STATES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mandatory Business Verification: GST No. OR Business Card */}
              <div className="p-3.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-xl space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#6B5744] uppercase flex items-center gap-1.5">
                      <IdCard size={14} /> Business Verification *
                    </span>
                    <span className="text-[10px] font-bold text-[#8C4A27] bg-[#FBE9E9] border border-[#C94C4C]/20 px-2 py-0.5 rounded-full">
                      GST or Card Required
                    </span>
                  </div>
                  <p className="text-[11px] text-[#766B60] leading-snug">
                    Enter your GST registration number <strong>OR</strong> upload your visiting/business card below to create your profile.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#2F2923] mb-1">
                    GST Registration Number
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={e => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className="w-full px-3 py-2 bg-white border border-[#D2BFA7] rounded-xl text-sm font-mono text-[#2F2923] placeholder-[#766B60] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-[#D2BFA7] flex-1" />
                  <span className="text-[10px] font-bold text-[#766B60] uppercase">AND / OR</span>
                  <div className="h-px bg-[#D2BFA7] flex-1" />
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[#2F2923] mb-1">
                    Business Card / Visiting Card / GST Document
                  </span>
                  {idCardPreview ? (
                    <div className="flex items-center gap-3 p-2 bg-white border border-[#D2BFA7] rounded-xl">
                      <img src={idCardPreview} alt="Business card preview" className="w-16 h-12 object-cover rounded-lg border border-[#D2BFA7]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#2F2923] flex items-center gap-1"><IdCard size={13} /> Card Attached</p>
                        <p className="text-[11px] text-[#766B60] truncate">{idCard?.name}</p>
                      </div>
                      <button type="button" onClick={() => { setIdCard(null); setIdCardPreview(null); }} className="p-2 text-[#C94C4C]" title="Remove">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 p-2.5 border-2 border-dashed border-[#D2BFA7] rounded-xl bg-white cursor-pointer hover:bg-[#FAF6F0] transition-colors">
                      <Upload size={18} className="text-[#6B5744] shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-[#2F2923]">Upload Visiting Card or Certificate</p>
                        <p className="text-[10px] text-[#766B60]">Photo or scan of visiting card or certificate</p>
                      </div>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleIdCard} />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className={label} htmlFor="pw">Password *</label>
                <div className="relative">
                  <input
                    id="pw"
                    type={showPassword ? 'text' : 'password'}
                    className={`${field} pr-10`}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#766B60] p-1" aria-label="Show password">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className={label} htmlFor="pw2">Confirm password *</label>
                <input id="pw2" type={showPassword ? 'text' : 'password'} className={field} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
            </>
          ) : authMethod === 'otp' ? (
            /* OTP Sign In Form (Phone SMS only) */
            <div className="space-y-3">
              <div>
                <label className={label} htmlFor="si-id-otp">Registered Mobile Number</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#766B60] select-none">+91</span>
                    <input
                      id="si-id-otp"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      className={`${field} pl-11 font-mono tracking-wider font-semibold`}
                      value={identifier}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setIdentifier(v);
                        setOtpSent(false);
                        setFirebaseConfirmation(null);
                      }}
                      placeholder="10-digit mobile number"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={busy || otpCountdown > 0 || identifier.replace(/\D/g, '').length !== 10}
                    className="px-4 py-2.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white font-bold text-xs rounded-xl shrink-0 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {busy && !otpSent ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
                    {otpCountdown > 0 ? `${otpCountdown}s` : otpSent ? 'Resend' : 'Get OTP'}
                  </button>
                </div>
              </div>

              {/* Invisible Firebase reCAPTCHA container */}
              <div id="firebase-recaptcha-container"></div>



              {otpSent && (
                <div>
                  <label className={label} htmlFor="si-otp-code">6-Digit Verification Code</label>
                  <input
                    id="si-otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    className={`${field} text-center font-mono text-xl tracking-widest font-bold`}
                    placeholder="······"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <p className="text-[11px] text-[#766B60] mt-1.5 text-center">
                    Enter the 6-digit verification code sent via SMS to your mobile.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Password Sign In Form (Phone only) */
            <>
              <div>
                <label className={label} htmlFor="si-id">Registered Mobile Number</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#766B60] select-none">+91</span>
                  <input
                    id="si-id"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className={`${field} pl-11 font-mono tracking-wider font-semibold`}
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                  />
                </div>
              </div>

              <div>
                <label className={label} htmlFor="pw">Password</label>
                <div className="relative">
                  <input
                    id="pw"
                    type={showPassword ? 'text' : 'password'}
                    className={`${field} pr-10`}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Your password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#766B60] p-1 cursor-pointer" aria-label="Show password">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#D2BFA7] cursor-pointer accent-[#6B5744]"
                />
                <span className="text-xs font-medium text-[#766B60]">Remember me</span>
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={busy || (!isSignUp && authMethod === 'otp' && (!otpSent || otpCode.length !== 6))}
            className="w-full py-3.5 bg-[#6B5744] hover:bg-[#584534] disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isSignUp
              ? 'Submit for verification'
              : authMethod === 'otp'
              ? 'Verify & Sign In'
              : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-[#766B60] mt-5">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setError(null); setOtpNotice(null); onSwitchMode(isSignUp ? 'signin' : 'signup'); }} className="font-bold text-[#6B5744]">
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
};
