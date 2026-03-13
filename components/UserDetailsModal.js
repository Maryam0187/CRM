'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin, isSupervisor } from '../lib/roleUtils';
import RecordingPlayer from './RecordingPlayer';
import { getStatusBadgeClasses } from '../lib/salesStatuses';
import StateSelector from './StateSelector';

export default function UserDetailsModal({ user, onClose }) {
  const { user: currentUser } = useAuth();
  const { socket, isConnected } = useSocket();
  const canViewRecordings =
    isAdmin(currentUser) ||
    user?.id === currentUser?.id ||
    (isSupervisor(currentUser) && currentUser.supervisedAgents?.some((a) => a.id === user?.id));
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
  
  // Call logs view mode and filters (admin only)
  const [callLogsViewMode, setCallLogsViewMode] = useState('list'); // 'list' | 'table'
  const [callLogsFilters, setCallLogsFilters] = useState({
    state: '',
    city: '',
    phone: '',
    status: '',
    notes: '',
    purpose: '',
    source: ''
  });
  const [appliedCallLogsFilters, setAppliedCallLogsFilters] = useState({
    state: '',
    city: '',
    phone: '',
    status: '',
    notes: '',
    purpose: '',
    source: ''
  });
  
  // State for displaying current user status and permission
  const [displayedUser, setDisplayedUser] = useState(user);
  
  // State for note modal
  const [noteModalContent, setNoteModalContent] = useState(null);

  // Helper to truncate notes to 5-6 words
  const NOTE_WORD_LIMIT = 6;
  const trimNote = (text) => {
    if (!text || !String(text).trim()) return null;
    const s = String(text).trim();
    const words = s.split(/\s+/);
    if (words.length <= NOTE_WORD_LIMIT) return s;
    return words.slice(0, NOTE_WORD_LIMIT).join(' ') + '...';
  };

  // Function to fetch fresh user information
  const fetchFreshUserInfo = useCallback(async () => {
    if (!user || !user.id) return;
    
    try {
      const response = await apiClient.get(`/api/users/${user.id}`);
      const data = await response.json();
      
      if (data.success && data.user) {
        // Update displayed user with fresh data (including location and permission)
        setDisplayedUser(data.user);
        console.log('✅ Fresh user data fetched:', {
          userId: data.user.id,
          status: data.user.status,
          location_permission: data.user.location_permission,
          hasLocation: !!(data.user.latitude && data.user.longitude)
        });
      }
    } catch (error) {
      console.error('Error fetching fresh user info:', error);
    }
  }, [user]);

  // Update displayed user when prop changes and fetch fresh data
  useEffect(() => {
    setDisplayedUser(user);
    // Fetch fresh user data when modal opens
    if (user && user.id) {
      fetchFreshUserInfo();
    }
  }, [user, fetchFreshUserInfo]);

  // Listen for real-time status updates via socket
  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const handleStatusChange = (data) => {
      // Only update if this status change is for the displayed user
      if (data.userId === user.id) {
        // Fetch fresh user data to get all updated fields
        fetchFreshUserInfo();
      }
    };

    const handlePermissionChange = (data) => {
      // Only update if this permission change is for the displayed user
      if (data.userId === user.id) {
        // Fetch fresh user data to get all updated fields including location
        fetchFreshUserInfo();
      }
    };

    const handleLocationChange = (data) => {
      // Only update if this location change is for the displayed user
      if (data.userId === user.id) {
        // Fetch fresh user data to get updated location
        fetchFreshUserInfo();
      }
    };

    socket.on('user_status_change', handleStatusChange);
    socket.on('user_location_permission_changed', handlePermissionChange);
    socket.on('user_location_changed', handleLocationChange);

    return () => {
      socket.off('user_status_change', handleStatusChange);
      socket.off('user_location_permission_changed', handlePermissionChange);
      socket.off('user_location_changed', handleLocationChange);
    };
  }, [socket, isConnected, user, fetchFreshUserInfo]);

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
  }, [user, dateRange, callLogsPagination.offset, activeTab, appliedCallLogsFilters]);


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
      
      const params = new URLSearchParams();
      params.append('limit', callLogsPagination.limit);
      params.append('offset', callLogsPagination.offset);
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
      if (appliedCallLogsFilters.state.trim()) params.append('state', appliedCallLogsFilters.state.trim());
      if (appliedCallLogsFilters.city.trim()) params.append('city', appliedCallLogsFilters.city.trim());
      if (appliedCallLogsFilters.phone.trim()) params.append('phone', appliedCallLogsFilters.phone.trim());
      if (appliedCallLogsFilters.status.trim()) params.append('status', appliedCallLogsFilters.status.trim());
      if (appliedCallLogsFilters.notes.trim()) params.append('notes', appliedCallLogsFilters.notes.trim());
      if (appliedCallLogsFilters.purpose.trim()) params.append('purpose', appliedCallLogsFilters.purpose.trim());
      if (appliedCallLogsFilters.source.trim()) params.append('source', appliedCallLogsFilters.source.trim());
      
      const response = await apiClient.get(`/api/users/${user.id}/call-logs?${params}`);
      
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
  
  const handleApplyCallLogsFilters = () => {
    setAppliedCallLogsFilters({ ...callLogsFilters });
    setCallLogsPagination(prev => ({ ...prev, offset: 0 }));
  };
  
  const handleClearCallLogsFilters = () => {
    const emptyFilters = { state: '', city: '', phone: '', status: '', notes: '', purpose: '', source: '' };
    setCallLogsFilters(emptyFilters);
    setAppliedCallLogsFilters(emptyFilters);
    setCallLogsPagination(prev => ({ ...prev, offset: 0 }));
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

  const getLocationPermissionBadge = (permission) => {
    const config = {
      granted: { bg: 'bg-green-100', text: 'text-green-800', label: 'Granted' },
      denied: { bg: 'bg-red-100', text: 'text-red-800', label: 'Denied' },
      prompt: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Prompt' },
      not_set: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Not Set' }
    };
    
    const statusConfig = config[permission] || config.not_set;
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
        {statusConfig.label}
      </span>
    );
  };


  if (!user) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[min(90vh,calc(100vh-2rem))] flex flex-col my-auto">
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
              {getStatusBadge(displayedUser.status || user.status)}
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
                              {activity.metadata && activity.metadata.location && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <div className="flex items-start">
                                    <svg className="w-4 h-4 mr-1 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-xs text-gray-500">
                                      {Number(activity.metadata.location.latitude)?.toFixed(4)}, {Number(activity.metadata.location.longitude)?.toFixed(4)}
                                      {activity.metadata.location.accuracy && ` (±${activity.metadata.location.accuracy}m)`}
                                    </span>
                                  </div>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${Number(activity.metadata.location.latitude)},${Number(activity.metadata.location.longitude)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    View on Map
                                  </a>
                                </div>
                              )}
                              {activity.metadata && Object.keys(activity.metadata).length > 0 && 
                               !activity.metadata.location && 
                               !(activity.metadata.oldStatus && activity.metadata.newStatus) && (
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
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(
                                  log.action === 'hangup' ? 'hang-up' : (log.status || '').replace(/_/g, '-')
                                )}`}>
                                  {log.status}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {formatDate(log.timestamp || log.createdAt)}
                                </span>
                              </div>
                              {log.customer && (
                                <p className="text-sm text-gray-600 mt-1">
                                  <span className="font-medium">Customer:</span> {`${log.customer.firstName || ''} ${log.customer.lastName || ''}`.trim() || 'N/A'}
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
                                  {trimNote(log.note) !== log.note ? (
                                    <button
                                      type="button"
                                      onClick={() => setNoteModalContent(log.note)}
                                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1 bg-gray-50 p-2 rounded text-left w-full cursor-pointer"
                                      title="Click to see full note"
                                    >
                                      {trimNote(log.note)}
                                    </button>
                                  ) : (
                                    <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                                      {log.note}
                                    </p>
                                  )}
                                </div>
                              )}
                              {log.breakdown && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-500">Breakdown:</p>
                                  {trimNote(log.breakdown) !== log.breakdown ? (
                                    <button
                                      type="button"
                                      onClick={() => setNoteModalContent(log.breakdown)}
                                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1 bg-gray-50 p-2 rounded text-left w-full cursor-pointer"
                                      title="Click to see full breakdown"
                                    >
                                      {trimNote(log.breakdown)}
                                    </button>
                                  ) : (
                                    <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                                      {log.breakdown}
                                    </p>
                                  )}
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
                  {/* Filters and View Toggle (Admin only) */}
                  {isAdmin(currentUser) && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Filters</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">View:</span>
                          <button
                            onClick={() => setCallLogsViewMode('list')}
                            className={`px-2 py-1 text-xs rounded ${callLogsViewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                          >
                            List
                          </button>
                          <button
                            onClick={() => setCallLogsViewMode('table')}
                            className={`px-2 py-1 text-xs rounded ${callLogsViewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                          >
                            Table
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
                        <div className="[&_select]:h-8 [&_select]:py-0 [&_select]:px-2 [&_select]:text-xs [&_label]:hidden [&>div]:mb-0">
                          <StateSelector
                            value={callLogsFilters.state}
                            onChange={(e) => setCallLogsFilters(prev => ({ ...prev, state: e.target.value }))}
                            label=""
                            showTimezone={false}
                            className="w-full"
                          />
                        </div>
                        <input
                          type="text"
                          value={callLogsFilters.city}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <input
                          type="text"
                          value={callLogsFilters.phone}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Phone"
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <select
                          value={callLogsFilters.status}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, status: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Status</option>
                          <option value="completed">Completed</option>
                          <option value="no-answer">No Answer</option>
                          <option value="busy">Busy</option>
                          <option value="failed">Failed</option>
                          <option value="canceled">Canceled</option>
                        </select>
                        <select
                          value={callLogsFilters.purpose}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, purpose: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Purpose</option>
                          <option value="cold_call">Cold Call</option>
                          <option value="follow_up">Follow Up</option>
                          <option value="sales">Sales</option>
                          <option value="support">Support</option>
                          <option value="appointment">Appointment</option>
                          <option value="other">Other</option>
                        </select>
                        <select
                          value={callLogsFilters.source}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, source: e.target.value }))}
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Source</option>
                          <option value="lead_dialing">Lead Dialing</option>
                          <option value="quick_dialing">Quick Dialing</option>
                          <option value="call_history">Call History</option>
                          <option value="sale_page">Sale Page</option>
                        </select>
                        <input
                          type="text"
                          value={callLogsFilters.notes}
                          onChange={(e) => setCallLogsFilters(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Notes"
                          className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleApplyCallLogsFilters}
                          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Apply
                        </button>
                        <button
                          onClick={handleClearCallLogsFilters}
                          className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {callLogs.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No call logs found</p>
                  ) : callLogsViewMode === 'table' && isAdmin(currentUser) ? (
                    /* Table View */
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {callLogs.map((callLog) => (
                            <tr key={callLog.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  callLog.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  callLog.status === 'failed' || callLog.status === 'canceled' ? 'bg-red-100 text-red-800' :
                                  callLog.status === 'no-answer' || callLog.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {callLog.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {callLog.callSource && (
                                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                                    callLog.callSource === 'lead_dialing' ? 'bg-blue-100 text-blue-800' :
                                    callLog.callSource === 'quick_dialing' ? 'bg-cyan-100 text-cyan-800' :
                                    callLog.callSource === 'call_history' ? 'bg-orange-100 text-orange-800' :
                                    callLog.callSource === 'sale_page' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {callLog.callSource.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{callLog.state || '—'}</td>
                              <td className="px-3 py-2 text-gray-600">{callLog.city || '—'}</td>
                              <td className="px-3 py-2 font-mono text-gray-900">{callLog.toNumber || '—'}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {callLog.customerName || (callLog.customer ? `${callLog.customer.firstName || ''} ${callLog.customer.lastName || ''}`.trim() : '—') || '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(callLog.createdAt)}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {callLog.duration != null ? `${Math.floor(callLog.duration / 60)}:${(callLog.duration % 60).toString().padStart(2, '0')}` : '—'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {callLog.callPurpose && (
                                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full">
                                    {callLog.callPurpose.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={callLog.callNotes || ''}>
                                {callLog.callNotes || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* List View */
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
                                {callLog.callSource && (
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    callLog.callSource === 'lead_dialing' ? 'bg-blue-100 text-blue-800' :
                                    callLog.callSource === 'quick_dialing' ? 'bg-cyan-100 text-cyan-800' :
                                    callLog.callSource === 'call_history' ? 'bg-orange-100 text-orange-800' :
                                    callLog.callSource === 'sale_page' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {callLog.callSource.replace(/_/g, ' ')}
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
                              {(callLog.state || callLog.city) && (
                                <p className="text-sm text-gray-600 mt-1">
                                  {callLog.state && <span><span className="font-medium">State:</span> {callLog.state}</span>}
                                  {callLog.state && callLog.city && ' • '}
                                  {callLog.city && <span><span className="font-medium">City:</span> {callLog.city}</span>}
                                </p>
                              )}
                              {(callLog.customerName || callLog.customer) && (
                                <p className="text-sm text-gray-600 mt-1">
                                  <span className="font-medium">Customer:</span> {callLog.customerName || `${callLog.customer?.firstName || ''} ${callLog.customer?.lastName || ''}`.trim() || 'N/A'}
                                  {callLog.customer?.phone && ` • ${callLog.customer.phone}`}
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
                              {canViewRecordings && ((callLog.recordings && callLog.recordings.length > 0) || callLog.recordingUrl) && (
                                <div className="mt-2">
                                  <span className="text-xs font-medium text-gray-500 block mb-1">
                                    {(callLog.recordings?.length || 1) > 1 ? 'Recordings:' : 'Recording:'}
                                  </span>
                                  {callLog.recordings && callLog.recordings.length > 0 ? (
                                    <div className="space-y-2">
                                      {callLog.recordings.map((rec, idx) => (
                                        <div key={rec.recordingSid || idx}>
                                          {callLog.recordings.length > 1 && (
                                            <span className="text-xs text-gray-500 block mb-1">
                                              Recording {idx + 1}
                                              {rec.recordingDuration ? ` (${Math.floor(rec.recordingDuration / 60)}m ${rec.recordingDuration % 60}s)` : ''}
                                            </span>
                                          )}
                                          <RecordingPlayer
                                            callLogId={callLog.id}
                                            index={idx}
                                            recordingDuration={rec.recordingDuration}
                                            className="max-w-md"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <RecordingPlayer callLogId={callLog.id} index={0} className="max-w-md" />
                                  )}
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
                      <p className="text-sm text-gray-500 mb-1">Last seen</p>
                      <p className="font-medium">
                        {user.last_seen_at ? formatDate(user.last_seen_at) : '—'}
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
                      {getStatusBadge(displayedUser.status)}
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
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Location Permission</p>
                      {getLocationPermissionBadge(displayedUser.location_permission)}
                    </div>
                  </div>

                  {(user.additional_info || (displayedUser && displayedUser.additional_info)) && (
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <p className="text-sm text-gray-500 mb-1">Additional Info</p>
                      <p className="font-medium text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                        {user.additional_info || (displayedUser && displayedUser.additional_info) || '—'}
                      </p>
                    </div>
                  )}

                  {/* Location Information */}
                  {user.latitude && user.longitude && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Location Information
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Latitude</p>
                          <p className="font-medium font-mono">{Number(user.latitude)?.toFixed(6)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Longitude</p>
                          <p className="font-medium font-mono">{Number(user.longitude)?.toFixed(6)}</p>
                        </div>
                        {user.location_accuracy && (
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Accuracy</p>
                            <p className="font-medium">{user.location_accuracy}m radius</p>
                          </div>
                        )}
                        {user.location_timestamp && (
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Last Updated</p>
                            <p className="font-medium">{formatDate(user.location_timestamp)}</p>
                          </div>
                        )}
                      </div>
                      {user.latitude && user.longitude && (
                        <div className="mt-4">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${Number(user.latitude)},${Number(user.longitude)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View on Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Note full-text modal */}
      {noteModalContent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setNoteModalContent(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Note</h3>
              <button
                type="button"
                onClick={() => setNoteModalContent(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words">
              {noteModalContent}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

