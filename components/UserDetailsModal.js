'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';

export default function UserDetailsModal({ user, onClose }) {
  const [activeTab, setActiveTab] = useState('activities');
  const [activities, setActivities] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [sales, setSales] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  
  // Pagination states
  const [activitiesPagination, setActivitiesPagination] = useState({
    offset: 0,
    limit: 50,
    total: 0,
    hasMore: false
  });
  
  const [timeLogsPagination, setTimeLogsPagination] = useState({
    offset: 0,
    limit: 30,
    total: 0,
    hasMore: false
  });

  const [salesPagination, setSalesPagination] = useState({
    offset: 0,
    limit: 50,
    total: 0,
    hasMore: false
  });

  const [callLogsPagination, setCallLogsPagination] = useState({
    offset: 0,
    limit: 50,
    total: 0,
    hasMore: false
  });

  // Track if sales and call logs have been loaded
  const [salesLoaded, setSalesLoaded] = useState(false);
  const [callLogsLoaded, setCallLogsLoaded] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user, dateRange, activitiesPagination.offset, timeLogsPagination.offset]);

  useEffect(() => {
    if (user && activeTab === 'sales') {
      fetchSales();
    }
  }, [user, dateRange, salesPagination.offset, activeTab]);

  useEffect(() => {
    if (user && activeTab === 'callLogs') {
      fetchCallLogs();
    }
  }, [user, dateRange, callLogsPagination.offset, activeTab]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch activities and time logs with pagination
      const response = await apiClient.get(
        `/api/users/${user.id}/activities?` +
        `limit=${activitiesPagination.limit}&offset=${activitiesPagination.offset}&` +
        `timeLogLimit=${timeLogsPagination.limit}&timeLogOffset=${timeLogsPagination.offset}&` +
        `startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      
      const data = await response.json();
      
      if (data.success) {
        setActivities(data.activities || []);
        setTimeLogs(data.timeLogs || []);
        
        // Update pagination info
        if (data.pagination) {
          if (data.pagination.activities) {
            setActivitiesPagination(prev => ({
              ...prev,
              total: data.pagination.activities.total,
              hasMore: data.pagination.activities.hasMore
            }));
          }
          if (data.pagination.timeLogs) {
            setTimeLogsPagination(prev => ({
              ...prev,
              total: data.pagination.timeLogs.total,
              hasMore: data.pagination.timeLogs.hasMore
            }));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivitiesPageChange = (direction) => {
    setActivitiesPagination(prev => {
      const newOffset = direction === 'next' 
        ? prev.offset + prev.limit 
        : Math.max(0, prev.offset - prev.limit);
      return { ...prev, offset: newOffset };
    });
  };

  const handleTimeLogsPageChange = (direction) => {
    setTimeLogsPagination(prev => {
      const newOffset = direction === 'next' 
        ? prev.offset + prev.limit 
        : Math.max(0, prev.offset - prev.limit);
      return { ...prev, offset: newOffset };
    });
  };

  const handleSalesPageChange = (direction) => {
    setSalesPagination(prev => {
      const newOffset = direction === 'next' 
        ? prev.offset + prev.limit 
        : Math.max(0, prev.offset - prev.limit);
      return { ...prev, offset: newOffset };
    });
  };

  const handleCallLogsPageChange = (direction) => {
    setCallLogsPagination(prev => {
      const newOffset = direction === 'next' 
        ? prev.offset + prev.limit 
        : Math.max(0, prev.offset - prev.limit);
      return { ...prev, offset: newOffset };
    });
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      setSalesLoaded(true);
      
      const response = await apiClient.get(
        `/api/users/${user.id}/sales?` +
        `limit=${salesPagination.limit}&offset=${salesPagination.offset}&` +
        `startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      
      const data = await response.json();
      
      if (data.success) {
        setSales(data.sales || []);
        
        if (data.pagination) {
          setSalesPagination(prev => ({
            ...prev,
            total: data.pagination.total,
            hasMore: data.pagination.hasMore
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCallLogs = async () => {
    try {
      setLoading(true);
      setCallLogsLoaded(true);
      
      const response = await apiClient.get(
        `/api/users/${user.id}/call-logs?` +
        `limit=${callLogsPagination.limit}&offset=${callLogsPagination.offset}&` +
        `startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      
      const data = await response.json();
      
      if (data.success) {
        setCallLogs(data.callLogs || []);
        
        if (data.pagination) {
          setCallLogsPagination(prev => ({
            ...prev,
            total: data.pagination.total,
            hasMore: data.pagination.hasMore
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching call logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = () => {
    // Reset pagination when date range changes
    setActivitiesPagination(prev => ({ ...prev, offset: 0 }));
    setTimeLogsPagination(prev => ({ ...prev, offset: 0 }));
    setSalesPagination(prev => ({ ...prev, offset: 0 }));
    setCallLogsPagination(prev => ({ ...prev, offset: 0 }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      online: { bg: 'bg-green-100', text: 'text-green-800', label: 'Online' },
      offline: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Offline' },
      away: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Away' }
    };
    
    const config = statusConfig[status] || statusConfig.offline;
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getActivityTypeLabel = (type) => {
    const labels = {
      login: 'Login',
      logout: 'Logout',
      status_change: 'Status Change',
      worked_on_sale: 'Worked on Sale',
      worked_on_call: 'Worked on Call',
      attendance: 'Attendance',
      other: 'Other'
    };
    return labels[type] || type;
  };


  if (!user) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {user.first_name} {user.last_name}
            </h2>
            <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600">
              <span>{user.email}</span>
              <span>•</span>
              <span>{user.role_display || user.role}</span>
              <span>•</span>
              {getStatusBadge(user.status)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Date Range Filter */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Date Range:</label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => {
              setDateRange({ ...dateRange, startDate: e.target.value });
              handleDateRangeChange();
            }}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => {
              setDateRange({ ...dateRange, endDate: e.target.value });
              handleDateRangeChange();
            }}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          />
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <nav className="flex space-x-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('activities')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'activities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activities ({activitiesPagination.total > 0 ? activitiesPagination.total : activities.length})
            </button>
            <button
              onClick={() => setActiveTab('timeLogs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'timeLogs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Time Logs ({timeLogsPagination.total > 0 ? timeLogsPagination.total : timeLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'sales'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Sales Logs{activeTab === 'sales' && salesLoaded ? ` (${salesPagination.total})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('callLogs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'callLogs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Call Logs{activeTab === 'callLogs' && callLogsLoaded ? ` (${callLogsPagination.total})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              User Info
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Activities Tab */}
              {activeTab === 'activities' && (
                <div className="space-y-4">
                  {activities.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No activities found</p>
                  ) : (
                    <div className="space-y-2">
                      {activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900">
                                  {getActivityTypeLabel(activity.activityType)}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {formatDate(activity.createdAt)}
                                </span>
                              </div>
                              {activity.activityDescription && (
                                <p className="text-sm text-gray-600 mt-1">
                                  {activity.activityDescription}
                                </p>
                              )}
                              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                    Show details
                                  </summary>
                                  <pre className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-auto">
                                    {JSON.stringify(activity.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                            <div className="flex flex-col items-end space-y-1">
                              {activity.ipAddress && (
                                <span className="text-xs text-gray-400">{activity.ipAddress}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Activities Pagination */}
                  {activitiesPagination.total > activitiesPagination.limit && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Showing {activitiesPagination.offset + 1} to {Math.min(activitiesPagination.offset + activitiesPagination.limit, activitiesPagination.total)} of {activitiesPagination.total} activities
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleActivitiesPageChange('prev')}
                          disabled={activitiesPagination.offset === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleActivitiesPageChange('next')}
                          disabled={!activitiesPagination.hasMore}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Time Logs Tab */}
              {activeTab === 'timeLogs' && (
                <div className="space-y-4">
                  {timeLogs.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No time logs found</p>
                  ) : (
                    <div className="space-y-3">
                      {timeLogs.map((log, index) => (
                        <div
                          key={index}
                          className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Date</p>
                              <p className="font-medium">{log.date || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Active Time</p>
                              <p className="font-medium text-green-600">
                                {log.activeTimeFormatted || '0m'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Inactive Time</p>
                              <p className="font-medium text-gray-600">
                                {log.inactiveTimeFormatted || '0m'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Login Count</p>
                              <p className="font-medium">{log.loginCount || 0}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-gray-500">
                            {log.firstActiveTime && (
                              <div>
                                <span className="font-medium">First Active:</span>{' '}
                                {formatDate(log.firstActiveTime)}
                              </div>
                            )}
                            {log.lastActiveTime && (
                              <div>
                                <span className="font-medium">Last Active:</span>{' '}
                                {formatDate(log.lastActiveTime)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Time Logs Pagination */}
                  {timeLogsPagination.total > timeLogsPagination.limit && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Showing {timeLogsPagination.offset + 1} to {Math.min(timeLogsPagination.offset + timeLogsPagination.limit, timeLogsPagination.total)} of {timeLogsPagination.total} time logs
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleTimeLogsPageChange('prev')}
                          disabled={timeLogsPagination.offset === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleTimeLogsPageChange('next')}
                          disabled={!timeLogsPagination.hasMore}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sales Logs Tab */}
              {activeTab === 'sales' && (
                <div className="space-y-4">
                  {sales.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No sales logs found</p>
                  ) : (
                    <div className="space-y-2">
                      {sales.map((log) => (
                        <div
                          key={log.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <span className="font-medium text-gray-900">
                                  {log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  log.status === 'sale-done' || log.status === 'done' || log.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  log.status === 'lead-call' || log.status === 'lead_call' ? 'bg-blue-100 text-blue-800' :
                                  log.status === 'decline' || log.status === 'chargeback' || log.action === 'hangup' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.status}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {formatDate(log.timestamp || log.createdAt)}
                                </span>
                              </div>
                              {log.customer && (
                                <p className="text-sm text-gray-600 mt-1">
                                  <span className="font-medium">Customer:</span> {log.customer.firstName} {log.customer.lastName}
                                  {log.customer.phone && ` • ${log.customer.phone}`}
                                </p>
                              )}
                              {log.sale && (
                                <div className="mt-1 text-xs text-gray-500">
                                  <span className="font-medium">Sale #{log.sale.id}:</span> {log.sale.status}
                                  {log.sale.carrier && ` • Carrier: ${log.sale.carrier}`}
                                  {log.sale.basicPackage && ` • Package: ${log.sale.basicPackage}`}
                                </div>
                              )}
                              {log.note && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-500">Note:</p>
                                  <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                                    {log.note}
                                  </p>
                                </div>
                              )}
                              {log.breakdown && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-500">Breakdown:</p>
                                  <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                                    {log.breakdown}
                                  </p>
                                </div>
                              )}
                              {log.appointmentDatetime && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <span className="font-medium">Appointment:</span> {formatDate(log.appointmentDatetime)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Sales Pagination */}
                  {salesPagination.total > salesPagination.limit && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Showing {salesPagination.offset + 1} to {Math.min(salesPagination.offset + salesPagination.limit, salesPagination.total)} of {salesPagination.total} sales logs
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSalesPageChange('prev')}
                          disabled={salesPagination.offset === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleSalesPageChange('next')}
                          disabled={!salesPagination.hasMore}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Call Logs Tab */}
              {activeTab === 'callLogs' && (
                <div className="space-y-4">
                  {callLogs.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No call logs found</p>
                  ) : (
                    <div className="space-y-2">
                      {callLogs.map((callLog) => (
                        <div
                          key={callLog.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  callLog.direction === 'inbound' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {callLog.direction}
                                </span>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  callLog.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  callLog.status === 'failed' || callLog.status === 'canceled' ? 'bg-red-100 text-red-800' :
                                  callLog.status === 'no-answer' || callLog.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {callLog.status}
                                </span>
                                {callLog.callPurpose && (
                                  <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                                    {callLog.callPurpose}
                                  </span>
                                )}
                                <span className="text-sm text-gray-500">
                                  {formatDate(callLog.createdAt)}
                                </span>
                              </div>
                              <div className="mt-2 text-sm text-gray-600">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">From:</span>
                                  <span>{callLog.fromNumber}</span>
                                  <span className="text-gray-400">→</span>
                                  <span className="font-medium">To:</span>
                                  <span>{callLog.toNumber}</span>
                                </div>
                              </div>
                              {callLog.customer && (
                                <p className="text-sm text-gray-600 mt-1">
                                  <span className="font-medium">Customer:</span> {callLog.customer.firstName} {callLog.customer.lastName}
                                  {callLog.customer.phone && ` • ${callLog.customer.phone}`}
                                </p>
                              )}
                              {callLog.duration !== null && (
                                <p className="text-xs text-gray-500 mt-1">
                                  <span className="font-medium">Duration:</span> {Math.floor(callLog.duration / 60)}m {callLog.duration % 60}s
                                </p>
                              )}
                              {callLog.callNotes && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-500">Notes:</p>
                                  <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                                    {callLog.callNotes}
                                  </p>
                                </div>
                              )}
                              {callLog.recordingUrl && (
                                <div className="mt-2">
                                  <a
                                    href={callLog.recordingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                                  >
                                    🎵 Listen to Recording
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Call Logs Pagination */}
                  {callLogsPagination.total > callLogsPagination.limit && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Showing {callLogsPagination.offset + 1} to {Math.min(callLogsPagination.offset + callLogsPagination.limit, callLogsPagination.total)} of {callLogsPagination.total} call logs
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleCallLogsPageChange('prev')}
                          disabled={callLogsPagination.offset === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleCallLogsPageChange('next')}
                          disabled={!callLogsPagination.hasMore}
                          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Info Tab */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Last Login</p>
                      <p className="font-medium">
                        {user.last_login_time ? formatDate(user.last_login_time) : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Last Logout</p>
                      <p className="font-medium">
                        {user.last_logout_time ? formatDate(user.last_logout_time) : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Account Status</p>
                      <p>
                        {user.is_active ? (
                          <span className="text-green-600 font-medium">Active</span>
                        ) : (
                          <span className="text-red-600 font-medium">Inactive</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Current Status</p>
                      {getStatusBadge(user.status)}
                    </div>
                    {user.phone && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Phone</p>
                        <p className="font-medium">{user.phone}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Created</p>
                      <p className="font-medium">{formatDate(user.created_at)}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

