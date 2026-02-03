'use client';

import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from './ConfirmModal';
import { formatLandline, validateLandline } from '../lib/validation';
import IVRCallHistory from './IVRCallHistory';

export default function IVRDialerModal({ 
  isOpen, 
  onClose, 
  onMinimize,
  onAddNew,
  onSendDigits,
  onMakeCall,
  onHangup,
  onMute,
  isConnected,
  isCalling = false,
  isConnecting = false,
  callStatus = null,
  isMuted = false,
  callTimer = 0,
  phoneNumber: callPhoneNumber = null,
  error: callError = null,
  callId,
  callLabel,
  isMinimized = false,
  canAddNew = true,
  mode = 'dial',
  isAutomatedCall = false,
  isGlobalCallInterfaceOpen = false
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [enteredDigits, setEnteredDigits] = useState('');
  const [savedHelplines, setSavedHelplines] = useState([]);
  const [showSavedList, setShowSavedList] = useState(false); // Toggle right column visibility - closed by default
  const [rightPanelView, setRightPanelView] = useState('helplines'); // 'helplines' or 'history'
  const [showAddNewSection, setShowAddNewSection] = useState(false); // Toggle add new section
  const [newHelplineNumber, setNewHelplineNumber] = useState('');
  const [newHelplineLabel, setNewHelplineLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHelplines, setLoadingHelplines] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [helplineToDelete, setHelplineToDelete] = useState(null);
  const [phoneValidation, setPhoneValidation] = useState({ isValid: true, message: '' });
  const [newHelplineValidation, setNewHelplineValidation] = useState({ isValid: true, message: '' });
  const inputRef = useRef(null);
  const newHelplineNumberInputRef = useRef(null);
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const audioContextRef = useRef(null);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined' && window.AudioContext) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Play DTMF tone for keypad button
  const playKeypadSound = (digit) => {
    if (!audioContextRef.current) return;
    
    try {
      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set frequency based on digit (DTMF-like tones)
      const frequencies = {
        '1': 697, '2': 697, '3': 697,
        '4': 770, '5': 770, '6': 770,
        '7': 852, '8': 852, '9': 852,
        '*': 941, '0': 941, '#': 941
      };
      
      const frequency = frequencies[digit] || 800;
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.error('Error playing keypad sound:', error);
    }
  };

  // Play sound for action buttons (backspace, clear, call)
  const playActionSound = (action) => {
    if (!audioContextRef.current) return;
    
    try {
      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Different frequencies for different actions
      const frequencies = {
        'backspace': 400,  // Lower tone for backspace
        'clear': 300,      // Even lower for clear
        'call': 600        // Higher tone for call
      };
      
      const frequency = frequencies[action] || 500;
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      // Slightly longer duration for action buttons
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (error) {
      console.error('Error playing action sound:', error);
    }
  };

  // Fetch saved helplines
  const fetchHelplines = async () => {
    setLoadingHelplines(true);
    try {
      const response = await apiClient.get('/api/helplines');
      const data = await response.json();
      if (data?.success) {
        setSavedHelplines(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching helplines:', error);
    } finally {
      setLoadingHelplines(false);
    }
  };

  // Fetch helplines only when user requests to show the list
  useEffect(() => {
    if (isOpen && showSavedList && savedHelplines.length === 0) {
      fetchHelplines();
    }
  }, [isOpen, showSavedList]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPhoneNumber('');
      setEnteredDigits('');
      setNewHelplineNumber('');
      setNewHelplineLabel('');
      setEditingLabel(null);
      setNewLabel('');
      setShowAddNewSection(false);
      setPhoneValidation({ isValid: true, message: '' });
    }
  }, [isOpen]);

  // Prevent paste in main input field (dial mode only)
  // But allow paste in the "add new number" input field
  useEffect(() => {
    const handlePaste = (e) => {
      // Allow paste in the "add new number" input field
      if (newHelplineNumberInputRef.current && (newHelplineNumberInputRef.current === e.target || newHelplineNumberInputRef.current.contains(e.target))) {
        return; // Allow paste to proceed normally
      }
      // Prevent paste in main input field (dial mode only)
      if (mode === 'dial' && inputRef.current && (inputRef.current === e.target || inputRef.current.contains(e.target))) {
        e.preventDefault();
        return false;
      }
    };

    if (isOpen && mode === 'dial') {
      document.addEventListener('paste', handlePaste);
      return () => {
        document.removeEventListener('paste', handlePaste);
      };
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // Minimized view
  if (isMinimized) {
    // Calculate right offset when GlobalWebCallInterface is open (w-80 = 320px + 16px spacing)
    const rightOffset = isGlobalCallInterfaceOpen ? 'calc(1rem + 336px)' : '1rem';
    
    return (
      <div 
        className="fixed bottom-4 z-[10000] bg-white rounded-lg shadow-2xl border-2 border-purple-300 w-64"
        style={{ right: rightOffset }}
        onClick={onMinimize ? () => onMinimize(false) : undefined}
      >
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {mode === 'dial' ? 'Dialer' : 'IVR Dialer'}
              </div>
              {callLabel && (
                <div className="text-xs text-purple-100 truncate">{callLabel}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onMinimize) onMinimize(false);
              }}
              className="p-1 hover:bg-purple-700 rounded transition-colors"
              title="Restore"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 hover:bg-purple-700 rounded transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Format phone number while preserving special characters (*, #, +, etc.)
  const formatPhoneNumberWithSpecialChars = (value) => {
    // Extract special characters and their positions
    const specialChars = ['*', '#', '+'];
    let hasSpecialChar = false;
    let specialCharIndex = -1;
    let specialChar = '';
    
    // Check if value contains special characters
    for (let i = 0; i < value.length; i++) {
      if (specialChars.includes(value[i])) {
        hasSpecialChar = true;
        specialCharIndex = i;
        specialChar = value[i];
        break;
      }
    }
    
    // If no special characters, format normally
    if (!hasSpecialChar) {
      return formatLandline(value);
    }
    
    // Split into base number and extension/special part
    const baseNumber = value.substring(0, specialCharIndex);
    const extension = value.substring(specialCharIndex);
    
    // Format the base number
    const formattedBase = formatLandline(baseNumber);
    
    // Combine formatted base with extension
    return formattedBase + extension;
  };

  // Validate phone number
  const validatePhoneNumber = (value) => {
    if (!value || value.trim() === '') {
      return { isValid: false, message: 'Phone number is required' };
    }
    
    // Remove formatting and special characters for validation
    const cleanNumber = value.replace(/[^\d]/g, '');
    
    // Check if it's a standard US number (10 digits)
    if (cleanNumber.length === 10) {
      return { isValid: true, message: '' };
    }
    
    // Allow numbers with extensions (more than 10 digits)
    if (cleanNumber.length > 10 && cleanNumber.length <= 15) {
      return { isValid: true, message: '' };
    }
    
    // Check minimum length
    if (cleanNumber.length < 10) {
      return { isValid: false, message: 'Phone number must be at least 10 digits' };
    }
    
    // Check maximum length
    if (cleanNumber.length > 15) {
      return { isValid: false, message: 'Phone number must be less than 15 digits' };
    }
    
    return { isValid: true, message: '' };
  };

  const handleDigitClick = (digit) => {
    // Play sound when button is clicked
    playKeypadSound(digit);
    
    // If call is active (connected or in-progress), enter digits for DTMF
    // Otherwise, enter digits for phone number dialing
    const isCallActive = isConnected || callStatus === 'in-progress' || isCalling || isConnecting;
    
    if (isCallActive) {
      // During active call: digits go to enteredDigits for DTMF
      setEnteredDigits(prev => prev + digit);
    } else if (mode === 'dial') {
      // Before call: digits go to phoneNumber for dialing
      const newValue = phoneNumber + digit;
      const formatted = formatPhoneNumberWithSpecialChars(newValue);
      setPhoneNumber(formatted);
      
      // Validate
      const validation = validatePhoneNumber(formatted);
      setPhoneValidation(validation);
    } else {
      // IVR mode (for future use)
      setEnteredDigits(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    // Play sound
    playActionSound('backspace');
    
    // If call is active, backspace affects enteredDigits (DTMF)
    // Otherwise, backspace affects phoneNumber (dialing)
    const isCallActive = isConnected || callStatus === 'in-progress' || isCalling || isConnecting;
    
    if (isCallActive) {
      // During active call: backspace enteredDigits
      setEnteredDigits(prev => prev.slice(0, -1));
    } else if (mode === 'dial') {
      // Before call: backspace phoneNumber
      const newValue = phoneNumber.slice(0, -1);
      const formatted = formatPhoneNumberWithSpecialChars(newValue);
      setPhoneNumber(formatted);
      
      // Validate
      const validation = validatePhoneNumber(formatted);
      setPhoneValidation(validation);
    } else {
      // IVR mode (for future use)
      setEnteredDigits(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    // Play sound
    playActionSound('clear');
    
    // If call is active, clear enteredDigits (DTMF)
    // Otherwise, clear phoneNumber (dialing)
    const isCallActive = isConnected || callStatus === 'in-progress' || isCalling || isConnecting;
    
    if (isCallActive) {
      // During active call: clear enteredDigits
      setEnteredDigits('');
    } else if (mode === 'dial') {
      // Before call: clear phoneNumber
      setPhoneNumber('');
      setPhoneValidation({ isValid: true, message: '' });
    } else {
      // IVR mode (for future use)
      setEnteredDigits('');
    }
  };

  const handleCall = () => {
    if (!phoneNumber.trim()) {
      setPhoneValidation({ isValid: false, message: 'Phone number is required' });
      return;
    }
    
    // Validate before making call
    const validation = validatePhoneNumber(phoneNumber);
    setPhoneValidation(validation);
    
    if (!validation.isValid) {
      showWarning(validation.message);
      return;
    }
    
    // Play sound
    playActionSound('call');
    
    if (onMakeCall) {
      onMakeCall(phoneNumber.trim());
    }
  };

  const handleSendDigits = () => {
    if (enteredDigits && onSendDigits) {
      onSendDigits(enteredDigits, callId);
      setEnteredDigits('');
    }
  };

  const handleSaveHelpline = async () => {
    if (!newHelplineNumber.trim()) {
      setNewHelplineValidation({ isValid: false, message: 'Phone number is required' });
      showWarning('Please enter a phone number');
      return;
    }
    
    // Validate phone number
    const validation = validatePhoneNumber(newHelplineNumber);
    setNewHelplineValidation(validation);
    
    if (!validation.isValid) {
      showWarning(validation.message);
      return;
    }
    
    if (!newHelplineLabel.trim()) {
      showWarning('Please enter a name/label');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/helplines', {
        phoneNumber: newHelplineNumber.trim(),
        label: newHelplineLabel.trim()
      });

      const data = await response.json();

      if (data?.success) {
        // Reload helplines
        await fetchHelplines();
        setNewHelplineNumber('');
        setNewHelplineLabel('');
        setNewHelplineValidation({ isValid: true, message: '' });
        setShowAddNewSection(false);
        showSuccess('Helpline saved successfully');
      } else {
        showError('Failed to save helpline: ' + (data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving helpline:', error);
      showError('Failed to save helpline: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDial = (helpline) => {
    const formatted = formatPhoneNumberWithSpecialChars(helpline.phoneNumber);
    setPhoneNumber(formatted);
    
    // Validate
    const validation = validatePhoneNumber(formatted);
    setPhoneValidation(validation);
    
    // Switch to dial mode if not already
    if (mode !== 'dial') {
      // Note: mode is controlled by parent, but we can at least set the number
    }
  };

  const handleUpdateLabel = async (helplineId, newLabelValue) => {
    if (!newLabelValue.trim()) {
      showWarning('Label cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.put(`/api/helplines/${helplineId}`, {
        label: newLabelValue.trim()
      });

      const data = await response.json();

      if (data?.success) {
        await fetchHelplines();
        setEditingLabel(null);
        setNewLabel('');
        showSuccess('Label updated successfully');
      } else {
        showError('Failed to update label: ' + (data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating label:', error);
      showError('Failed to update label: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (helplineId) => {
    setHelplineToDelete(helplineId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!helplineToDelete) return;

    setLoading(true);
    setShowDeleteConfirm(false);
    
    try {
      const response = await apiClient.delete(`/api/helplines/${helplineToDelete}`);
      const data = await response.json();

      if (data?.success) {
        await fetchHelplines();
        showSuccess('Helpline deleted successfully');
      } else {
        showError('Failed to delete helpline: ' + (data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting helpline:', error);
      showError('Failed to delete helpline: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
      setHelplineToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setHelplineToDelete(null);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    return false;
  };

  const displayValue = mode === 'dial' ? phoneNumber : enteredDigits;
  const canCall = mode === 'dial' && phoneNumber.length > 0 && phoneValidation.isValid;
  // Allow sending digits when call is connected, regardless of mode
  const canSend = enteredDigits.length > 0 && (isConnected || callStatus === 'in-progress');

  // Helper function to format timer
  const formatTimer = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Helper function to get status display
  const getStatusDisplay = () => {
    if (callStatus === 'in-progress') return 'In Progress';
    if (callStatus === 'ringing') return 'Ringing';
    if (callStatus === 'queued') return 'Connecting...';
    if (callStatus === 'completed') return 'Completed';
    if (callStatus === 'failed') return 'Failed';
    if (callStatus === 'no-answer') return 'No Answer';
    if (callStatus === 'busy') return 'Busy';
    return callStatus || '';
  };

  // Calculate right offset when GlobalWebCallInterface is open (w-80 = 320px + 16px spacing)
  const rightOffset = isGlobalCallInterfaceOpen ? 'calc(1rem + 336px)' : '1rem';

  return (
    <>
      {/* Main Modal - positioned bottom right */}
      <div 
        className="fixed bottom-4 bg-white rounded-lg shadow-2xl z-[10001] overflow-hidden"
        style={{ 
          right: rightOffset,
          maxHeight: 'calc(100vh - 2rem)',
          width: '300px',
          maxWidth: 'calc(100vw - 2rem)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-blue-600">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">
              {mode === 'dial' ? 'Phone Dialer' : 'IVR Dialer'}
            </h3>
            {callLabel && (
              <p className="text-xs text-blue-100 mt-0.5 truncate">{callLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {onMinimize && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onMinimize) onMinimize(true);
                }}
                className="p-1 text-white hover:bg-blue-700 rounded transition-colors duration-200 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 text-white hover:bg-blue-700 rounded transition-colors duration-200"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body - Reorganized Layout */}
        <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
          {/* Call Status Display - Show when call is active */}
          {(isCalling || isConnected || callStatus) && (
            <div className="p-2 bg-blue-50 border-b border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {callStatus === 'in-progress' && (
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  )}
                  {callStatus === 'ringing' && (
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  )}
                  {(callStatus === 'queued' || isCalling) && (
                    <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
                  )}
                  <span className="font-semibold text-blue-800 text-sm">
                    {callPhoneNumber || 'Calling...'}
                  </span>
                </div>
                {callStatus && (
                  <span className="text-xs text-blue-600 font-medium">
                    {getStatusDisplay()}
                  </span>
                )}
              </div>
              
              {/* Timer - only show when in-progress */}
              {callStatus === 'in-progress' && callTimer > 0 && (
                <div className="text-base font-bold text-blue-700">
                  {formatTimer(callTimer)}
                </div>
              )}

              {/* Error Display */}
              {callError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {callError}
                </div>
              )}

              {/* Call Controls - Show when call is active */}
              {(isCalling || isConnected || callStatus === 'in-progress' || callStatus === 'ringing') && (
                <div className="mt-2 flex gap-2">
                  {callStatus === 'in-progress' && onMute && (
                    <button
                      onClick={onMute}
                      className={`flex-1 px-2 py-1.5 rounded-lg font-medium text-xs ${
                        isMuted 
                          ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                          : 'bg-gray-600 hover:bg-gray-700 text-white'
                      }`}
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                  )}
                  {onHangup && (
                    <button
                      onClick={onHangup}
                      className="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-xs"
                    >
                      Hang Up
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* First Row - Phone Number Input (when not in call) or DTMF Digits (when in call) */}
          <div className="p-1.5 border-b border-gray-200">
            {/* Show phone number input when call is NOT active */}
            {!(isConnected || callStatus === 'in-progress' || isCalling || isConnecting) && mode === 'dial' && (
              <>
                <div className={`bg-gray-50 border-2 rounded-lg p-1.5 text-center ${phoneValidation.isValid ? 'border-gray-300' : 'border-red-500'}`}>
                  <input
                    ref={inputRef}
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      // Allow manual typing but filter invalid characters
                      let value = e.target.value.replace(/[^\d*#+\-() ]/g, '');
                      
                      // Format the phone number
                      value = formatPhoneNumberWithSpecialChars(value);
                      
                      setPhoneNumber(value);
                      
                      // Validate
                      const validation = validatePhoneNumber(value);
                      setPhoneValidation(validation);
                    }}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      // Allow backspace and delete
                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        return;
                      }
                      // Allow digits, *, #, +, -, spaces, parentheses
                      if (/[\d*#+\-() ]/.test(e.key)) {
                        return;
                      }
                      // Prevent all other keys
                      e.preventDefault();
                    }}
                    placeholder="Use keypad to enter number"
                    className={`text-base font-mono font-bold w-full text-center bg-transparent border-none outline-none min-h-[32px] ${phoneValidation.isValid ? 'text-gray-800' : 'text-red-600'}`}
                  />
                </div>
                {phoneValidation.message && (
                  <p className={`text-xs mt-1 text-center ${phoneValidation.isValid ? 'text-gray-500' : 'text-red-600'}`}>
                    {phoneValidation.message}
                  </p>
                )}
                {!phoneValidation.message && (
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    Use keypad to enter number (paste disabled)
                  </p>
                )}
              </>
            )}
            {/* Show DTMF digits input when call IS active OR in IVR mode */}
            {((isConnected || callStatus === 'in-progress' || isCalling || isConnecting) || mode === 'ivr') && (
              <>
                <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-1.5 text-center">
                  <div className="text-base font-mono font-bold text-gray-800 min-h-[32px] flex items-center justify-center">
                    {enteredDigits || <span className="text-gray-400">Enter IVR digits</span>}
                  </div>
                </div>
                {(isConnected || callStatus === 'in-progress') && (
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    Enter digits to send DTMF tones during call
                  </p>
                )}
              </>
            )}
          </div>

          {/* Second Row - Keypad and Helplines Side by Side */}
          <div className="flex flex-col flex-1" style={{ maxHeight: 'calc(100vh - 24rem)' }}>
            {/* Toggle Button for Options Panel */}
            <div className="p-1.5 border-b border-gray-200 bg-gray-50 flex justify-center items-center gap-2">
              <button
                onClick={() => {
                  const newState = !showSavedList;
                  setShowSavedList(newState);
                  if (newState) {
                    setRightPanelView('helplines');
                    // Fetch helplines when showing the list
                    if (savedHelplines.length === 0) {
                      fetchHelplines();
                    }
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                title={showSavedList ? "Show Keypad" : "Show Options"}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showSavedList ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
                {showSavedList ? 'Keypad' : 'Options'}
              </button>
              
              {/* View Toggle - Only show when options panel is visible */}
              {showSavedList && (
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setRightPanelView('helplines')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      rightPanelView === 'helplines'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Helplines
                  </button>
                  <button
                    onClick={() => setRightPanelView('history')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      rightPanelView === 'history'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    History
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex flex-1" style={{ maxHeight: 'calc(100vh - 29rem)' }}>
              {/* Keypad Panel - Only show when saved list is hidden */}
              {!showSavedList && (
              <div className="p-1.5 flex flex-col w-full" style={{ minHeight: '260px' }}>
              {/* Phone Number Display - DIAL MODE */}
              {mode === 'dial' && (
                <>
                {/* Call Status Area - Reserved for future implementation */}
                <div className="mb-1.5 min-h-[32px] flex items-center justify-center">
                  {/* Call status will be displayed here */}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  <button onClick={() => handleDigitClick('1')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">1</button>
                  <button onClick={() => handleDigitClick('2')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">2</button>
                  <button onClick={() => handleDigitClick('3')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">3</button>
                  <button onClick={() => handleDigitClick('4')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">4</button>
                  <button onClick={() => handleDigitClick('5')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">5</button>
                  <button onClick={() => handleDigitClick('6')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">6</button>
                  <button onClick={() => handleDigitClick('7')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">7</button>
                  <button onClick={() => handleDigitClick('8')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">8</button>
                  <button onClick={() => handleDigitClick('9')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">9</button>
                  <button onClick={() => handleDigitClick('*')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">*</button>
                  <button onClick={() => handleDigitClick('0')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">0</button>
                  <button onClick={() => handleDigitClick('#')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-1 rounded transition-all duration-150 shadow-sm cursor-pointer">#</button>
                </div>

                {/* Action buttons - Backspace, Clear, and Call */}
                <div className="flex gap-1.5 mt-auto">
                  <button
                    onClick={handleBackspace}
                    disabled={!phoneNumber}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Backspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={!phoneNumber}
                    className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Clear"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCall}
                    disabled={!canCall}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-semibold py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1 shadow-lg text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call
                  </button>
                </div>
              </>
            )}

              {/* IVR Digits Display - IVR MODE */}
              {mode === 'ivr' && (
                <>
                {/* Call Status Area - Reserved for future implementation */}
                <div className="mb-1.5 min-h-[32px] flex items-center justify-center">
                  {/* Call status will be displayed here */}
                </div>

                {/* Keypad - same as dial mode */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button onClick={() => handleDigitClick('1')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">1</button>
                  <button onClick={() => handleDigitClick('2')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">2</button>
                  <button onClick={() => handleDigitClick('3')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">3</button>
                  <button onClick={() => handleDigitClick('4')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">4</button>
                  <button onClick={() => handleDigitClick('5')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">5</button>
                  <button onClick={() => handleDigitClick('6')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">6</button>
                  <button onClick={() => handleDigitClick('7')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">7</button>
                  <button onClick={() => handleDigitClick('8')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">8</button>
                  <button onClick={() => handleDigitClick('9')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">9</button>
                  <button onClick={() => handleDigitClick('*')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">*</button>
                  <button onClick={() => handleDigitClick('0')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">0</button>
                  <button onClick={() => handleDigitClick('#')} className="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-sm py-2 px-2 rounded transition-all duration-150 shadow-sm cursor-pointer">#</button>
                </div>

                {/* Action buttons - Backspace, Clear, and Send Digits */}
                <div className="flex gap-1.5 mt-auto">
                  <button
                    onClick={handleBackspace}
                    disabled={!enteredDigits}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Backspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={!enteredDigits}
                    className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Clear"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={handleSendDigits}
                    disabled={!canSend}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white font-semibold py-2 px-2 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1 shadow-lg text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send
                  </button>
                </div>

                {!isConnected && !canSend && enteredDigits.length > 0 && (
                  <div className="mt-2 text-center text-xs text-red-600">
                    ⚠️ Call must be connected to send digits
                  </div>
                )}
                </>
                )}
              </div>
              )}

            {/* Right Panel - Saved Helplines or Call History - Only show when saved list is visible */}
            {showSavedList && (
              <div className="w-full flex flex-col" style={{ height: '260px' }}>
                {/* Show Add New Helpline Section only when viewing helplines */}
                {rightPanelView === 'helplines' && (
                <div className="p-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              {!showAddNewSection ? (
                /* Add New Number Button */
                <button
                  onClick={() => setShowAddNewSection(true)}
                  className="w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors duration-200 flex items-center justify-center gap-1 text-xs cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add New Number
                </button>
              ) : (
                /* Inline Input Fields */
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-semibold text-gray-700">Add New Helpline</h4>
                    <button
                      onClick={() => {
                        setShowAddNewSection(false);
                        setNewHelplineNumber('');
                        setNewHelplineLabel('');
                        setNewHelplineValidation({ isValid: true, message: '' });
                      }}
                      className="text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                      title="Close"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Phone Number Input - PASTE ALLOWED HERE */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
                      Phone Number
                    </label>
                    <input
                      ref={newHelplineNumberInputRef}
                      type="tel"
                      value={newHelplineNumber}
                      onChange={(e) => {
                        // Allow only digits, +, -, spaces, parentheses, and * for extensions
                        let value = e.target.value.replace(/[^\d+\-() *]/g, '');
                        
                        // Format the phone number
                        value = formatPhoneNumberWithSpecialChars(value);
                        
                        setNewHelplineNumber(value);
                        
                        // Validate
                        const validation = validatePhoneNumber(value);
                        setNewHelplineValidation(validation);
                      }}
                      onPaste={(e) => {
                        // Explicitly allow paste and process the pasted content
                        e.preventDefault();
                        e.stopPropagation(); // Stop event from bubbling to document handler
                        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                        // Clean the pasted text to allow only valid phone number characters
                        let cleanedValue = pastedText.replace(/[^\d+\-() *]/g, '');
                        
                        // Format the pasted value
                        cleanedValue = formatPhoneNumberWithSpecialChars(cleanedValue);
                        
                        setNewHelplineNumber(cleanedValue);
                        
                        // Validate
                        const validation = validatePhoneNumber(cleanedValue);
                        setNewHelplineValidation(validation);
                      }}
                      onCut={(e) => {
                        // Allow cut operation - let it proceed normally
                        e.stopPropagation(); // Stop event from bubbling to document handler
                        // The default cut behavior will work, we just need to not prevent it
                      }}
                      onCopy={(e) => {
                        // Allow copy operation - let it proceed normally
                        e.stopPropagation(); // Stop event from bubbling to document handler
                        // The default copy behavior will work, we just need to not prevent it
                      }}
                      onKeyDown={(e) => {
                        // Allow standard editing shortcuts (cut, copy, paste, select all, undo, redo)
                        if ((e.ctrlKey || e.metaKey) && ['x', 'c', 'v', 'a', 'z', 'y'].includes(e.key.toLowerCase())) {
                          return; // Allow Ctrl/Cmd + X, C, V, A, Z, Y
                        }
                        // Allow backspace, delete, tab, escape, enter, and arrow keys
                        if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                          return;
                        }
                        // Allow digits, +, -, spaces, parentheses, and *
                        if (/[\d+\-() *]/.test(e.key)) {
                          return;
                        }
                        // Prevent all other keys
                        e.preventDefault();
                      }}
                      placeholder="Enter or paste phone number"
                      className={`w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs ${newHelplineValidation.isValid ? 'border-gray-300' : 'border-red-500'}`}
                    />
                    {newHelplineValidation.message && (
                      <p className={`text-xs mt-0.5 ${newHelplineValidation.isValid ? 'text-gray-500' : 'text-red-600'}`}>
                        {newHelplineValidation.message}
                      </p>
                    )}
                    {!newHelplineValidation.message && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        You can paste the number here
                      </p>
                    )}
                  </div>

                  {/* Name/Label Input */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
                      Name/Label
                    </label>
                    <input
                      type="text"
                      value={newHelplineLabel}
                      onChange={(e) => setNewHelplineLabel(e.target.value)}
                      placeholder="Enter a name for this helpline"
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newHelplineNumber.trim() && newHelplineLabel.trim()) {
                          handleSaveHelpline();
                        }
                      }}
                    />
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSaveHelpline}
                    disabled={!newHelplineNumber.trim() || !newHelplineLabel.trim() || loading}
                    className="w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded transition-colors duration-200 flex items-center justify-center gap-1 text-xs"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
                </div>
                )}

                <div 
                  className="overflow-y-auto p-2 flex-1"
                  style={{ minHeight: 0 }}
                >
                  {rightPanelView === 'helplines' ? (
                    <>
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">Saved Helplines</h4>
                      {loadingHelplines ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                          <p className="text-xs text-gray-500">Loading helplines...</p>
                        </div>
                      ) : savedHelplines.length === 0 ? (
                        <div className="text-center py-4">
                          <svg className="w-8 h-8 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          <p className="text-xs text-gray-500">No saved helplines</p>
                          <p className="text-xs text-gray-400 mt-0.5">Add a new helpline above</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[...savedHelplines].sort((a, b) => {
                            // Sort by ID in descending order (newest first)
                            const idA = a.id || 0;
                            const idB = b.id || 0;
                            return idB - idA;
                          }).map((helpline) => (
                        <div
                          key={helpline.id || helpline.phoneNumber}
                          className="p-2 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                        >
                          {editingLabel === helpline.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateLabel(helpline.id, newLabel);
                                  } else if (e.key === 'Escape') {
                                    setEditingLabel(null);
                                    setNewLabel('');
                                  }
                                }}
                                className="flex-1 text-xs px-1.5 py-0.5 border border-gray-300 rounded"
                                autoFocus
                              />
                              <button
                                onClick={() => {
                                  handleUpdateLabel(helpline.id, newLabel);
                                }}
                                className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingLabel(null);
                                  setNewLabel('');
                                }}
                                className="p-0.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex-1 min-w-0">
                                  <div className="text-base font-semibold text-gray-800 truncate">
                                    {helpline.label || helpline.phoneNumber}
                                  </div>
                                  <div className="text-sm text-gray-500 truncate">
                                    {helpline.phoneNumber}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleQuickDial(helpline)}
                                  className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-0.5 cursor-pointer"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  Dial
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingLabel(helpline.id);
                                    setNewLabel(helpline.label || helpline.phoneNumber);
                                  }}
                                  className="px-1 py-1 text-gray-600 hover:bg-gray-100 rounded text-xs cursor-pointer"
                                  title="Edit"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(helpline.id)}
                                  className="px-1 py-1 text-red-600 hover:bg-red-50 rounded text-xs cursor-pointer"
                                  title="Delete"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <IVRCallHistory showInModal={true} limit={10} />
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Helpline"
        message={`Are you sure you want to delete "${savedHelplines.find(h => h.id === helplineToDelete)?.label || 'this helpline'}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        isLoading={loading}
        icon={
          <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
    </>
  );
}

