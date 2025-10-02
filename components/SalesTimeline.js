'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient.js';

export default function SalesTimeline({ isOpen, onClose, saleId }) {
  const { user } = useAuth();
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && saleId) {
      fetchTimelineData();
    }
  }, [isOpen, saleId]);

  const fetchTimelineData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(`/api/sales-logs?saleId=${saleId}`);
      const result = await response.json();
      
      if (result.success) {
        setTimelineData(result.data || []);
      } else {
        setError(result.error || 'Failed to fetch timeline data');
      }
    } catch (err) {
      setError('Network error: Unable to fetch timeline data');
      console.error('Error fetching timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getActionIcon = (action) => {
    const iconMap = {
      'hangup': '📞',
      'voicemail': '📧',
      'no_response': '❌',
      'lead_call': '🎯',
      'second_call': '🔄',
      'customer_agree': '✅',
      'payment_info': '💳',
      'process': '⚙️',
      'verification': '🔍',
      'charge': '💰',
      'approved': '✅',
      'decline': '❌',
      'chargeback': '🔄',
      'appointment': '📅',
      'done': '✅',
      'close': '🔒'
    };
    return iconMap[action] || '📝';
  };

  const getActionDescription = (action) => {
    const descriptions = {
      'hangup': 'Call ended by agent',
      'voicemail': 'Left voicemail message',
      'no_response': 'No response from customer',
      'lead_call': 'Initial lead contact',
      'second_call': 'Follow-up call made',
      'customer_agree': 'Customer agreed to proceed',
      'payment_info': 'Payment information collected',
      'process': 'Sale processing started',
      'verification': 'Information verification',
      'charge': 'Payment charged',
      'approved': 'Sale approved',
      'decline': 'Customer declined',
      'chargeback': 'Payment chargeback',
      'appointment': 'Appointment scheduled',
      'done': 'Sale completed',
      'close': 'Sale closed'
    };
    return descriptions[action] || 'Action taken';
  };

  const hasSignificantChanges = (currentSaleData, previousSaleData) => {
    if (!currentSaleData) return false;
    
    // If no previous data, show current data if it has meaningful content
    if (!previousSaleData) {
      const significantFields = ['status', 'breakdown', 'notes', 'appointmentDateTime'];
      return significantFields.some(field => {
        const value = currentSaleData[field];
        return value !== null && value !== undefined && value !== '' && value !== 'new';
      });
    }
    
    // Compare current data with previous data to detect changes
    const significantFields = ['status', 'currentStage', 'breakdown', 'notes', 'appointmentDateTime'];
    
    return significantFields.some(field => {
      const currentValue = currentSaleData[field];
      const previousValue = previousSaleData[field];
      
      // Check if values are different and current value is meaningful
      return currentValue !== previousValue && 
             currentValue !== null && 
             currentValue !== undefined && 
             currentValue !== '' && 
             currentValue !== 'new';
    });
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'active': 'bg-green-100 text-green-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'completed': 'bg-blue-100 text-blue-800',
      'cancelled': 'bg-red-100 text-red-800',
      'hang-up': 'bg-red-100 text-red-800',
      'voicemail': 'bg-orange-100 text-orange-800',
      'no_response': 'bg-gray-100 text-gray-800',
      'lead': 'bg-blue-100 text-blue-800',
      'appointment': 'bg-purple-100 text-purple-800'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sales Timeline</h2>
              <p className="text-sm text-gray-600 mt-1">Sale ID: {saleId}</p>
              {timelineData.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {timelineData.length} action{timelineData.length !== 1 ? 's' : ''} recorded
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-2 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Timeline Summary */}
          {timelineData.length > 0 && (
            <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Timeline Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-md p-3 border border-gray-200">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-gray-900">Total Actions</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 mt-1">{timelineData.length}</div>
                </div>
                
                <div className="bg-white rounded-md p-3 border border-gray-200">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-gray-900">Current Status</span>
                  </div>
                  <div className="text-lg font-semibold text-green-600 mt-1">
                    {timelineData[0]?.status || 'Unknown'}
                  </div>
                </div>
                
                <div className="bg-white rounded-md p-3 border border-gray-200">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-medium text-gray-900">Last Agent</span>
                  </div>
                  <div className="text-sm font-medium text-purple-600 mt-1">
                    {timelineData[0]?.agent ? 
                      `${timelineData[0].agent.firstName} ${timelineData[0].agent.lastName}` : 
                      'Unknown'
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="ml-3 text-gray-600">Loading timeline...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-2">⚠️</div>
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchTimelineData}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                Retry
              </button>
            </div>
          ) : timelineData.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">📝</div>
              <p className="text-gray-600">No timeline data available for this sale.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {timelineData.map((log, index) => {
                const { date, time } = formatTimestamp(log.timestamp);
                return (
                  <div key={log.id} className="flex items-start space-x-4">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg">
                        {getActionIcon(log.action)}
                      </div>
                      {index < timelineData.length - 1 && (
                        <div className="w-0.5 h-8 bg-gray-200 mt-2"></div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-200">
                        {/* Header with action and status */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">{getActionIcon(log.action)}</span>
                              <div>
                                <span className="font-semibold text-gray-900 capitalize">
                                  {log.action.replace('_', ' ')}
                                </span>
                                <p className="text-xs text-gray-500">{getActionDescription(log.action)}</p>
                              </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(log.status)}`}>
                              {log.status}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">{date}</div>
                            <div className="text-xs text-gray-500">{time}</div>
                          </div>
                        </div>

                        {/* Agent Information */}
                        {log.agent && (
                          <div className="bg-white rounded-md p-3 mb-3 border border-gray-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span className="font-medium text-gray-900">Agent Information</span>
                            </div>
                            <div className="text-sm text-gray-700">
                              <span className="font-medium">{log.agent.firstName} {log.agent.lastName}</span>
                              {log.agent.email && (
                                <span className="text-gray-500 ml-2">({log.agent.email})</span>
                              )}
                            </div>
                          </div>
                        )}


                        {/* Sale Information */}
                        {log.sale && (
                          <div className="bg-white rounded-md p-3 mb-3 border border-gray-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="font-medium text-gray-900">Sale Information</span>
                            </div>
                            <div className="text-sm text-gray-700">
                              <div><span className="font-medium">Sale ID:</span> {log.sale.id}</div>
                              <div><span className="font-medium">Status:</span> 
                                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.sale.status)}`}>
                                  {log.sale.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Breakdown */}
                        {log.breakdown && (
                          <div className="bg-white rounded-md p-3 mb-3 border border-gray-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <span className="font-medium text-gray-900">Breakdown</span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{log.breakdown}</div>
                          </div>
                        )}

                        {/* Notes */}
                        {log.note && (
                          <div className="bg-white rounded-md p-3 mb-3 border border-gray-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span className="font-medium text-gray-900">Notes</span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{log.note}</div>
                          </div>
                        )}

                        {/* Appointment Information */}
                        {log.appointmentDateTime && (
                          <div className="bg-white rounded-md p-3 mb-3 border border-gray-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="font-medium text-gray-900">Appointment</span>
                            </div>
                            <div className="text-sm text-gray-700">
                              <div><span className="font-medium">Date:</span> {new Date(log.appointmentDateTime).toLocaleDateString()}</div>
                              <div><span className="font-medium">Time:</span> {new Date(log.appointmentDateTime).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        )}

                        {/* Current Sale Data - Only show if there are meaningful changes */}
                        {log.currentSaleData && hasSignificantChanges(log.currentSaleData, index < timelineData.length - 1 ? timelineData[index + 1].currentSaleData : null) && (
                          <div className="bg-blue-50 rounded-md p-3 border border-blue-200">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium text-gray-900">Sale Data Changes</span>
                            </div>
                            <div className="text-xs text-gray-600 max-h-32 overflow-y-auto">
                              <pre className="whitespace-pre-wrap">{JSON.stringify(log.currentSaleData, null, 2)}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
