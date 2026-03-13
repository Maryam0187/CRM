'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useCall } from '../../contexts/CallContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import apiClient from '../../lib/apiClient';
import { getCallStatusDisplayName, getCallStatusBadgeClasses } from '../../lib/salesStatuses';
import { formatLandline } from '../../lib/validation';
import { isAdmin, isSupervisor } from '../../lib/roleUtils';
import StateSelector from '../../components/StateSelector';
import DateFilter from '../../components/DateFilter';

export default function CallLogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { initiateCall, isCalling, currentCallSid, isWebCallConnected } = useCall();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [quickDialNumber, setQuickDialNumber] = useState('');
  const [quickDialName, setQuickDialName] = useState('');
  const [quickDialValidation, setQuickDialValidation] = useState({ isValid: true, message: '' });
  const [checkResult, setCheckResult] = useState(null);
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [activeTab, setActiveTab] = useState('fresh'); // 'fresh' | 'quick'
  const [freshState, setFreshState] = useState('');
  const [freshCity, setFreshCity] = useState('');
  const [freshZipcode, setFreshZipcode] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNotes, setFilterNotes] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [appliedFilterState, setAppliedFilterState] = useState('');
  const [appliedFilterCity, setAppliedFilterCity] = useState('');
  const [appliedFilterStatus, setAppliedFilterStatus] = useState('');
  const [appliedFilterNotes, setAppliedFilterNotes] = useState('');
  const [appliedFilterPhone, setAppliedFilterPhone] = useState('');
  const [appliedDateFilter, setAppliedDateFilter] = useState('today');
  const [lastSaleByNumber, setLastSaleByNumber] = useState({});
  const [checkingLastSaleFor, setCheckingLastSaleFor] = useState(null);
  const [quickDialNote, setQuickDialNote] = useState('');
  const [noteModalCallId, setNoteModalCallId] = useState(null);

  const lastActiveCallSidRef = useRef(null);
  const quickDialNoteRef = useRef(quickDialNote);
  quickDialNoteRef.current = quickDialNote;

  const hasActiveCall = currentCallSid || isCalling || isWebCallConnected;
  const isTwilioEnabled = user?.twilio_enabled !== undefined ? user.twilio_enabled : true;

  useEffect(() => {
    if (user?.id) fetchCalls();
  }, [user?.id, pagination.page, appliedFilterState, appliedFilterCity, appliedFilterStatus, appliedFilterNotes, appliedFilterPhone, appliedDateFilter]);

  // When we have an active call, remember its SID so we can save the note when it ends
  useEffect(() => {
    if (currentCallSid) lastActiveCallSidRef.current = currentCallSid;
  }, [currentCallSid]);

  // When call ends: save note to call log and clear the form
  useEffect(() => {
    if (currentCallSid || isCalling || isWebCallConnected) return;
    const sid = lastActiveCallSidRef.current;
    if (!sid) return;
    lastActiveCallSidRef.current = null;
    const noteToSave = (quickDialNoteRef.current || '').trim();
    if (noteToSave) {
      apiClient.post('/api/calls/notes', { callSid: sid, notes: noteToSave }).catch(() => {});
    }
    setQuickDialNumber('');
    setQuickDialName('');
    setQuickDialNote('');
    setQuickDialValidation({ isValid: true, message: '' });
    setCheckResult(null);
  }, [currentCallSid, isCalling, isWebCallConnected]);

  const handleApplyFilters = () => {
    setAppliedFilterState(filterState);
    setAppliedFilterCity(filterCity);
    setAppliedFilterStatus(filterStatus);
    setAppliedFilterNotes(filterNotes);
    setAppliedFilterPhone(filterPhone);
    setAppliedDateFilter(dateFilter);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilterState('');
    setFilterCity('');
    setFilterStatus('');
    setFilterNotes('');
    setFilterPhone('');
    setDateFilter('today');
    setAppliedFilterState('');
    setAppliedFilterCity('');
    setAppliedFilterStatus('');
    setAppliedFilterNotes('');
    setAppliedFilterPhone('');
    setAppliedDateFilter('today');
    setPagination((p) => ({ ...p, page: 1 }));
  };

  function parseDateFilterToParams(dateFilterValue) {
    if (!dateFilterValue) return { startDate: '', endDate: '' };
    if (dateFilterValue === 'today') {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return { startDate: `${yyyy}-${mm}-${dd}`, endDate: `${yyyy}-${mm}-${dd}` };
    }
    if (dateFilterValue === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return { startDate: `${yyyy}-${mm}-${dd}`, endDate: `${yyyy}-${mm}-${dd}` };
    }
    if (dateFilterValue.includes('|')) {
      const [start, end] = dateFilterValue.split('|');
      const startDate = new Date(start);
      const endDate = new Date(end);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    }
    if (dateFilterValue.includes(' ')) {
      const [month, year] = dateFilterValue.split(' ');
      const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
      const startDate = new Date(year, monthIndex, 1);
      const endDate = new Date(year, monthIndex + 1, 0);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    }
    return { startDate: '', endDate: '' };
  }

  const fetchCalls = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('agentId', user.id);
      params.append('limit', pagination.limit);
      params.append('offset', (pagination.page - 1) * pagination.limit);
      if (appliedFilterState.trim()) params.append('state', appliedFilterState.trim());
      if (appliedFilterCity.trim()) params.append('city', appliedFilterCity.trim());
      if (appliedFilterStatus.trim()) params.append('status', appliedFilterStatus.trim());
      if (appliedFilterNotes.trim()) params.append('notes', appliedFilterNotes.trim());
      if (appliedFilterPhone.trim()) params.append('phone', appliedFilterPhone.trim());
      const { startDate, endDate } = parseDateFilterToParams(appliedDateFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await apiClient.get(`/api/calls/initiate?${params}`);
      const data = await res.json();
      if (data.success) {
        setCalls(data.data.calls);
        setPagination(prev => ({
          ...prev,
          total: data.data.total,
          totalPages: Math.ceil(data.data.total / pagination.limit)
        }));
      } else {
        setError(data.message || 'Failed to fetch call logs');
      }
    } catch (err) {
      console.error('Error fetching call logs:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatDuration = (sec) => {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const NOTE_TRIM_LEN = 40;
  const trimNote = (text) => {
    if (!text || !String(text).trim()) return null;
    const s = String(text).trim();
    if (s.length <= NOTE_TRIM_LEN) return s;
    return s.slice(0, NOTE_TRIM_LEN) + '…';
  };

  const validatePhone = (v) => {
    if (!v?.trim()) return { isValid: false, message: 'Phone number is required' };
    const clean = v.replace(/\D/g, '');
    if (clean.length < 10) return { isValid: false, message: 'At least 10 digits required' };
    if (clean.length > 15) return { isValid: false, message: 'Max 15 digits' };
    return { isValid: true, message: '' };
  };

  const handleCheckNumber = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid) return;
    try {
      setIsCheckingNumber(true);
      setCheckResult(null);
      const res = await apiClient.post('/api/customers/check-by-number', {
        number: quickDialNumber.trim().replace(/\D/g, ''),
      });
      const data = await res.json();
      if (data.success) {
        setCheckResult(data);
      } else {
        setCheckResult({ success: true, exists: false, lastSale: null, message: data.message || 'Check failed' });
      }
    } catch (err) {
      console.error('Check number error:', err);
      setCheckResult({ success: false, exists: false, lastSale: null, message: 'Network error. Please try again.' });
    } finally {
      setIsCheckingNumber(false);
    }
  };

  const handleQuickDialCall = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: quickDialNumber.trim(),
      customerName: quickDialName.trim() || undefined,
      callNotes: quickDialNote.trim() || undefined,
      agentId: user.id,
      callPurpose: 'follow_up',
      state: freshState || undefined,
      city: freshCity || undefined,
      zipcode: freshZipcode || undefined,
    });
    setQuickDialValidation({ isValid: true, message: '' });
    setCheckResult(null);
  };

  const handleQuickDialCallNoCheck = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: quickDialNumber.trim(),
      customerName: quickDialName.trim() || undefined,
      callNotes: quickDialNote.trim() || undefined,
      agentId: user.id,
      callPurpose: 'follow_up',
    });
    setQuickDialValidation({ isValid: true, message: '' });
  };

  const handleCallFromRow = async (phoneNumber, customerName) => {
    if (!phoneNumber || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: (phoneNumber || '').trim(),
      customerName: (customerName && customerName !== 'Quick Dial' && customerName !== 'Call Log') ? customerName : undefined,
      agentId: user.id,
      callPurpose: 'follow_up',
    });
  };

  const getCallStatusDisplay = getCallStatusDisplayName;

  const getDisplayName = (call) => {
    if (call.customer) {
      const name = `${call.customer.firstName || ''} ${call.customer.lastName || ''}`.trim();
      if (name) return name;
    }
    const name = call.customerName;
    if (name && name !== 'Quick Dial' && name !== 'Call Log') return name;
    return '—';
  };

  const normalizeNumberForKey = (num) => (num || '').replace(/\D/g, '').slice(-10) || num;

  const handleCheckLastSale = async (toNumber) => {
    const key = normalizeNumberForKey(toNumber);
    if (!key) return;
    setCheckingLastSaleFor(key);
    try {
      const res = await apiClient.post('/api/customers/check-by-number', { number: (toNumber || key).trim() });
      const data = await res.json();
      const agentId = data?.lastSale?.agent?.id;
      const isOwn = agentId === user?.id;
      const isSupervised = isSupervisor(user) && user?.supervisedAgents?.some((a) => a.id === agentId);
      const canShow = isAdmin(user) || isOwn || isSupervised;
      setLastSaleByNumber((prev) => ({
        ...prev,
        [key]: {
          lastSale: data?.lastSale,
          canShow,
          customerName: data?.lastSale?.customer
            ? `${data.lastSale.customer.firstName || ''} ${data.lastSale.customer.lastName || ''}`.trim()
            : data?.customers?.[0]?.firstName || null,
        },
      }));
    } catch {
      setLastSaleByNumber((prev) => ({ ...prev, [key]: { error: true } }));
    } finally {
      setCheckingLastSaleFor(null);
    }
  };

  const openCreateSale = (phoneNumber, customerName) => {
    const params = new URLSearchParams();
    params.set('fromCall', '1');
    params.set('landline', (phoneNumber || '').trim());
    if (customerName && customerName !== '—') params.set('firstName', customerName);
    router.push(`/add-sale?${params.toString()}`);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Call Logs</h1>
            <p className="mt-1 text-sm text-gray-600">
              Fresh Dialing: check number and last sale first. Quick Dial: dial directly. Call history below.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Tabs: Fresh Dialing | Quick Dial */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('fresh')}
              className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
                activeTab === 'fresh'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Fresh Dialing
            </button>
            <button
              onClick={() => setActiveTab('quick')}
              className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
                activeTab === 'quick'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Quick Dial
            </button>
          </div>

          {/* Fresh Dialing - State first, then City & Zipcode, then Number & Name, Check/Call */}
          {activeTab === 'fresh' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Fresh Dialing</h3>
            <p className="text-sm text-gray-500 mb-3">Select state, then city and zipcode (optional), then number and customer name (optional). Call to dial.</p>
            <div className="space-y-4">
              {/* 1. State */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <StateSelector
                  value={freshState}
                  onChange={(e) => setFreshState(e.target.value)}
                  label=""
                  showTimezone={false}
                  className="w-full max-w-xs"
                />
              </div>

              {/* 2. City & Zipcode - only when state is selected */}
              {freshState && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                    <input
                      type="text"
                      value={freshCity}
                      onChange={(e) => setFreshCity(e.target.value)}
                      placeholder="City"
                      className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Zipcode (optional)</label>
                    <input
                      type="text"
                      value={freshZipcode}
                      onChange={(e) => setFreshZipcode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Zipcode"
                      className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* 3. Number & Customer name & Note, then Call - only when state is selected */}
              {freshState && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Number *</label>
                  <input
                    type="tel"
                    value={quickDialNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d*#+\-() ]/g, '');
                      setQuickDialNumber(formatLandline(v));
                      setQuickDialValidation(validatePhone(formatLandline(v)));
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                      const cleaned = pasted.replace(/[^\d*#+\-() ]/g, '');
                      const formatted = formatLandline(cleaned);
                      setQuickDialNumber(formatted);
                      setQuickDialValidation(validatePhone(formatted));
                    }}
                    placeholder="Paste or enter phone number"
                    className={`w-full px-4 py-2.5 text-base font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${quickDialValidation.isValid ? 'border-gray-300' : 'border-red-500'}`}
                  />
                  {quickDialValidation.message && (
                    <p className={`mt-1 text-xs ${quickDialValidation.isValid ? 'text-gray-500' : 'text-red-600'}`}>{quickDialValidation.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer name (optional)</label>
                  <input
                    type="text"
                    value={quickDialName}
                    onChange={(e) => setQuickDialName(e.target.value)}
                    placeholder="Customer name"
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                  <textarea
                    value={quickDialNote}
                    onChange={(e) => setQuickDialNote(e.target.value)}
                    placeholder="Call note"
                    rows={2}
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[2.5rem]"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleQuickDialCall}
                    disabled={!quickDialNumber.trim() || !quickDialValidation.isValid || hasActiveCall || !isTwilioEnabled}
                    className="w-full sm:w-auto px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {hasActiveCall ? 'Call in progress' : isCalling ? 'Connecting...' : 'Call'}
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
          )}

          {/* Quick Dial - direct dial, no Check Number */}
          {activeTab === 'quick' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Dial</h3>
            <p className="text-sm text-gray-500 mb-3">Enter number and optional name and note, then Call. No check step.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Number *</label>
                <input
                  type="tel"
                  value={quickDialNumber}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d*#+\-() ]/g, '');
                    setQuickDialNumber(formatLandline(v));
                    setQuickDialValidation(validatePhone(formatLandline(v)));
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                    const cleaned = pasted.replace(/[^\d*#+\-() ]/g, '');
                    const formatted = formatLandline(cleaned);
                    setQuickDialNumber(formatted);
                    setQuickDialValidation(validatePhone(formatted));
                  }}
                  placeholder="Paste or enter phone number"
                  className={`w-full px-4 py-2.5 text-base font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${quickDialValidation.isValid ? 'border-gray-300' : 'border-red-500'}`}
                />
                {quickDialValidation.message && (
                  <p className={`mt-1 text-xs ${quickDialValidation.isValid ? 'text-gray-500' : 'text-red-600'}`}>{quickDialValidation.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={quickDialName}
                  onChange={(e) => setQuickDialName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <textarea
                  value={quickDialNote}
                  onChange={(e) => setQuickDialNote(e.target.value)}
                  placeholder="Call note"
                  rows={2}
                  className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[2.5rem]"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleQuickDialCallNoCheck}
                  disabled={!quickDialNumber.trim() || !quickDialValidation.isValid || hasActiveCall || !isTwilioEnabled}
                  className="w-full sm:w-auto px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {hasActiveCall ? 'Call in progress' : isCalling ? 'Connecting...' : 'Call'}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Call history - same for both tabs */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Call history</h3>
              <button
                type="button"
                onClick={() => fetchCalls()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors"
                title="Refresh call logs"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">State</label>
                  <div className="[&_select]:h-10 [&_select]:py-2">
                    <StateSelector
                      value={filterState}
                      onChange={(e) => setFilterState(e.target.value)}
                      label=""
                      showTimezone={false}
                      className="w-full [&_select]:text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">City</label>
                  <input
                    type="text"
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="Filter by city"
                    className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Phone</label>
                  <input
                    type="text"
                    value={filterPhone}
                    onChange={(e) => setFilterPhone(e.target.value)}
                    placeholder="Filter by phone"
                    className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All</option>
                    <option value="completed">Completed</option>
                    <option value="ringing">Ringing</option>
                    <option value="in-progress">In progress</option>
                    <option value="no-answer">No answer</option>
                    <option value="busy">Busy</option>
                    <option value="failed">Failed</option>
                    <option value="canceled">Canceled</option>
                    <option value="queued">Queued</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Notes</label>
                  <input
                    type="text"
                    value={filterNotes}
                    onChange={(e) => setFilterNotes(e.target.value)}
                    placeholder="Filter by notes"
                    className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600 invisible">Apply</label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleApplyFilters}
                      className="h-10 flex-1 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="h-10 px-4 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4 mt-4 flex flex-wrap items-center gap-4">
                <DateFilter
                  value={dateFilter}
                  onFilterChange={(v) => {
                    setDateFilter(v);
                    setAppliedDateFilter(v);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  hideDateFieldToggle
                  className="!p-3 !px-4"
                />
              </div>
            </div>

          {loading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && calls.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <p className="text-gray-600 font-medium">No call logs yet</p>
              <p className="text-gray-500 text-sm mt-1">Use Quick Dial above to make calls.</p>
            </div>
          )}

          {!loading && !error && calls.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last sale</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {calls.map((call) => {
                      const numKey = normalizeNumberForKey(call.toNumber);
                      const lastSaleInfo = lastSaleByNumber[numKey];
                      return (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={getCallStatusBadgeClasses(call.status)}>
                            {getCallStatusDisplay(call.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{call.state || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{call.city || '—'}</td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">{call.toNumber || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{getDisplayName(call)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(call.created_at || call.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDuration(call.duration)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px]">
                          {call.callNotes ? (
                            <button
                              type="button"
                              onClick={() => setNoteModalCallId(call.id)}
                              className="text-left w-full block truncate text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              title="Click to see full note"
                            >
                              {trimNote(call.callNotes)}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {!lastSaleInfo ? (
                            <button
                              type="button"
                              onClick={() => handleCheckLastSale(call.toNumber)}
                              disabled={!call.toNumber || checkingLastSaleFor === numKey}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
                            >
                              {checkingLastSaleFor === numKey ? '...' : 'Check'}
                            </button>
                          ) : lastSaleInfo.error ? (
                            <span className="text-gray-400">—</span>
                          ) : lastSaleInfo.canShow && lastSaleInfo.lastSale ? (
                            <span className="text-gray-700">
                              {lastSaleInfo.customerName || 'Customer'} · {lastSaleInfo.lastSale.statusDisplay || lastSaleInfo.lastSale.status}
                            </span>
                          ) : (
                            <span className="text-gray-400">Other agent</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <button
                              onClick={() => handleCallFromRow(call.toNumber, getDisplayName(call))}
                              disabled={hasActiveCall || !isTwilioEnabled || !call.toNumber}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              Call
                            </button>
                            <button
                              onClick={() => openCreateSale(call.toNumber, getDisplayName(call))}
                              disabled={!call.toNumber}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                            >
                              Create sale
                            </button>
                          </div>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              {pagination.totalPages > 1 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                      disabled={pagination.page <= 1}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Note full-text modal */}
      {noteModalCallId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setNoteModalCallId(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Call note</h3>
              <button
                type="button"
                onClick={() => setNoteModalCallId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words">
              {calls.find((c) => c.id === noteModalCallId)?.callNotes || '—'}
            </p>
          </div>
        </div>
      )}

    </ProtectedRoute>
  );
}
