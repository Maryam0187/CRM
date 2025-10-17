import React, { useState, useEffect } from 'react';

// Utility functions (moved from twilio.js to avoid client-side import)
const formatCallDuration = (seconds) => {
  if (!seconds) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const getCallStatusDisplay = (status) => {
  const statusMap = {
    'queued': 'Queued',
    'ringing': 'Ringing',
    'in-progress': 'In Progress',
    'completed': 'Completed',
    'busy': 'Busy',
    'failed': 'Failed',
    'no-answer': 'No Answer',
    'canceled': 'Canceled'
  };
  
  return statusMap[status] || status;
};

const getCallPurposeDisplay = (purpose) => {
  const purposeMap = {
    'follow_up': 'Follow Up',
    'cold_call': 'Cold Call',
    'support': 'Support',
    'sales': 'Sales',
    'appointment': 'Appointment',
    'other': 'Other'
  };
  
  return purposeMap[purpose] || purpose;
};

const CallHistory = ({ 
  customerId, 
  saleId, 
  agentId, 
  limit = 10,
  showCustomerInfo = true,
  showAgentInfo = true,
  className = ''
}) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchCallHistory();
  }, [customerId, saleId, agentId, limit]);

  const fetchCallHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (customerId) params.append('customerId', customerId);
      if (saleId) params.append('saleId', saleId);
      if (agentId) params.append('agentId', agentId);
      params.append('limit', limit);

      const response = await fetch(`/api/calls/initiate?${params}`);
      const result = await response.json();

      if (result.success) {
        setCalls(result.data.calls);
        setTotal(result.data.total);
      } else {
        setError(result.message || 'Failed to fetch call history');
      }
    } catch (err) {
      console.error('Error fetching call history:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClasses = (status) => {
    const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'in-progress':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'ringing':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'failed':
      case 'busy':
      case 'no-answer':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'canceled':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border rounded-lg p-4 mb-3">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading call history</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <div className="mt-3">
                <button
                  onClick={fetchCallHistory}
                  className="text-sm font-medium text-red-800 hover:text-red-600"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No calls yet</h3>
          <p className="mt-1 text-sm text-gray-500">Call history will appear here once calls are made.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Call History</h3>
        <span className="text-sm text-gray-500">{total} total calls</span>
      </div>

      <div className="space-y-3">
        {calls.map((call) => (
          <div key={call.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={getStatusBadgeClasses(call.status)}>
                    {getCallStatusDisplay(call.status)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {getCallPurposeDisplay(call.callPurpose)}
                  </span>
                  {call.direction === 'inbound' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Inbound
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-sm text-gray-600">
                  {showCustomerInfo && call.customer && (
                    <div>
                      <span className="font-medium">Customer:</span> {call.customer.firstName} {call.customer.lastName}
                    </div>
                  )}
                  {showAgentInfo && call.agent && (
                    <div>
                      <span className="font-medium">Agent:</span> {call.agent.firstName} {call.agent.lastName}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Number:</span> {call.toNumber}
                  </div>
                  <div>
                    <span className="font-medium">Time:</span> {formatDate(call.created_at)}
                  </div>
                  {call.duration && (
                    <div>
                      <span className="font-medium">Duration:</span> {formatCallDuration(call.duration)}
                    </div>
                  )}
                </div>

                {call.recordingUrl && (
                  <div className="mt-3">
                    <div className="mb-2">
                      <span className="font-medium text-sm">Recording:</span>
                    </div>
                    <audio controls className="w-full max-w-md">
                      <source src={call.recordingUrl} type="audio/wav" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {call.transcriptionText && (
                  <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                    <div className="font-medium text-blue-900 mb-1">Speech-to-Text:</div>
                    <div className="text-blue-800">{call.transcriptionText}</div>
                  </div>
                )}

                {call.callNotes && (
                  <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                    <span className="font-medium">Notes:</span> {call.callNotes}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallHistory;
