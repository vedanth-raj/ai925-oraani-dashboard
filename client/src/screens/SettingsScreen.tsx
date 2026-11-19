import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, Lock, Shield, Download, 
  Database, CheckCircle2, AlertCircle, 
  Users, KeyRound, Loader2, FileSpreadsheet,
  Building2, ChevronDown, ChevronUp, Plus, Trash2, History, RefreshCw, FileArchive, Briefcase,
  MapPin, Upload, Navigation, ExternalLink
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { SilverRateCard } from '../components/SilverRateCard';
import { CommerceSettingsCard } from '../components/CommerceSettingsCard';
import { StatePremiumCard } from '../components/StatePremiumCard';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const { user, isAdmin, isBusinessAdmin } = useAuth();
  const canMonitorLocations = isAdmin || isBusinessAdmin;

  // Change PIN / Password State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Business Administrators State (Admin only)
  const [bizAdmins, setBizAdmins] = useState<any[]>([]);
  const [loadingBizAdmins, setLoadingBizAdmins] = useState(false);
  const [showAddBizAdmin, setShowAddBizAdmin] = useState(false);
  const [bizFullName, setBizFullName] = useState('');
  const [bizUsername, setBizUsername] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizPin, setBizPin] = useState('');
  const [creatingBizAdmin, setCreatingBizAdmin] = useState(false);

  // Reps Management State (Admin only)
  const [reps, setReps] = useState<any[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [showAddRep, setShowAddRep] = useState(false);
  const [repName, setRepName] = useState('');
  const [repUsername, setRepUsername] = useState('');
  const [repPhone, setRepPhone] = useState('');
  const [repCode, setRepCode] = useState('');
  const [repRegion, setRepRegion] = useState('North');
  const [repPin, setRepPin] = useState('123456');
  const [creatingRep, setCreatingRep] = useState(false);

  // Rep Company Assignments State & Unassigned Companies
  const [expandedRepId, setExpandedRepId] = useState<string | null>(null);
  const [repCompanies, setRepCompanies] = useState<Record<string, string[]>>({});
  const [unassignedCompanies, setUnassignedCompanies] = useState<string[]>([]);
  const [loadingCompaniesForRep, setLoadingCompaniesForRep] = useState<string | null>(null);
  const [selectedCompanyDropdown, setSelectedCompanyDropdown] = useState<Record<string, string>>({});
  const [customCompanyInput, setCustomCompanyInput] = useState<Record<string, string>>({});

  // Live Location Tracking (Admin & Business Admin)
  const [repLocations, setRepLocations] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Audit Logs State (Admin only)
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // CSV & ZIP Export State
  const [exportingType, setExportingType] = useState<'orders' | 'products' | 'customers' | 'images' | null>(null);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // CSV Import State
  const [importingType, setImportingType] = useState<'customers' | 'products' | 'orders' | null>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup State
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  const customerCsvInputRef = useRef<HTMLInputElement | null>(null);
  const productCsvInputRef = useRef<HTMLInputElement | null>(null);
  const orderCsvInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchBizAdmins();
      fetchReps();
      fetchAuditLogs();
      fetchBackups();
      fetchUnassignedCompanies();
    }
    if (canMonitorLocations) {
      fetchRepLocations();
    }
  }, [isAdmin, canMonitorLocations]);

  const fetchBizAdmins = async () => {
    try {
      setLoadingBizAdmins(true);
      const res = await api.getBusinessAdmins();
      setBizAdmins(res.business_admins || []);
    } catch (err) {
      console.error('Failed to load business admins:', err);
    } finally {
      setLoadingBizAdmins(false);
    }
  };

  const fetchReps = async () => {
    try {
      setLoadingReps(true);
      const res = await api.getRepresentatives();
      setReps(res.representatives || []);
    } catch (err) {
      console.error('Failed to load reps:', err);
    } finally {
      setLoadingReps(false);
    }
  };

  const fetchUnassignedCompanies = async () => {
    try {
      const res = await api.getUnassignedCompanies();
      setUnassignedCompanies(res.companies || []);
    } catch (err) {
      console.error('Failed to load unassigned companies:', err);
    }
  };

  const fetchRepLocations = async () => {
    try {
      setLoadingLocations(true);
      const res = await api.getRepLocations();
      setRepLocations(res.representatives || []);
    } catch (err) {
      console.error('Failed to load rep locations:', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const res = await api.getAuditLogs({ limit: '30' });
      setAuditLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await api.getBackups();
      setBackups(res.backups || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPin || !newPin) return;
    if (newPin.length < 4) {
      setPinMessage({ type: 'error', text: 'New PIN/password must be at least 4 characters' });
      return;
    }

    try {
      setPinLoading(true);
      setPinMessage(null);
      await api.updatePin(currentPin, newPin);
      setPinMessage({ type: 'success', text: 'PIN/Password successfully updated!' });
      setCurrentPin('');
      setNewPin('');
    } catch (err: any) {
      setPinMessage({ type: 'error', text: err.message || 'Failed to update PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  // Business Administrator Handlers
  const handleCreateBizAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizFullName.trim()) return;

    try {
      setCreatingBizAdmin(true);
      await api.createBusinessAdmin({
        full_name: bizFullName.trim(),
        username: bizUsername.trim() || undefined,
        phone: bizPhone.trim() || undefined,
        pin: bizPin.trim() || '123456',
        password: bizPin.trim() || '123456'
      });
      setBizFullName('');
      setBizUsername('');
      setBizPhone('');
      setBizPin('');
      setShowAddBizAdmin(false);
      fetchBizAdmins();
    } catch (err: any) {
      alert(err.message || 'Failed to create business administrator');
    } finally {
      setCreatingBizAdmin(false);
    }
  };

  const handleResetBizAdminPin = async (adminId: string, adminName: string) => {
    const newPinInput = prompt(`Enter new PIN / Password for Business Administrator "${adminName}" (min 4 characters):`, '123456');
    if (!newPinInput) return;
    if (newPinInput.length < 4) {
      alert('PIN / password must be at least 4 characters');
      return;
    }

    try {
      await api.resetBusinessAdminPin(adminId, newPinInput);
      alert(`PIN / Password for "${adminName}" successfully reset!`);
    } catch (err: any) {
      alert(err.message || 'Failed to reset PIN');
    }
  };

  const handleDeleteBizAdmin = async (adminId: string, adminName: string) => {
    if (!confirm(`Are you sure you want to delete Business Administrator "${adminName}"?`)) return;
    try {
      await api.deleteBusinessAdmin(adminId);
      fetchBizAdmins();
    } catch (err: any) {
      alert(err.message || 'Failed to delete business administrator');
    }
  };

  // Sales Representative Handlers
  const handleCreateRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repName.trim()) return;

    try {
      setCreatingRep(true);
      await api.createRepresentative({
        full_name: repName.trim(),
        username: repUsername.trim() || undefined,
        phone: repPhone.trim() || undefined,
        employee_code: repCode.trim() || undefined,
        assigned_region: repRegion,
        pin: repPin,
        password: repPin
      });
      setRepName('');
      setRepUsername('');
      setRepPhone('');
      setRepCode('');
      setRepPin('123456');
      setShowAddRep(false);
      fetchReps();
      fetchRepLocations();
    } catch (err: any) {
      alert(err.message || 'Failed to create sales representative');
    } finally {
      setCreatingRep(false);
    }
  };

  const handleResetRepPin = async (repId: string, repName: string) => {
    const newPinInput = prompt(`Enter new PIN / Password for Sales Rep "${repName}" (min 4 characters):`, '123456');
    if (!newPinInput) return;
    if (newPinInput.length < 4) {
      alert('PIN / password must be at least 4 characters');
      return;
    }

    try {
      await api.resetRepresentativePin(repId, newPinInput);
      alert(`PIN / Password for "${repName}" successfully reset!`);
    } catch (err: any) {
      alert(err.message || 'Failed to reset PIN');
    }
  };

  const handleDeleteRep = async (repId: string, repName: string) => {
    if (!confirm(`Are you sure you want to delete Sales Representative "${repName}"?`)) return;
    try {
      await api.deleteRepresentative(repId);
      fetchReps();
      fetchRepLocations();
    } catch (err: any) {
      alert(err.message || 'Failed to delete sales representative');
    }
  };

  // Company Assignment Handlers (Exclusivity & Dropdown)
  const toggleRepCompanies = async (repId: string) => {
    if (expandedRepId === repId) {
      setExpandedRepId(null);
      return;
    }
    setExpandedRepId(repId);
    fetchUnassignedCompanies();
    if (!repCompanies[repId]) {
      try {
        setLoadingCompaniesForRep(repId);
        const res = await api.getRepCompanies(repId);
        setRepCompanies(prev => ({ ...prev, [repId]: res.companies || [] }));
      } catch (err) {
        console.error('Failed to load companies for rep:', err);
      } finally {
        setLoadingCompaniesForRep(null);
      }
    }
  };

  const handleAssignCompany = async (repId: string) => {
    const selected = selectedCompanyDropdown[repId];
    const custom = customCompanyInput[repId]?.trim();
    const company = selected === '__custom__' ? custom : (selected || custom);

    if (!company) {
      alert('Please select or enter a company name to assign');
      return;
    }

    try {
      await api.assignRepCompany(repId, company);
      setRepCompanies(prev => ({
        ...prev,
        [repId]: [...(prev[repId] || []), company]
      }));
      setSelectedCompanyDropdown(prev => ({ ...prev, [repId]: '' }));
      setCustomCompanyInput(prev => ({ ...prev, [repId]: '' }));
      fetchUnassignedCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to assign company');
    }
  };

  const handleUnassignCompany = async (repId: string, company: string) => {
    try {
      await api.unassignRepCompany(repId, company);
      setRepCompanies(prev => ({
        ...prev,
        [repId]: (prev[repId] || []).filter(c => c !== company)
      }));
      fetchUnassignedCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to remove company');
    }
  };

  // Download Handlers
  const handleDownload = async (type: 'orders' | 'products' | 'customers' | 'images') => {
    try {
      setExportingType(type);
      setExportMessage(null);
      if (type === 'orders') {
        await api.downloadOrdersCsv();
      } else if (type === 'products') {
        await api.downloadProductsCsv();
      } else if (type === 'customers') {
        await api.downloadCustomersCsv();
      } else if (type === 'images') {
        await api.downloadOrderImagesZip();
      }
      setExportMessage({ type: 'success', text: `${type.toUpperCase()} downloaded successfully in clean format!` });
    } catch (err: any) {
      setExportMessage({ type: 'error', text: err.message || `Failed to download ${type}` });
    } finally {
      setExportingType(null);
    }
  };

  // CSV Import Handlers
  const handleImportCsv = (type: 'customers' | 'products' | 'orders', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingType(type);
    setImportMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('File is empty');

        const res = type === 'customers'
          ? await api.importCustomersCsv({ csv_data: text })
          : type === 'products'
            ? await api.importProductsCsv({ csv_data: text })
            : await api.importOrdersCsv({ csv_data: text });
        if (type === 'customers') fetchUnassignedCompanies();
        const errors = res.errors || [];
        const shownErrors = errors.slice(0, 5).join(' · ') + (errors.length > 5 ? ` · and ${errors.length - 5} more` : '');
        setImportMessage({
          type: res.imported + (res.updated || 0) === 0 && errors.length > 0 ? 'error' : 'success',
          text: `${type[0].toUpperCase() + type.slice(1)}: ${res.imported} added${res.updated !== undefined ? `, ${res.updated} updated` : ''}, ${res.skipped} skipped.${shownErrors ? ` ${shownErrors}` : ''}`
        });
      } catch (err: any) {
        setImportMessage({ type: 'error', text: err.message || 'CSV Import failed' });
      } finally {
        setImportingType(null);
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      setImportMessage({ type: 'error', text: 'Failed to read CSV file' });
      setImportingType(null);
    };
    reader.readAsText(file);
  };

  const handleCreateBackup = async () => {
    try {
      setBackupLoading(true);
      setBackupSuccess(null);
      const res = await api.createBackup();
      setBackupSuccess(res.message || 'Weekly backup snapshot created successfully');
      fetchBackups();
    } catch (err: any) {
      alert(err.message || 'Failed to create backup');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2F2923]">Settings</h1>
          <p className="text-xs text-[#766B60]">Security, personnel, audits & exports</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* User Card */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#766B60]">Logged In As</span>
            <h2 className="text-base font-bold text-[#2F2923]">{user?.full_name || user?.username}</h2>
            <p className="text-xs text-[#6B5744] font-semibold mt-0.5">
              Role: {isAdmin 
                ? 'System Administrator (Full Access)' 
                : isBusinessAdmin 
                  ? 'Business Administrator (Orders & Cloud Drive)' 
                  : `Sales Representative (${user?.assigned_region || 'Unassigned'})`}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#E8DCCB] text-[#6B5744] flex items-center justify-center font-bold">
            <Shield size={20} />
          </div>
        </div>

        {/* Change PIN / Password Card */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={16} className="text-[#6B5744]" />
            <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
              Change PIN / Password
            </h2>
          </div>

          {pinMessage && (
            <div
              className={`p-2.5 rounded-lg text-xs mb-3 flex items-center gap-2 ${
                pinMessage.type === 'success'
                  ? 'bg-[#E3EEE6] text-[#4F7D5B] border border-[#4F7D5B]/30'
                  : 'bg-[#FBE9E9] text-[#C94C4C] border border-[#C94C4C]/30'
              }`}
            >
              {pinMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{pinMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePin} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1">
                Current PIN / Password
              </label>
              <input
                type="password"
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Enter current password or PIN"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-1">
                New PIN / Password (min 4 characters)
              </label>
              <input
                type="password"
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Enter new password or PIN"
                className="w-full bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-3 py-2 text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
              />
            </div>

            <button
              type="submit"
              disabled={pinLoading || !currentPin || !newPin}
              className="w-full bg-[#6B5744] text-[#FFFCF7] py-2.5 rounded-lg font-bold text-xs shadow-xs hover:bg-[#584534] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {pinLoading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              <span>Update PIN / Password</span>
            </button>
          </form>
        </div>

        {/* Silver rate is shown here for reference; it is changed only on the Dashboard */}
        {(isAdmin || isBusinessAdmin) && (
          <>
            <SilverRateCard canManage={false} />
            <p className="text-[11px] text-[#766B60] -mt-2 px-1">To change the silver rate, use the Dashboard. Every price follows it automatically.</p>
            <CommerceSettingsCard />
          </>
        )}

        {/* State-wise Premium Pricing (System Administrator - Requirement 10) */}
        {isAdmin && <StatePremiumCard />}

        {/* Live Location Monitor: Admin & Business Admin */}
        {canMonitorLocations && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Navigation size={16} className="text-[#6B5744]" />
                <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                  Sales Representatives Live Location
                </h2>
              </div>
              <button
                type="button"
                onClick={fetchRepLocations}
                disabled={loadingLocations}
                className="text-xs font-bold text-[#6B5744] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} className={loadingLocations ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            <p className="text-[11px] text-[#766B60] mb-3 leading-relaxed">
              Real-time mandatory GPS coordinates and last recorded location of active sales representatives.
            </p>

            {loadingLocations ? (
              <div className="py-4 text-center">
                <Loader2 size={18} className="animate-spin mx-auto text-[#6B5744]" />
              </div>
            ) : repLocations.length === 0 ? (
              <p className="text-xs text-[#766B60] py-2">No sales representatives configured.</p>
            ) : (
              <div className="space-y-2">
                {repLocations.map((rep) => {
                  const hasLocation = rep.last_latitude !== null && rep.last_longitude !== null;
                  const isRecent = rep.last_location_updated_at && (Date.now() - new Date(rep.last_location_updated_at).getTime() < 25 * 60 * 1000);

                  return (
                    <div key={rep.id} className="bg-[#F5F0E8]/70 p-3 rounded-xl border border-[#E8DCCB] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isRecent ? 'bg-[#4F7D5B] animate-pulse' : hasLocation ? 'bg-[#D97732]' : 'bg-[#766B60]'}`}></span>
                          <p className="text-xs font-bold text-[#2F2923] truncate">{rep.full_name}</p>
                          <span className="text-[10px] text-[#766B60]">(@{rep.username})</span>
                        </div>

                        {hasLocation ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-[11px] text-[#2F2923] font-mono">
                              {Number(rep.last_latitude).toFixed(5)}, {Number(rep.last_longitude).toFixed(5)}
                            </p>
                            <p className="text-[10px] text-[#766B60]">
                              {rep.last_location_updated_at ? `Updated: ${new Date(rep.last_location_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${new Date(rep.last_location_updated_at).toLocaleDateString()}` : 'Location recorded'}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#766B60] italic mt-0.5">Awaiting first location ping</p>
                        )}
                      </div>

                      {hasLocation && (
                        <a
                          href={`https://www.google.com/maps?q=${rep.last_latitude},${rep.last_longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] hover:bg-[#E8DCCB] rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 shadow-xs"
                        >
                          <MapPin size={12} />
                          <span>Google Maps</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Admin Section: Business Administrators Management */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-[#6B5744]" />
                <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                  Business Administrators ({bizAdmins.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBizAdmin(!showAddBizAdmin)}
                className="text-xs font-bold text-[#6B5744] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} />
                <span>{showAddBizAdmin ? 'Cancel' : 'Add Biz Admin'}</span>
              </button>
            </div>

            <p className="text-[11px] text-[#766B60] mb-3 leading-relaxed">
              Business Administrators have access to manage and create orders, and store files in the Private Cloud.
            </p>

            {/* Add Business Admin Form */}
            {showAddBizAdmin && (
              <form onSubmit={handleCreateBizAdmin} className="bg-[#F5F0E8] p-3 rounded-lg mb-3 space-y-2.5 border border-[#D2BFA7]">
                <h3 className="text-xs font-bold text-[#2F2923]">New Business Administrator</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={bizFullName}
                    onChange={(e) => setBizFullName(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                  <input
                    type="text"
                    placeholder="Username (e.g. bizadmin2)"
                    value={bizUsername}
                    onChange={(e) => setBizUsername(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={bizPhone}
                    onChange={(e) => setBizPhone(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                  <input
                    type="password"
                    placeholder="Initial PIN/Password (default 123456)"
                    value={bizPin}
                    onChange={(e) => setBizPin(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingBizAdmin}
                  className="w-full bg-[#6B5744] text-[#FFFCF7] py-2 rounded text-xs font-bold hover:bg-[#584534] cursor-pointer"
                >
                  {creatingBizAdmin ? 'Saving...' : 'Register Business Administrator'}
                </button>
              </form>
            )}

            {/* Biz Admins List */}
            {loadingBizAdmins ? (
              <div className="py-4 text-center">
                <Loader2 size={18} className="animate-spin mx-auto text-[#6B5744]" />
              </div>
            ) : bizAdmins.length === 0 ? (
              <p className="text-xs text-[#766B60] py-2">No business administrators created yet.</p>
            ) : (
              <div className="space-y-2">
                {bizAdmins.map((ba) => (
                  <div key={ba.id} className="bg-[#F5F0E8]/70 p-3 rounded-lg border border-[#E8DCCB] flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#2F2923]">{ba.full_name}</p>
                      <p className="text-[11px] text-[#766B60]">
                        User: <span className="font-semibold text-[#6B5744]">@{ba.username}</span> {ba.phone && `· ${ba.phone}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleResetBizAdminPin(ba.id, ba.full_name)}
                        className="px-2 py-1 bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] rounded text-[10px] font-bold hover:bg-[#E8DCCB] cursor-pointer"
                      >
                        Reset PIN
                      </button>
                      <button
                        onClick={() => handleDeleteBizAdmin(ba.id, ba.full_name)}
                        className="p-1 text-[#C94C4C] hover:bg-[#FBE9E9] rounded transition-colors cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin Section: Sales Representative Management & Company Assignment */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[#6B5744]" />
                <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                  Sales Representatives & Assigned Companies ({reps.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRep(!showAddRep)}
                className="text-xs font-bold text-[#6B5744] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} />
                <span>{showAddRep ? 'Cancel' : 'Add Rep'}</span>
              </button>
            </div>

            <p className="text-[11px] text-[#766B60] mb-3 leading-relaxed">
              Sales representatives only see data and customers belonging to companies assigned to them below. Companies are exclusive to one representative.
            </p>

            {/* Add Rep Form */}
            {showAddRep && (
              <form onSubmit={handleCreateRep} className="bg-[#F5F0E8] p-3 rounded-lg mb-3 space-y-2 border border-[#D2BFA7]">
                <h3 className="text-xs font-bold text-[#2F2923]">New Sales Representative</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={repUsername}
                    onChange={(e) => setRepUsername(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Emp Code (e.g. REP-01)"
                    value={repCode}
                    onChange={(e) => setRepCode(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                  <select
                    value={repRegion}
                    onChange={(e) => setRepRegion(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  >
                    <option value="North">North Zone</option>
                    <option value="South">South Zone</option>
                    <option value="East">East Zone</option>
                    <option value="West">West Zone</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={repPhone}
                    onChange={(e) => setRepPhone(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                  <input
                    type="password"
                    placeholder="Initial PIN / Password"
                    value={repPin}
                    onChange={(e) => setRepPin(e.target.value)}
                    className="w-full bg-[#FFFCF7] border border-[#D2BFA7] rounded px-2.5 py-1.5 text-xs text-[#2F2923]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingRep}
                  className="w-full bg-[#6B5744] text-[#FFFCF7] py-2 rounded text-xs font-bold hover:bg-[#584534] cursor-pointer"
                >
                  {creatingRep ? 'Saving...' : 'Register Representative'}
                </button>
              </form>
            )}

            {/* Reps List with Company Assignment Accordion */}
            {loadingReps ? (
              <div className="py-4 text-center">
                <Loader2 size={18} className="animate-spin mx-auto text-[#6B5744]" />
              </div>
            ) : reps.length === 0 ? (
              <p className="text-xs text-[#766B60] py-2">No sales representatives configured.</p>
            ) : (
              <div className="space-y-2">
                {reps.map((r) => {
                  const isExpanded = expandedRepId === r.id;
                  const assigned = repCompanies[r.id] || [];
                  const selectedVal = selectedCompanyDropdown[r.id] || '';

                  return (
                    <div key={r.id} className="bg-[#F5F0E8]/70 rounded-lg border border-[#E8DCCB] overflow-hidden">
                      <div className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-[#2F2923]">{r.full_name}</p>
                          <p className="text-[11px] text-[#766B60]">
                            @{r.username} · Region: <span className="font-semibold text-[#6B5744]">{r.assigned_region || 'All'}</span> · {r.orders_count || 0} orders
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleRepCompanies(r.id)}
                            className="px-2 py-1 bg-[#FFFCF7] border border-[#D2BFA7] text-[#2F2923] rounded text-[10px] font-bold hover:bg-[#E8DCCB] flex items-center gap-1 cursor-pointer"
                          >
                            <Building2 size={11} className="text-[#6B5744]" />
                            <span>Companies</span>
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                          <button
                            onClick={() => handleResetRepPin(r.id, r.full_name)}
                            className="px-2 py-1 bg-[#FFFCF7] border border-[#D2BFA7] text-[#6B5744] rounded text-[10px] font-bold hover:bg-[#E8DCCB] cursor-pointer"
                          >
                            Reset PIN
                          </button>
                          <button
                            onClick={() => handleDeleteRep(r.id, r.full_name)}
                            className="p-1 text-[#C94C4C] hover:bg-[#FBE9E9] rounded transition-colors cursor-pointer"
                            title="Delete Rep"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Collapsible Assigned Companies Drawer with Dropdown */}
                      {isExpanded && (
                        <div className="p-3 bg-[#FFFCF7] border-t border-[#D2BFA7] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#6B5744] uppercase tracking-wider">
                              Assigned Companies ({assigned.length})
                            </span>
                            <span className="text-[10px] text-[#766B60]">Exclusive to this representative</span>
                          </div>

                          {loadingCompaniesForRep === r.id ? (
                            <div className="py-2 text-center">
                              <Loader2 size={14} className="animate-spin mx-auto text-[#6B5744]" />
                            </div>
                          ) : assigned.length === 0 ? (
                            <p className="text-[11px] text-[#766B60] italic">No companies assigned yet. This rep cannot view any external companies.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((comp) => (
                                <span
                                  key={comp}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F0E8] border border-[#D2BFA7] text-[#2F2923] text-xs font-medium rounded-lg"
                                >
                                  <span>{comp}</span>
                                  <button
                                    onClick={() => handleUnassignCompany(r.id, comp)}
                                    className="text-[#C94C4C] hover:text-[#A83838] font-bold text-xs cursor-pointer"
                                    title="Remove company assignment"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Company Dropdown Selection */}
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-[10px] font-bold text-[#766B60] uppercase">
                              Assign Unassigned Company:
                            </label>
                            <div className="flex gap-1.5">
                              <select
                                value={selectedVal}
                                onChange={(e) => setSelectedCompanyDropdown(prev => ({ ...prev, [r.id]: e.target.value }))}
                                className="flex-1 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-2.5 py-1.5 text-xs text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                              >
                                <option value="">-- Select from unassigned companies ({unassignedCompanies.length}) --</option>
                                {unassignedCompanies.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                <option value="__custom__">+ Enter other company name...</option>
                              </select>

                              {selectedVal !== '__custom__' && (
                                <button
                                  onClick={() => handleAssignCompany(r.id)}
                                  disabled={!selectedVal}
                                  className="px-3 py-1.5 bg-[#6B5744] text-white text-xs font-bold rounded-lg hover:bg-[#584534] disabled:opacity-50 cursor-pointer"
                                >
                                  Assign
                                </button>
                              )}
                            </div>

                            {selectedVal === '__custom__' && (
                              <div className="flex gap-1.5 pt-1">
                                <input
                                  type="text"
                                  placeholder="Type company name (e.g. Shree Jewels)"
                                  value={customCompanyInput[r.id] || ''}
                                  onChange={(e) => setCustomCompanyInput(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  className="flex-1 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-lg px-2.5 py-1.5 text-xs text-[#2F2923] focus:outline-none focus:ring-1 focus:ring-[#6B5744]"
                                />
                                <button
                                  onClick={() => handleAssignCompany(r.id)}
                                  className="px-3 py-1.5 bg-[#6B5744] text-white text-xs font-bold rounded-lg hover:bg-[#584534] cursor-pointer"
                                >
                                  Assign
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Admin Section: CSV Bulk Import (Customers, Products, Orders) */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <Upload size={16} className="text-[#6B5744]" />
              <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                Import Data (CSV Format)
              </h2>
            </div>
            <p className="text-xs text-[#766B60] mb-3 leading-relaxed">
              Upload Customer, Product, and Order data in the same format as the export below — download an export and use it as the template.
              Products have one row per standard weight (ready stock as "16=5; 18=3", making slabs as "0-100=12; 101+=10");
              orders have one row per item. Existing customers and products are updated; existing order numbers are skipped.
            </p>

            {importMessage && (
              <div
                className={`p-2.5 rounded-lg text-xs mb-3 flex items-center gap-2 ${
                  importMessage.type === 'success'
                    ? 'bg-[#E3EEE6] text-[#4F7D5B] border border-[#4F7D5B]/30'
                    : 'bg-[#FBE9E9] text-[#C94C4C] border border-[#C94C4C]/30'
                }`}
              >
                {importMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{importMessage.text}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col items-center justify-center p-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer text-center">
                {importingType === 'customers' ? <Loader2 size={14} className="animate-spin mb-1" /> : <Upload size={14} className="mb-1" />}
                <span>Customers CSV</span>
                <input
                  ref={customerCsvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleImportCsv('customers', e)}
                  disabled={importingType !== null}
                  className="hidden"
                />
              </label>

              <label className="flex flex-col items-center justify-center p-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer text-center">
                {importingType === 'products' ? <Loader2 size={14} className="animate-spin mb-1" /> : <Upload size={14} className="mb-1" />}
                <span>Products CSV</span>
                <input
                  ref={productCsvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleImportCsv('products', e)}
                  disabled={importingType !== null}
                  className="hidden"
                />
              </label>

              <label className="flex flex-col items-center justify-center p-2.5 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer text-center">
                {importingType === 'orders' ? <Loader2 size={14} className="animate-spin mb-1" /> : <Upload size={14} className="mb-1" />}
                <span>Orders CSV</span>
                <input
                  ref={orderCsvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleImportCsv('orders', e)}
                  disabled={importingType !== null}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* Admin Section: Salesperson Activity & Audit Trail (Diffs) */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <History size={16} className="text-[#6B5744]" />
                <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                  Salesperson Activity & Audit Trail
                </h2>
              </div>
              <button
                onClick={fetchAuditLogs}
                disabled={loadingAudit}
                className="text-xs font-bold text-[#6B5744] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} className={loadingAudit ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
            <p className="text-[11px] text-[#766B60] mb-3 leading-relaxed">
              Real-time audit log of all customer and order creations, modifications, and before/after change diffs.
            </p>

            {loadingAudit ? (
              <div className="py-4 text-center">
                <Loader2 size={18} className="animate-spin mx-auto text-[#6B5744]" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-xs text-[#766B60] py-2">No activity logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {auditLogs.map((log) => {
                  const isDiffExpanded = expandedLogId === log.id;
                  const prevData = log.previous_data ? (typeof log.previous_data === 'string' ? JSON.parse(log.previous_data) : log.previous_data) : null;
                  const newData = log.new_data ? (typeof log.new_data === 'string' ? JSON.parse(log.new_data) : log.new_data) : null;
                  const hasDiff = prevData || newData;

                  return (
                    <div key={log.id} className="bg-[#F5F0E8]/50 p-2.5 rounded-lg border border-[#E8DCCB] text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#2F2923]">{log.actor_name || log.actor_username || 'System'}</span>
                            <span className="px-1.5 py-0.2 bg-[#E8DCCB] text-[#6B5744] rounded text-[10px] font-mono font-bold">
                              {log.action}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#766B60] mt-0.5">
                            Entity: <span className="font-semibold text-[#2F2923]">{log.entity_type} #{log.entity_id}</span>
                          </p>
                        </div>
                        <span className="text-[10px] text-[#766B60] shrink-0">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      {hasDiff && (
                        <div className="mt-2 pt-2 border-t border-[#D2BFA7]/40">
                          <button
                            onClick={() => setExpandedLogId(isDiffExpanded ? null : log.id)}
                            className="text-[11px] font-bold text-[#6B5744] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isDiffExpanded ? 'Hide Before / After Diff' : 'View Changed Data Diff'}</span>
                            {isDiffExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>

                          {isDiffExpanded && (
                            <div className="grid grid-cols-2 gap-2 mt-2 bg-[#FFFCF7] p-2 rounded border border-[#D2BFA7]">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#C94C4C] block mb-1">Previous Data</span>
                                <pre className="text-[10px] text-[#766B60] font-mono whitespace-pre-wrap overflow-x-auto max-h-36 bg-[#FBE9E9]/40 p-1.5 rounded">
                                  {prevData ? JSON.stringify(prevData, null, 2) : 'None (Created)'}
                                </pre>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#4F7D5B] block mb-1">Changed / New Data</span>
                                <pre className="text-[10px] text-[#2F2923] font-mono whitespace-pre-wrap overflow-x-auto max-h-36 bg-[#E3EEE6]/40 p-1.5 rounded">
                                  {newData ? JSON.stringify(newData, null, 2) : 'None (Deleted)'}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Admin Section: CSV & Product Images Export (Proper CSV Format, Not JSON) */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet size={16} className="text-[#6B5744]" />
              <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                Export Data (Verified CSV & Images)
              </h2>
            </div>
            <p className="text-xs text-[#766B60] mb-3 leading-relaxed">
              Downloads clean UTF-8 CSV spreadsheets (Products, Customers, Orders) and ZIP files containing product shipment images named with order IDs.
            </p>

            {exportMessage && (
              <div
                className={`p-2.5 rounded-lg text-xs mb-3 flex items-center gap-2 ${
                  exportMessage.type === 'success'
                    ? 'bg-[#E3EEE6] text-[#4F7D5B] border border-[#4F7D5B]/30'
                    : 'bg-[#FBE9E9] text-[#C94C4C] border border-[#C94C4C]/30'
                }`}
              >
                {exportMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{exportMessage.text}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                onClick={() => handleDownload('orders')}
                disabled={exportingType !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer disabled:opacity-50"
              >
                {exportingType === 'orders' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>Orders (CSV)</span>
              </button>
              <button
                onClick={() => handleDownload('products')}
                disabled={exportingType !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer disabled:opacity-50"
              >
                {exportingType === 'products' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>Products (CSV)</span>
              </button>
              <button
                onClick={() => handleDownload('customers')}
                disabled={exportingType !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#F5F0E8] border border-[#D2BFA7] rounded-lg text-xs font-semibold text-[#6B5744] hover:bg-[#E8DCCB] transition-colors cursor-pointer disabled:opacity-50"
              >
                {exportingType === 'customers' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>Customers (CSV)</span>
              </button>
              <button
                onClick={() => handleDownload('images')}
                disabled={exportingType !== null}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#E8DCCB] border border-[#D2BFA7] rounded-lg text-xs font-bold text-[#2F2923] hover:bg-[#D9C8B2] transition-colors cursor-pointer disabled:opacity-50"
              >
                {exportingType === 'images' ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />}
                <span>Images (ZIP)</span>
              </button>
            </div>
            <p className="text-[10px] text-[#766B60] italic">
              * Product image files inside the ZIP are saved as [OrderID].[ext] (or [OrderID]_1, [OrderID]_2 for multiple photos).
            </p>
          </div>
        )}

        {/* Admin Section: Automated Weekly Backup & Database */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-[#6B5744]" />
                <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider">
                  Automated Weekly Backup & Database
                </h2>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={backupLoading}
                className="flex items-center gap-1 text-xs font-bold text-[#6B5744] bg-[#F5F0E8] px-2.5 py-1 rounded-md border border-[#D2BFA7] hover:bg-[#E8DCCB] cursor-pointer"
              >
                {backupLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                <span>Create Backup</span>
              </button>
            </div>

            <p className="text-[11px] text-[#766B60] mb-2 leading-relaxed">
              The system automatically checks and creates full encrypted zip backups of the SQLite database on a weekly schedule.
            </p>

            {backupSuccess && (
              <p className="text-xs text-[#4F7D5B] font-medium mb-2">{backupSuccess}</p>
            )}

            <div className="mt-2 text-xs text-[#766B60]">
              <p className="font-semibold text-[#2F2923]">Existing Snapshots ({backups.length}):</p>
              {backups.length === 0 ? (
                <p className="text-[11px] text-[#766B60]/70 mt-1">No backups recorded yet.</p>
              ) : (
                <div className="space-y-1.5 mt-2 max-h-36 overflow-y-auto">
                  {backups.slice(0, 8).map((b, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 bg-[#F5F0E8]/60 rounded border border-[#E8DCCB] text-[11px]">
                      <span className="font-mono text-[#2F2923] truncate max-w-[200px]">{b.filename}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#766B60]">{(b.size_bytes / 1024).toFixed(1)} KB</span>
                        <a
                          href={api.downloadBackupUrl(b.filename)}
                          className="text-[#6B5744] hover:underline font-bold"
                          download
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Master Backup Code Info (System Admin Security) */}
        {isAdmin && (
          <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
            <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Shield size={14} className="text-[#6B5744]" />
              <span>Master Backup Code (Fail-safe)</span>
            </h2>
            <p className="text-xs text-[#766B60] leading-relaxed">
              A master backup code is configured permanently in the server core. In any emergency lockout or PIN reset loss, entering the Master Code at the login screen immediately grants full System Administrator bypass authentication.
            </p>
          </div>
        )}

        {/* About & PWA Shortcut */}
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-4 shadow-xs">
          <h2 className="text-xs font-bold text-[#2F2923] uppercase tracking-wider mb-1.5">
            About & PWA Shortcut
          </h2>
          <p className="text-sm font-bold text-[#2F2923]">
            AI925 Order Management System v1.0
          </p>
          <p className="text-xs text-[#766B60] mt-1 leading-relaxed">
            Local-first jewelry workflow management. To install the app shortcut on your mobile home screen, use <strong>"Add to Home Screen"</strong> in Safari (iOS) or Chrome (Android).
          </p>
        </div>
      </div>
    </div>
  );
};
