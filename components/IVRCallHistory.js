'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';

/**
 * IVR Call History Component
 * 
 * Displays a list of IVR calls (manual dials) for the authenticated user.
 * Can be integrated into the IVR Dialer Modal or used standalone.
 */
export default function IVRCallHistory({ 
  limit = 20,
  showInModal = false,
  className = ''
}) {
  const { user } = useAuth();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (user?.id) {
      fetchIVRCallHistory();
    }
  }, [user?.id, pagination.page, limit]);

  const fetchIVRCallHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', limit);

      const response = await apiClient.get(`/api/calls/ivr-history?${params}`);
      const result = await response.json();

      if (result.success) {
        setCalls(result.data.calls);
        setPagination(result.data.pagination);
      } else {
        setError(result.message || 'Failed to fetch IVR call history');
      }
    } catch (err) {
      console.error('Error fetching IVR call history:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCallDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      'canceled': 'Canceled',
      'voicemail': 'Voicemail'
    };
    return statusMap[status] || status;
  };

  const getStatusBadgeClasses = (status) => {
    const baseClasses = 'px-2 py-1 text-xs font-semibold rounded-full';
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'in-progress':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'ringing':
      case 'queued':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'failed':
      case 'canceled':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'no-answer':
      case 'busy':
        return `${baseClasses} bg-orange-100 text-orange-800`;
      case 'voicemail':
        return `${baseClasses} bg-purple-100 text-purple-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  if (showInModal) {
    // Compact view for modal
    return (
      <div className={`${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-800">Recent IVR Calls</h3>
          </div>
          {!loading && calls.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {pagination.total} total
            </span>
          )}
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-xs text-gray-500">Loading call history...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          </div>
        )}

        {!loading && !error && calls.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="text-xs text-gray-500 font-medium">No IVR calls found</p>
            <p className="text-xs text-gray-400 mt-1">Start making calls with the IVR Dialer</p>
          </div>
        )}

        {!loading && !error && calls.length > 0 && (
          <>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={getStatusBadgeClasses(call.status)}>
                          {getCallStatusDisplay(call.status)}
                        </span>
                        <span className="text-xs font-medium text-gray-800 truncate">
                          {call.toNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {call.duration !== null && call.duration !== undefined && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatCallDuration(call.duration)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatDate(call.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {call.direction === 'outbound' ? (
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <span className="text-xs text-gray-600 font-medium">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
                >
                  Next
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {pagination.total > limit && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <a
                  href="/ivr-calls"
                  className="block text-center text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  View All Calls ({pagination.total} total) →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Full view (standalone)
  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">IVR Call History</h2>
        <p className="text-sm text-gray-500 mt-1">Manual dial calls made through IVR Dialer</p>
      </div>

      <div className="p-4">
        {loading && (
          <div className="text-center py-8 text-gray-500">
            Loading call history...
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && calls.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No IVR calls found. Start making calls with the IVR Dialer!
          </div>
        )}

        {!loading && !error && calls.length > 0 && (
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={getStatusBadgeClasses(call.status)}>
                        {call.status}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {call.toNumber}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">From:</span> {call.fromNumber || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Time:</span> {formatDate(call.createdAt)}
                      </div>
                      {call.duration && (
                        <div>
                          <span className="font-medium">Duration:</span> {formatCallDuration(call.duration)}
                        </div>
                      )}
                      {call.callSid && (
                        <div className="text-xs text-gray-400">
                          Call SID: {call.callSid.substring(0, 20)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
