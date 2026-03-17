'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { useSocket } from '../../../contexts/SocketContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminRoute from '../../../components/AdminRoute';
import UserForm from '../../../components/UserForm';
import UserDetailsModal from '../../../components/UserDetailsModal';
import ConfirmModal from '../../../components/ConfirmModal';
import { apiClient } from '../../../lib/apiClient';

const COLUMNS_STORAGE_KEY = 'crm-user-mgmt-columns';

const DEFAULT_COLUMNS = [
  { id: 'user', label: 'User', key: 'user', visible: true },
  { id: 'email', label: 'Email', key: 'email', visible: true },
  { id: 'role', label: 'Role', key: 'role', visible: true },
  { id: 'extension', label: 'Extension', key: 'extension', visible: true },
  { id: 'supervisor', label: 'Supervisor', key: 'supervisor', visible: true },
  { id: 'account_status', label: 'Account Status', key: 'account_status', visible: true },
  { id: 'online_status', label: 'Online Status', key: 'online_status', visible: true },
  { id: 'last_seen', label: 'Last seen', key: 'last_seen', visible: true },
  { id: 'created', label: 'Created', key: 'created', visible: true },
  { id: 'actions', label: 'Actions', key: 'actions', visible: true },
];

function loadColumnConfig() {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const ids = parsed.order || DEFAULT_COLUMNS.map(c => c.id);
      const visibility = parsed.visibility || {};
      return ids.map(id => {
        const def = DEFAULT_COLUMNS.find(c => c.id === id) || { id, label: id, key: id, visible: true };
        return { ...def, visible: visibility[id] !== undefined ? visibility[id] : def.visible };
      }).concat(DEFAULT_COLUMNS.filter(c => !ids.includes(c.id)).map(c => ({ ...c, visible: visibility[c.id] !== undefined ? visibility[c.id] : c.visible })));
    }
  } catch (_) {}
  return [...DEFAULT_COLUMNS];
}

function saveColumnConfig(columns) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify({
      order: columns.map(c => c.id),
      visibility: columns.reduce((acc, c) => ({ ...acc, [c.id]: c.visible }), {}),
    }));
  } catch (_) {}
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, userId: null, userName: null });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [columnConfig, setColumnConfig] = useState([]);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    setColumnConfig(loadColumnConfig());
  }, []);

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user]);

  // Listen for real-time status updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusChange = (data) => {
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === data.userId 
            ? { ...u, status: data.status }
            : u
        )
      );
    };

    socket.on('user_status_change', handleStatusChange);

    return () => {
      socket.off('user_status_change', handleStatusChange);
    };
  }, [socket, isConnected]);

  const fetchUsers = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.get('/api/users');
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err) {
      setError('Failed to fetch users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowUserForm(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowUserForm(true);
  };

  const handleUserFormClose = () => {
    setShowUserForm(false);
    setEditingUser(null);
    fetchUsers(); // Refresh the users list
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      const response = await apiClient.put(`/api/users/${userId}`, {
        is_active: !currentStatus
      });

      const data = await response.json();
      
      if (data.success) {
        showSuccess(data.message || `User ${currentStatus ? 'deactivated' : 'activated'} successfully`);
        fetchUsers(); // Refresh the users list
      } else {
        showError(data.error || 'Failed to update user status');
      }
    } catch (err) {
      showError('Failed to update user status');
      console.error('Error updating user status:', err);
    }
  };

  const handleToggleTwilio = async (userId, currentStatus) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      const response = await apiClient.put(`/api/users/${userId}`, {
        twilio_enabled: !currentStatus
      });

      const data = await response.json();
      
      if (data.success) {
        showSuccess(`Twilio ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
        fetchUsers(); // Refresh the users list
      } else {
        showError(data.error || 'Failed to update Twilio status');
      }
    } catch (err) {
      showError('Failed to update Twilio status');
      console.error('Error updating Twilio status:', err);
    }
  };

  const handleForceLogoutClick = (userId, userName) => {
    setConfirmModal({
      isOpen: true,
      userId,
      userName
    });
  };

  const handleForceLogoutConfirm = async () => {
    if (!user) {
      setError('User not authenticated');
      setConfirmModal({ isOpen: false, userId: null, userName: null });
      return;
    }

    const { userId, userName } = confirmModal;
    setIsLoggingOut(true);

    try {
      const response = await apiClient.post(`/api/admin/users/${userId}/logout`, {
        reason: 'admin_action'
      });

      const data = await response.json();
      
      if (data.success) {
        showSuccess(data.message || `User ${userName} has been logged out successfully.`);
        fetchUsers(); // Refresh the users list
        setConfirmModal({ isOpen: false, userId: null, userName: null });
      } else {
        showError(data.error || 'Failed to force logout user');
      }
    } catch (err) {
      showError('Failed to force logout user');
      console.error('Error force logging out user:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleForceLogoutCancel = () => {
    setConfirmModal({ isOpen: false, userId: null, userName: null });
  };

  const visibleColumns = columnConfig.filter(c => c.visible);

  // Sort users: online first, then away, then offline; within same status sort by last seen (most recent first), then by name
  const statusOrder = { online: 0, away: 1, offline: 2 };
  const sortedUsers = [...users].sort((a, b) => {
    const aOrder = statusOrder[a.status] ?? 2;
    const bOrder = statusOrder[b.status] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Within same status (e.g. offline): sort by last_seen_at descending (most recently seen first)
    const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  const moveColumn = useCallback((index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= columnConfig.length) return;
    const nextConfig = [...columnConfig];
    [nextConfig[index], nextConfig[next]] = [nextConfig[next], nextConfig[index]];
    setColumnConfig(nextConfig);
    saveColumnConfig(nextConfig);
  }, [columnConfig]);

  const toggleColumnVisibility = useCallback((id) => {
    const next = columnConfig.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
    setColumnConfig(next);
    saveColumnConfig(next);
  }, [columnConfig]);

  const resetColumns = useCallback(() => {
    setColumnConfig([...DEFAULT_COLUMNS]);
    saveColumnConfig(DEFAULT_COLUMNS);
  }, []);

  const closeColumnConfig = useCallback(() => {
    setShowColumnConfig(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <AdminRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                <p className="mt-2 text-gray-600">Manage system users and their roles</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowColumnConfig(true)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  title="Configure columns"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Configure columns
                </button>
                <button
                  onClick={handleAddUser}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Add New User
                </button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Users Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th key={col.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-6 py-4 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    sortedUsers.map((userItem) => (
                      <tr 
                        key={userItem.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedUser(userItem)}
                      >
                        {visibleColumns.map((col) => {
                          const key = col.key;
                          const cellClass = 'px-6 py-4 whitespace-nowrap text-sm';
                          if (key === 'user') {
                            return (
                              <td key={col.id} className={cellClass}>
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                      <span className="text-sm font-medium text-gray-700">
                                        {userItem.first_name.charAt(0)}{userItem.last_name.charAt(0)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {userItem.first_name} {userItem.last_name}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            );
                          }
                          if (key === 'email') return <td key={col.id} className={`${cellClass} text-gray-900`}>{userItem.email}</td>;
                          if (key === 'role') {
                            return (
                              <td key={col.id} className={cellClass}>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  userItem.role === 'admin' ? 'bg-red-100 text-red-800' :
                                  userItem.role === 'supervisor' ? 'bg-blue-100 text-blue-800' :
                                  userItem.role === 'agent' ? 'bg-green-100 text-green-800' :
                                  userItem.role === 'processor' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>
                                  {userItem.role_display}
                                </span>
                              </td>
                            );
                          }
                          if (key === 'extension') {
                            return (
                              <td key={col.id} className={cellClass}>
                                {userItem.extension ? (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                    {userItem.extension}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            );
                          }
                          if (key === 'supervisor') return <td key={col.id} className={`${cellClass} text-gray-900`}>{userItem.supervisor_name || '-'}</td>;
                          if (key === 'account_status') {
                            return (
                              <td key={col.id} className={cellClass}>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  userItem.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {userItem.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            );
                          }
                          if (key === 'online_status') {
                            return (
                              <td key={col.id} className={cellClass}>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  userItem.status === 'online' ? 'bg-green-100 text-green-800' :
                                  userItem.status === 'away' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {userItem.status === 'online' ? '🟢 Online' :
                                   userItem.status === 'away' ? '🟡 Away' :
                                   '⚫ Offline'}
                                </span>
                              </td>
                            );
                          }
                          if (key === 'last_seen') {
                            const d = new Date(userItem.last_seen_at);
                            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                            const timeStr = d.toLocaleTimeString();
                            return <td key={col.id} className={`${cellClass} text-gray-500`}>{userItem.last_seen_at ? `${dateStr}, ${timeStr}` : '—'}</td>;
                          }
                          if (key === 'created') return <td key={col.id} className={`${cellClass} text-gray-500`}>{new Date(userItem.created_at).toLocaleDateString()}</td>;
                          if (key === 'actions') {
                            return (
                              <td key={col.id} className={`${cellClass} font-medium`}>
                                <div className="flex space-x-2 flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleEditUser(userItem)} className="text-blue-600 hover:text-blue-900">Edit</button>
                                  <button onClick={() => handleForceLogoutClick(userItem.id, `${userItem.first_name} ${userItem.last_name}`)} className="text-orange-600 hover:text-orange-900" title="Force logout user from all devices">Force Logout</button>
                                  <button onClick={() => handleToggleUserStatus(userItem.id, userItem.is_active)} className={userItem.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}>{userItem.is_active ? 'Deactivate' : 'Activate'}</button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleTwilio(userItem.id, userItem.twilio_enabled !== undefined ? userItem.twilio_enabled : true); }}
                                    className={(userItem.twilio_enabled !== undefined ? userItem.twilio_enabled : true) ? 'text-orange-600 hover:text-orange-900' : 'text-blue-600 hover:text-blue-900'}
                                    title={(userItem.twilio_enabled !== undefined ? userItem.twilio_enabled : true) ? 'Disable Twilio calling' : 'Enable Twilio calling'}
                                  >
                                    {(userItem.twilio_enabled !== undefined ? userItem.twilio_enabled : true) ? '📞 Disable Twilio' : '📞 Enable Twilio'}
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          return <td key={col.id} className={cellClass}>—</td>;
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column configuration modal */}
          {showColumnConfig && (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="column-config-title" role="dialog" aria-modal="true">
              <div className="flex min-h-screen items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={closeColumnConfig} aria-hidden="true" />
                <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 id="column-config-title" className="text-lg font-semibold text-gray-900">Configure columns</h2>
                    <button onClick={closeColumnConfig} className="text-gray-400 hover:text-gray-600 p-1 rounded" aria-label="Close">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Toggle visibility and use arrows to reorder columns.</p>
                  <ul className="space-y-2">
                    {columnConfig.map((col, index) => (
                      <li key={col.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                        <input
                          type="checkbox"
                          id={`col-${col.id}`}
                          checked={col.visible}
                          onChange={() => toggleColumnVisibility(col.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`col-${col.id}`} className="flex-1 text-sm font-medium text-gray-700 cursor-pointer">
                          {col.label}
                        </label>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveColumn(index, -1)}
                            disabled={index === 0}
                            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
                            title="Move left"
                            aria-label="Move left"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(index, 1)}
                            disabled={index === columnConfig.length - 1}
                            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
                            title="Move right"
                            aria-label="Move right"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetColumns}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                    >
                      Reset to default
                    </button>
                    <button
                      type="button"
                      onClick={closeColumnConfig}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Form Modal */}
        {showUserForm && (
          <UserForm
            key={editingUser ? `edit-${editingUser.id}` : 'create-new'}
            user={editingUser}
            onClose={handleUserFormClose}
            onSuccess={handleUserFormClose}
          />
        )}

        {/* User Details Modal */}
        {selectedUser && (
          <UserDetailsModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        )}

        {/* Force Logout Confirmation Modal */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={handleForceLogoutCancel}
          onConfirm={handleForceLogoutConfirm}
          title="Force Logout User"
          message={`Are you sure you want to force logout ${confirmModal.userName}? They will be logged out from all devices immediately.`}
          confirmText="Force Logout"
          cancelText="Cancel"
          confirmButtonClass="bg-orange-600 hover:bg-orange-700"
          isLoading={isLoggingOut}
          icon={
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100">
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
          }
        />

      </div>
      </AdminRoute>
    </ProtectedRoute>
  );
}
