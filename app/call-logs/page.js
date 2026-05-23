'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useCall } from '../../contexts/CallContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import apiClient from '../../lib/apiClient';
import { getCallStatusDisplayName, getCallStatusBadgeClasses, getStatusBadgeClasses } from '../../lib/salesStatuses';
import { formatLandline } from '../../lib/validation';
import { isAdmin, isSupervisor } from '../../lib/roleUtils';
import { getCallPurposeDisplay } from '../../lib/twilio';
import StateSelector from '../../components/StateSelector';
import DateFilter from '../../components/DateFilter';

export default function CallLogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { initiateCall, startCall, isCalling, currentCallSid, isWebCallConnected } = useCall();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [quickDialNumber, setQuickDialNumber] = useState('');
  const [quickDialName, setQuickDialName] = useState('');
  const [quickDialValidation, setQuickDialValidation] = useState({ isValid: true, message: '' });
  const [checkResult, setCheckResult] = useState(null);
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [activeTab, setActiveTab] = useState('fresh'); // 'fresh' | 'quick' | 'check'
  const [checkNumberInput, setCheckNumberInput] = useState('');
  const [checkNumberValidation, setCheckNumberValidation] = useState({ isValid: true, message: '' });
  const [checkNumberResult, setCheckNumberResult] = useState(null);
  const [isCheckingNumberTab, setIsCheckingNumberTab] = useState(false);
  const [freshState, setFreshState] = useState('');
  const [freshCity, setFreshCity] = useState('');
  const [freshZipcode, setFreshZipcode] = useState('');
  const [freshCallPurpose, setFreshCallPurpose] = useState('cold_call');
  const [quickCallPurpose, setQuickCallPurpose] = useState('follow_up');
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
  const [editingNote, setEditingNote] = useState(false);
  const [editNoteValue, setEditNoteValue] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showPostCallDialog, setShowPostCallDialog] = useState(false);
  const [postCallSid, setPostCallSid] = useState('');
  const [postCallNote, setPostCallNote] = useState('');
  const [postCallOutcome, setPostCallOutcome] = useState('');
  const [savingPostCall, setSavingPostCall] = useState(false);
  const [savingOutcomeCallId, setSavingOutcomeCallId] = useState(null);
  const [isAiDialing, setIsAiDialing] = useState(false);
  const [aiDialMessage, setAiDialMessage] = useState('');
  const [aiActiveCallSid, setAiActiveCallSid] = useState('');
  const [aiCanControl, setAiCanControl] = useState(true);
  const [aiControlMessage, setAiControlMessage] = useState('');
  const [aiControlLoadingAction, setAiControlLoadingAction] = useState('');

  const lastActiveCallSidRef = useRef(null);
  const pendingPostCallMetaRef = useRef(null);
  const quickDialNoteRef = useRef(quickDialNote);
  quickDialNoteRef.current = quickDialNote;
  const quickDialNameRef = useRef(quickDialName);
  quickDialNameRef.current = quickDialName;
  const freshCityRef = useRef(freshCity);
  freshCityRef.current = freshCity;
  const freshZipcodeRef = useRef(freshZipcode);
  freshZipcodeRef.current = freshZipcode;

  const hasActiveCall = currentCallSid || isCalling || isWebCallConnected;
  const isTwilioEnabled = user?.twilio_enabled !== undefined ? user.twilio_enabled : true;
  const postCallOutcomeOptions = [
    { value: 'voicemail', label: 'Voicemail' },
    { value: 'lead_call', label: 'Lead Call' },
    { value: 'hangup', label: 'Hangup' },
    { value: 'no_response', label: 'No Response' },
  ];
  const outcomeToSalesStatus = {
    voicemail: 'voicemail',
    lead_call: 'lead-call',
    hangup: 'hang-up',
    no_response: 'no_response',
  };
  const getOutcomeBadgeClasses = (outcome) => {
    const mappedStatus = outcomeToSalesStatus[outcome];
    if (!mappedStatus) return 'bg-gray-100 text-gray-800';
    return getStatusBadgeClasses(mappedStatus);
  };

  useEffect(() => {
    if (user?.id) fetchCalls();
  }, [user?.id, pagination.page, appliedFilterState, appliedFilterCity, appliedFilterStatus, appliedFilterNotes, appliedFilterPhone, appliedDateFilter]);

  // When we have an active call, remember its SID so we can save the note when it ends
  useEffect(() => {
    if (currentCallSid) lastActiveCallSidRef.current = currentCallSid;
  }, [currentCallSid]);

  const resetDialFields = () => {
    setQuickDialNumber('');
    setQuickDialName('');
    setQuickDialNote('');
    setQuickDialValidation({ isValid: true, message: '' });
    setCheckResult(null);
  };

  // When call ends: for lead/quick dial open post-call outcome dialog
  useEffect(() => {
    if (currentCallSid || isCalling || isWebCallConnected) return;
    const sid = lastActiveCallSidRef.current;
    if (!sid) return;
    lastActiveCallSidRef.current = null;
    const meta = pendingPostCallMetaRef.current;
    if (meta && (meta.callSource === 'lead_dialing' || meta.callSource === 'quick_dialing')) {
      setPostCallSid(sid);
      setPostCallNote(meta.note || '');
      setPostCallOutcome('');
      setShowPostCallDialog(true);
      return;
    }
    resetDialFields();
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
      params.append('tzOffset', String(new Date().getTimezoneOffset()));
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

  const NOTE_CHAR_LIMIT = 5;
  const trimNote = (text) => {
    if (!text || !String(text).trim()) return null;
    const s = String(text).trim();
    // Count only alphabetic characters
    let alphaCount = 0;
    let cutIndex = s.length;
    for (let i = 0; i < s.length; i++) {
      if (/[a-zA-Z]/.test(s[i])) {
        alphaCount++;
        if (alphaCount === NOTE_CHAR_LIMIT) {
          cutIndex = i + 1;
          break;
        }
      }
    }
    if (alphaCount < NOTE_CHAR_LIMIT || cutIndex >= s.length) return s;
    return s.slice(0, cutIndex) + '...';
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

  const handleCheckNumberTab = async () => {
    const v = validatePhone(checkNumberInput);
    setCheckNumberValidation(v);
    if (!v.isValid) return;
    try {
      setIsCheckingNumberTab(true);
      setCheckNumberResult(null);
      const res = await apiClient.post('/api/customers/check-by-number', {
        number: checkNumberInput.trim().replace(/\D/g, ''),
      });
      const data = await res.json();
      if (data.success) {
        setCheckNumberResult(data);
      } else {
        setCheckNumberResult({ success: true, exists: false, lastSale: null, message: data.message || 'Check failed' });
      }
    } catch (err) {
      console.error('Check number error:', err);
      setCheckNumberResult({ success: false, exists: false, lastSale: null, message: 'Network error. Please try again.' });
    } finally {
      setIsCheckingNumberTab(false);
    }
  };

  const handleQuickDialCall = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    pendingPostCallMetaRef.current = {
      callSource: 'lead_dialing',
      note: quickDialNote.trim(),
      customerName: quickDialName.trim(),
      city: freshCity.trim(),
      zipcode: freshZipcode.trim(),
    };
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: quickDialNumber.trim(),
      customerName: quickDialName.trim() || undefined,
      callNotes: quickDialNote.trim() || undefined,
      agentId: user.id,
      callPurpose: freshCallPurpose,
      callSource: 'lead_dialing',
      state: freshState || undefined,
      city: freshCity || undefined,
      zipcode: freshZipcode || undefined,
    });
    setQuickDialValidation({ isValid: true, message: '' });
    setCheckResult(null);
  };

  const handleLeadAiCall = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid || !user?.id || !isTwilioEnabled || hasActiveCall || isAiDialing) return;

    try {
      setIsAiDialing(true);
      setAiDialMessage('');
      setError(null);

      const res = await apiClient.post('/api/calls/ai/initiate', {
        customerId: null,
        saleId: null,
        phoneNumber: quickDialNumber.trim(),
        callPurpose: freshCallPurpose,
        campaignLabel: 'ai_supervised_tab',
        supervisedAi: true
      });
      const data = await res.json();

      if (data?.success) {
        const sid = data?.data?.callSid || '';
        const aiConference = data?.data?.conferenceName || null;
        setAiActiveCallSid(sid);
        setAiDialMessage(
          `Outbound AI call dialing customer${sid ? ` (SID: ${sid})` : ''}. Rebecca will speak when they answer.`
        );
        setCheckResult(null);
        if (data?.data?.supervisedConferenceMode && aiConference && sid) {
          startCall({
            callSid: sid,
            conferenceName: aiConference,
            phoneNumber: quickDialNumber.trim(),
            customerId: null,
            saleId: null
          });
        }
      } else {
        setError(data?.message || 'Failed to start AI call.');
      }
    } catch (err) {
      console.error('AI lead dial error:', err);
      setError('Network error while starting AI call.');
    } finally {
      setIsAiDialing(false);
    }
  };

  const handleAiControl = async (action) => {
    if (!aiActiveCallSid || !action || aiControlLoadingAction || !aiCanControl) return;
    try {
      setAiControlLoadingAction(action);
      setAiControlMessage('');
      const res = await apiClient.post('/api/calls/ai/control', {
        callSid: aiActiveCallSid,
        action
      });
      const data = await res.json();
      if (data?.success) {
        if (action === 'takeover' && data?.data?.conferenceName) {
          startCall({
            callSid: aiActiveCallSid,
            conferenceName: data.data.conferenceName,
            customerId: null,
            saleId: null,
            phoneNumber: quickDialNumber?.trim() || undefined
          });
          setAiControlMessage('Takeover started. Joining voice bridge so you can speak to the customer.');
        } else if (action === 'end_ai') {
          setAiControlMessage('AI agent ended. Human agent can continue conversation.');
        } else {
          setAiControlMessage(`AI control applied: ${action}`);
        }
      } else {
        setAiControlMessage(data?.message || `Failed to apply action: ${action}`);
      }
    } catch (err) {
      console.error('AI control error:', err);
      setAiControlMessage('Network error while applying AI control.');
    } finally {
      setAiControlLoadingAction('');
    }
  };

  useEffect(() => {
    if (!aiActiveCallSid) {
      setAiCanControl(true);
      return;
    }

    let isCancelled = false;
    const fetchAiControlState = async () => {
      try {
        const res = await apiClient.get(`/api/calls/ai/control?callSid=${encodeURIComponent(aiActiveCallSid)}`);
        const data = await res.json();
        if (isCancelled) return;
        if (data?.success) {
          setAiCanControl(Boolean(data?.data?.canControl));
        } else {
          setAiCanControl(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setAiCanControl(false);
        }
      }
    };

    fetchAiControlState();
    return () => {
      isCancelled = true;
    };
  }, [aiActiveCallSid]);

  const handleQuickDialCallNoCheck = async () => {
    const v = validatePhone(quickDialNumber);
    setQuickDialValidation(v);
    if (!v.isValid || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    pendingPostCallMetaRef.current = {
      callSource: 'quick_dialing',
      note: quickDialNote.trim(),
      customerName: quickDialName.trim(),
      city: freshCity.trim(),
      zipcode: freshZipcode.trim(),
    };
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: quickDialNumber.trim(),
      customerName: quickDialName.trim() || undefined,
      callNotes: quickDialNote.trim() || undefined,
      agentId: user.id,
      callPurpose: quickCallPurpose,
      callSource: 'quick_dialing',
    });
    setQuickDialValidation({ isValid: true, message: '' });
  };

  const handleCallFromRow = async (phoneNumber, customerName) => {
    if (!phoneNumber || !user?.id || !isTwilioEnabled || hasActiveCall) return;
    pendingPostCallMetaRef.current = null;
    await initiateCall({
      customerId: null,
      saleId: null,
      phoneNumber: (phoneNumber || '').trim(),
      customerName: (customerName && customerName !== 'Quick Dial' && customerName !== 'Call Log') ? customerName : undefined,
      agentId: user.id,
      callPurpose: 'follow_up',
      callSource: 'call_history',
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

  const handleOpenNoteModal = (callId) => {
    const call = calls.find((c) => c.id === callId);
    setNoteModalCallId(callId);
    setEditNoteValue(call?.callNotes || '');
    setEditingNote(false);
  };

  const handleSaveNote = async () => {
    const call = calls.find((c) => c.id === noteModalCallId);
    if (!call?.callSid) return;
    
    setSavingNote(true);
    try {
      const res = await apiClient.post('/api/calls/notes', {
        callSid: call.callSid,
        notes: editNoteValue.trim(),
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) =>
          prev.map((c) =>
            c.id === noteModalCallId ? { ...c, callNotes: editNoteValue.trim() } : c
          )
        );
        setEditingNote(false);
      }
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleCloseNoteModal = () => {
    setNoteModalCallId(null);
    setEditingNote(false);
    setEditNoteValue('');
  };

  const handleSavePostCallDialog = async () => {
    if (!postCallSid || !postCallOutcome) return;
    setSavingPostCall(true);
    try {
      const meta = pendingPostCallMetaRef.current || {};
      const payload = {
        callSid: postCallSid,
        callOutcome: postCallOutcome,
        notes: postCallNote.trim(),
      };
      if (meta.customerName) payload.customerName = meta.customerName;
      if (meta.city) payload.city = meta.city;
      if (meta.zipcode) payload.zipcode = meta.zipcode;
      const res = await apiClient.post('/api/calls/notes', payload);
      const data = await res.json();
      if (data.success) {
        setCalls((prev) =>
          prev.map((c) =>
            c.callSid === postCallSid
              ? { ...c, callNotes: postCallNote.trim(), callOutcome: postCallOutcome }
              : c
          )
        );
        setShowPostCallDialog(false);
        setPostCallSid('');
        setPostCallOutcome('');
        setPostCallNote('');
        pendingPostCallMetaRef.current = null;
        resetDialFields();
        fetchCalls();
      }
    } catch (err) {
      console.error('Error saving post-call outcome:', err);
    } finally {
      setSavingPostCall(false);
    }
  };

  const handleClosePostCallDialog = () => {
    setShowPostCallDialog(false);
    setPostCallSid('');
    setPostCallOutcome('');
    setPostCallNote('');
    pendingPostCallMetaRef.current = null;
    resetDialFields();
  };

  const handleOutcomeChange = async (call, selectedOutcome) => {
    if (!call?.callSid) return;
    setSavingOutcomeCallId(call.id);
    try {
      const outcomeValue = selectedOutcome || null;
      const res = await apiClient.post('/api/calls/notes', {
        callSid: call.callSid,
        callOutcome: outcomeValue,
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) =>
          prev.map((c) =>
            c.id === call.id ? { ...c, callOutcome: selectedOutcome || null } : c
          )
        );
      }
    } catch (err) {
      console.error('Error updating call outcome:', err);
    } finally {
      setSavingOutcomeCallId(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Call Logs</h1>
            <p className="mt-1 text-sm text-gray-600">
              Lead Dialing: check number and last sale first. Quick Dial: dial directly. Call history below.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Tabs: Lead Dialing | Quick Dial | Check Number | AI Supervised */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('fresh')}
              className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
                activeTab === 'fresh'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Lead Dialing
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
            <button
              onClick={() => setActiveTab('check')}
              className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
                activeTab === 'check'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Check Number
            </button>
            <button
              onClick={() => setActiveTab('ai_supervised')}
              className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
                activeTab === 'ai_supervised'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              AI Supervised
            </button>
          </div>

          {/* Lead Dialing - State first, then City & Zipcode, then Number & Name, Check/Call */}
          {activeTab === 'fresh' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Lead Dialing</h3>
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

              {/* 2. City & Zipcode & Purpose - only when state is selected */}
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
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                    <select
                      value={freshCallPurpose}
                      onChange={(e) => setFreshCallPurpose(e.target.value)}
                      className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="cold_call">Cold Call</option>
                      <option value="follow_up">Follow Up</option>
                      <option value="sales">Sales</option>
                      <option value="support">Support</option>
                      <option value="appointment">Appointment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 3. Number & Call button - only when state is selected */}
              {freshState && (
              <>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="flex-1 max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number *</label>
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
                    className={`w-full px-5 py-3.5 text-xl font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm ${quickDialValidation.isValid ? 'border-blue-400 bg-blue-50/30' : 'border-red-500 bg-red-50/30'}`}
                  />
                  <p className={`mt-1 text-xs min-h-[1rem] ${quickDialValidation.message ? (quickDialValidation.isValid ? 'text-gray-500' : 'text-red-600') : 'invisible'}`}>
                    {quickDialValidation.message || 'placeholder'}
                  </p>
                </div>
                <button
                  onClick={handleQuickDialCall}
                  disabled={!quickDialNumber.trim() || !quickDialValidation.isValid || hasActiveCall || !isTwilioEnabled}
                  className="w-full sm:w-auto sm:mt-6 px-8 py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-lg rounded-lg flex items-center justify-center gap-2 shadow-sm"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {hasActiveCall ? 'Call in progress' : isCalling ? 'Connecting...' : 'Call'}
                </button>
              </div>
              </>
              )}

              {/* 4. Customer name & Note - only when state is selected */}
              {freshState && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    rows={1}
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[2.5rem]"
                  />
                </div>
              </div>
              )}
            </div>
          </div>
          )}

          {/* AI Supervised tab */}
          {activeTab === 'ai_supervised' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">AI Supervised Dialing</h3>
            <p className="text-sm text-gray-500 mb-3">
              Start a supervised AI call. Pause/resume/end AI from here. Take Over only stops the AI on the line—it does not route audio from this browser to the customer (that needs a separate Twilio voice bridge).
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <StateSelector
                    value={freshState}
                    onChange={(e) => setFreshState(e.target.value)}
                    label=""
                    showTimezone={false}
                    className="w-full"
                  />
                </div>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                  <select
                    value={freshCallPurpose}
                    onChange={(e) => setFreshCallPurpose(e.target.value)}
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="cold_call">Cold Call</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="sales">Sales</option>
                    <option value="support">Support</option>
                    <option value="appointment">Appointment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="flex-1 max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={quickDialNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d*#+\-() ]/g, '');
                      setQuickDialNumber(formatLandline(v));
                      setQuickDialValidation(validatePhone(formatLandline(v)));
                    }}
                    placeholder="Paste or enter phone number"
                    className={`w-full px-5 py-3.5 text-xl font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm ${quickDialValidation.isValid ? 'border-blue-400 bg-blue-50/30' : 'border-red-500 bg-red-50/30'}`}
                  />
                </div>
                <button
                  onClick={handleLeadAiCall}
                  disabled={!quickDialNumber.trim() || !quickDialValidation.isValid || !isTwilioEnabled || isAiDialing}
                  className="w-full sm:w-auto sm:mt-6 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-lg rounded-lg flex items-center justify-center gap-2 shadow-sm"
                >
                  {isAiDialing ? 'Dialing...' : 'Start Outbound AI Call'}
                </button>
              </div>

              {aiDialMessage && <p className="text-sm text-indigo-700">{aiDialMessage}</p>}

              {aiActiveCallSid && (
                <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                  <p className="text-xs text-indigo-700 mb-2">Active AI Call SID: {aiActiveCallSid}</p>
                  {aiCanControl ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAiControl('pause')}
                        disabled={!!aiControlLoadingAction}
                        className="px-3 py-2 text-sm rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-60"
                      >
                        {aiControlLoadingAction === 'pause' ? 'Pausing...' : 'Pause AI'}
                      </button>
                      <button
                        onClick={() => handleAiControl('resume')}
                        disabled={!!aiControlLoadingAction}
                        className="px-3 py-2 text-sm rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                      >
                        {aiControlLoadingAction === 'resume' ? 'Resuming...' : 'Resume AI'}
                      </button>
                      <button
                        onClick={() => handleAiControl('takeover')}
                        disabled={!!aiControlLoadingAction}
                        className="px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                      >
                        {aiControlLoadingAction === 'takeover' ? 'Taking Over...' : 'Take Over'}
                      </button>
                      <button
                        onClick={() => handleAiControl('end_ai')}
                        disabled={!!aiControlLoadingAction}
                        className="px-3 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                      >
                        {aiControlLoadingAction === 'end_ai' ? 'Ending...' : 'End AI'}
                      </button>
                      <p className="w-full text-xs text-slate-600 mt-1">
                        Outbound: we dial the customer and the AI (Rebecca) talks on that call. Use Take Over when you want to join and speak live (opens your web phone).
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700">
                      Control actions are available only to the user who started this AI call.
                    </p>
                  )}
                  {aiControlMessage && <p className="mt-2 text-sm text-slate-700">{aiControlMessage}</p>}
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
            <div className="space-y-4">
              {/* Number & Call button */}
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="flex-1 max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number *</label>
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
                    className={`w-full px-5 py-3.5 text-xl font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm ${quickDialValidation.isValid ? 'border-blue-400 bg-blue-50/30' : 'border-red-500 bg-red-50/30'}`}
                  />
                  <p className={`mt-1 text-xs min-h-[1rem] ${quickDialValidation.message ? (quickDialValidation.isValid ? 'text-gray-500' : 'text-red-600') : 'invisible'}`}>
                    {quickDialValidation.message || 'placeholder'}
                  </p>
                </div>
                <button
                  onClick={handleQuickDialCallNoCheck}
                  disabled={!quickDialNumber.trim() || !quickDialValidation.isValid || hasActiveCall || !isTwilioEnabled}
                  className="w-full sm:w-auto sm:mt-6 px-8 py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-lg rounded-lg flex items-center justify-center gap-2 shadow-sm"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {hasActiveCall ? 'Call in progress' : isCalling ? 'Connecting...' : 'Call'}
                </button>
              </div>

              {/* Name, Purpose & Note */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                  <select
                    value={quickCallPurpose}
                    onChange={(e) => setQuickCallPurpose(e.target.value)}
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="follow_up">Follow Up</option>
                    <option value="cold_call">Cold Call</option>
                    <option value="sales">Sales</option>
                    <option value="support">Support</option>
                    <option value="appointment">Appointment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                  <textarea
                    value={quickDialNote}
                    onChange={(e) => setQuickDialNote(e.target.value)}
                    placeholder="Call note"
                    rows={1}
                    className="w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[2.5rem]"
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Check Number Tab */}
          {activeTab === 'check' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Check Number</h3>
            <p className="text-sm text-gray-500 mb-3">Enter a phone number to check if there's a customer or last sale associated with it.</p>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="flex-1 max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={checkNumberInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d*#+\-() ]/g, '');
                      setCheckNumberInput(formatLandline(v));
                      setCheckNumberValidation(validatePhone(formatLandline(v)));
                    }}
                    onPaste={(e) => {
                      if (checkNumberResult) return;
                      e.preventDefault();
                      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                      const cleaned = pasted.replace(/[^\d*#+\-() ]/g, '');
                      const formatted = formatLandline(cleaned);
                      setCheckNumberInput(formatted);
                      setCheckNumberValidation(validatePhone(formatted));
                    }}
                    placeholder="Paste or enter phone number"
                    disabled={!!checkNumberResult}
                    className={`w-full px-5 py-3.5 text-xl font-mono border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500 ${checkNumberValidation.isValid ? 'border-blue-400 bg-blue-50/30' : 'border-red-500 bg-red-50/30'}`}
                  />
                  <p className={`mt-1 text-xs min-h-[1rem] ${checkNumberValidation.message ? (checkNumberValidation.isValid ? 'text-gray-500' : 'text-red-600') : 'invisible'}`}>
                    {checkNumberValidation.message || 'placeholder'}
                  </p>
                </div>
                <div className="flex gap-3 sm:mt-6">
                  <button
                    onClick={handleCheckNumberTab}
                    disabled={!checkNumberInput.trim() || !checkNumberValidation.isValid || isCheckingNumberTab || !!checkNumberResult}
                    className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-lg rounded-lg flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCheckingNumberTab ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Checking...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Check
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setCheckNumberInput('');
                      setCheckNumberResult(null);
                      setCheckNumberValidation({ isValid: true, message: '' });
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-lg rounded-lg"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Results */}
              {checkNumberResult && (
                <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900 mb-3">Results for {checkNumberInput}</h4>
                  
                  {checkNumberResult.exists ? (
                    <div className="space-y-3">
                      {/* Customer Info */}
                      {checkNumberResult.customers && checkNumberResult.customers.length > 0 && (
                        <div className="bg-white p-3 rounded border border-gray-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">Customer(s) Found:</p>
                          {checkNumberResult.customers.map((customer, idx) => (
                            <div key={idx} className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">{customer.firstName} {customer.lastName}</span>
                              {customer.email && <span className="ml-2 text-gray-500">({customer.email})</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Last Sale Info */}
                      {checkNumberResult.lastSale ? (() => {
                        const sale = checkNumberResult.lastSale;
                        const saleDate = (sale.created_at || sale.createdAt) ? new Date(sale.created_at || sale.createdAt) : null;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const saleDateOnly = saleDate ? new Date(saleDate) : null;
                        if (saleDateOnly) saleDateOnly.setHours(0, 0, 0, 0);
                        
                        let period = '';
                        if (saleDateOnly) {
                          if (saleDateOnly.getTime() === today.getTime()) {
                            period = 'Today';
                          } else if (saleDateOnly.getTime() === yesterday.getTime()) {
                            period = 'Yesterday';
                          } else {
                            const diffDays = Math.floor((today - saleDateOnly) / (1000 * 60 * 60 * 24));
                            if (diffDays < 7) {
                              period = `${diffDays} days ago`;
                            } else if (diffDays < 30) {
                              const weeks = Math.floor(diffDays / 7);
                              period = `${weeks} week${weeks > 1 ? 's' : ''} ago`;
                            } else {
                              const months = Math.floor(diffDays / 30);
                              period = `${months} month${months > 1 ? 's' : ''} ago`;
                            }
                          }
                        }
                        
                        return (
                        <div className="bg-white p-3 rounded border border-gray-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">Last Sale:</p>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p><span className="font-medium">Sale ID:</span> {sale.id}</p>
                            <p><span className="font-medium">Customer:</span> {sale.customer?.firstName} {sale.customer?.lastName}</p>
                            <p><span className="font-medium">Status:</span> <span className={`px-2 py-0.5 text-xs rounded-full ${
                              sale.status === 'verified' ? 'bg-green-100 text-green-800' :
                              sale.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              sale.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>{sale.statusDisplay || sale.status}</span></p>
                            {sale.agent && (
                              isAdmin(user) || 
                              sale.agent.id === user?.id ||
                              (isSupervisor(user) && user?.supervisedAgents?.some((a) => a.id === sale.agent.id))
                            ) && (
                              <p><span className="font-medium">Agent:</span> {sale.agent.firstName} {sale.agent.lastName}</p>
                            )}
                            {saleDate && (
                              <>
                                <p><span className="font-medium">Date:</span> {saleDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}</p>
                                <p><span className="font-medium">Time:</span> {saleDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</p>
                                <p><span className="font-medium">Period:</span> <span className="text-blue-600 font-medium">{period}</span></p>
                              </>
                            )}
                            {sale.product && (
                              <p><span className="font-medium">Product:</span> {sale.product}</p>
                            )}
                          </div>
                        </div>
                        );
                      })() : (
                        <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                          <p className="text-sm text-yellow-800">Customer found but no sales recorded.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 p-3 rounded border border-green-200">
                      <p className="text-sm text-green-800 font-medium">No customer or sale found for this number.</p>
                      <p className="text-sm text-green-700 mt-1">This appears to be a fresh lead!</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Call history - same for all tabs */}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outcome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {calls.map((call) => (
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
                        <td className="px-4 py-3 text-sm text-gray-600">{getCallPurposeDisplay(call.callPurpose)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <select
                            value={call.callOutcome || ''}
                            onChange={(e) => handleOutcomeChange(call, e.target.value)}
                            disabled={savingOutcomeCallId === call.id}
                            className={`w-full min-w-[150px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-transparent focus:ring-2 focus:ring-blue-500 ${
                              call.callOutcome
                                ? getOutcomeBadgeClasses(call.callOutcome)
                                : 'bg-gray-100 text-gray-700'
                            } ${savingOutcomeCallId === call.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <option value="">Select outcome</option>
                            {postCallOutcomeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px]">
                          {call.callNotes ? (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteModal(call.id)}
                              className="text-left w-full block truncate text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              title="Click to see full note"
                            >
                              {trimNote(call.callNotes)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteModal(call.id)}
                              className="text-gray-400 hover:text-blue-600 hover:underline cursor-pointer"
                              title="Click to add note"
                            >
                              + Add
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                            <button
                              onClick={() => handleCallFromRow(call.toNumber, getDisplayName(call))}
                              disabled={hasActiveCall || !isTwilioEnabled || !call.toNumber}
                              className="inline-flex items-center justify-center w-7 h-7 text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                              title="Call"
                              aria-label="Call"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => openCreateSale(call.toNumber, getDisplayName(call))}
                              disabled={!call.toNumber}
                              className="inline-flex items-center justify-center w-7 h-7 text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                              title="Create sale"
                              aria-label="Create sale"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleCloseNoteModal}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Call note</h3>
              <button
                type="button"
                onClick={handleCloseNoteModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {editingNote ? (
              <div className="space-y-3">
                <textarea
                  value={editNoteValue}
                  onChange={(e) => setEditNoteValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[100px]"
                  placeholder="Enter note..."
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote(false);
                      const call = calls.find((c) => c.id === noteModalCallId);
                      setEditNoteValue(call?.callNotes || '');
                    }}
                    disabled={savingNote}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingNote ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.find((c) => c.id === noteModalCallId)?.callNotes ? (
                  <p className="text-gray-700 whitespace-pre-wrap break-words">
                    {calls.find((c) => c.id === noteModalCallId)?.callNotes}
                  </p>
                ) : (
                  <p className="text-gray-400 italic">No note yet</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingNote(true)}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {calls.find((c) => c.id === noteModalCallId)?.callNotes ? 'Edit note' : 'Add note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showPostCallDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
              <h3 className="text-lg font-semibold text-gray-900">Post-call details</h3>
              <p className="text-sm text-gray-500 mt-1">Select one outcome and add notes.</p>
              </div>
              <button
                type="button"
                onClick={handleClosePostCallDialog}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                aria-label="Close post-call modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Call outcome *</p>
                <div className="grid grid-cols-2 gap-2">
                  {postCallOutcomeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPostCallOutcome(option.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors font-medium ${
                        postCallOutcome === option.value
                          ? `border-transparent ${getOutcomeBadgeClasses(option.value)}`
                          : `${getOutcomeBadgeClasses(option.value)} opacity-70 hover:opacity-100 border-transparent`
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={postCallNote}
                  onChange={(e) => setPostCallNote(e.target.value)}
                  placeholder="Add call note..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={handleClosePostCallDialog}
                disabled={savingPostCall}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSavePostCallDialog}
                disabled={!postCallOutcome || savingPostCall}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {savingPostCall ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </ProtectedRoute>
  );
}
