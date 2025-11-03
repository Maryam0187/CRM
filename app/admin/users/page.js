'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { useSocket } from '../../../contexts/SocketContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminRoute from '../../../components/AdminRoute';
import UserForm from '../../../components/UserForm';
import UserDetailsModal from '../../../components/UserDetailsModal';
import { apiClient } from '../../../lib/apiClient';


export default function AdminUsersPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const { socket, isConnected } = useSocket();

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
        fetchUsers(); // Refresh the users list
      } else {
        setError(data.error || 'Failed to update user status');
      }
    } catch (err) {
      setError('Failed to update user status');
      console.error('Error updating user status:', err);
    }
  };



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
              <button
                onClick={handleAddUser}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Add New User
              </button>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supervisor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Online Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-4 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((userItem) => (
                      <tr 
                        key={userItem.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedUser(userItem)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {userItem.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {userItem.supervisor_name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            userItem.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {userItem.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(userItem.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEditUser(userItem)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleUserStatus(userItem.id, userItem.is_active)}
                              className={`${
                                userItem.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'
                              }`}
                            >
                              {userItem.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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

      </div>
      </AdminRoute>
    </ProtectedRoute>
  );
}
