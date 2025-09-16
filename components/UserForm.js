'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import PasswordModal from './PasswordModal';

export default function UserForm({ user, onClose, onSuccess }) {
  const { user: currentUser } = useAuth();
  const { showSuccess, showError } = useToast();
  console.log('UserForm component rendered with user:', user);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: '',
    phone: '',
    cnic: '',
    address: '',
    superiorId: ''
  });
  
  const [roles, setRoles] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const isEditMode = !!user;

  useEffect(() => {
    console.log('UserForm useEffect triggered:', { user, isEditMode });
    fetchRoles();
    
    if (isEditMode && user) {
      // Edit mode - populate form with user data
      console.log('Setting form data for edit mode:', user.email);
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        password: '',
        role: user.role || '',
        phone: user.phone ? formatPhone(user.phone) : '',
        cnic: user.cnic ? formatCNIC(user.cnic) : '',
        address: user.address || '',
        superiorId: user.superiorId || ''
      });
      
      // If editing an agent user, fetch supervisors
      if (user.role === 'agent') {
        console.log('Editing agent user - fetching supervisors');
        fetchSupervisors();
      }
    } else {
      // Create mode - reset form to empty values
      console.log('Resetting form data for create mode');
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: '',
        phone: '',
        cnic: '',
        address: '',
        superiorId: ''
      });
    }
  }, [user, isEditMode]);

  // Additional useEffect to ensure form is reset when component mounts in create mode
  useEffect(() => {
    if (!isEditMode) {
      console.log('Component mounted in create mode - ensuring form is empty');
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: '',
        phone: '',
        cnic: '',
        address: '',
        superiorId: ''
      });
    }
  }, [isEditMode]);

  const fetchRoles = async () => {
    if (!currentUser) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoadingRoles(true);
      const response = await fetch('/api/roles', {
        headers: {
          'x-user-id': currentUser.id.toString(),
          'x-user-role': currentUser.role
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setRoles(data.data);
      } else {
        setError(data.error || 'Failed to fetch roles');
      }
    } catch (err) {
      setError('Failed to fetch roles');
      console.error('Error fetching roles:', err);
    } finally {
      setLoadingRoles(false);
    }
  };

  const fetchSupervisors = async () => {
    if (!currentUser) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoadingSupervisors(true);
      const response = await fetch('/api/supervisors', {
        headers: {
          'x-user-id': currentUser.id.toString(),
          'x-user-role': currentUser.role
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setSupervisors(data.data);
      } else {
        setError(data.error || 'Failed to fetch supervisors');
      }
    } catch (err) {
      setError('Failed to fetch supervisors');
      console.error('Error fetching supervisors:', err);
    } finally {
      setLoadingSupervisors(false);
    }
  };

  // Function to format CNIC input
  const formatCNIC = (value) => {
    // Remove all non-numeric characters
    const numericValue = value.replace(/\D/g, '');
    
    // Apply formatting based on length
    if (numericValue.length <= 5) {
      return numericValue;
    } else if (numericValue.length <= 12) {
      return `${numericValue.slice(0, 5)}-${numericValue.slice(5)}`;
    } else {
      return `${numericValue.slice(0, 5)}-${numericValue.slice(5, 12)}-${numericValue.slice(12, 13)}`;
    }
  };

  // Function to format phone input
  const formatPhone = (value) => {
    // Remove all non-numeric characters
    const numericValue = value.replace(/\D/g, '');
    
    // Apply formatting based on length
    if (numericValue.length <= 4) {
      return numericValue;
    } else if (numericValue.length <= 11) {
      return `${numericValue.slice(0, 4)}-${numericValue.slice(4)}`;
    } else {
      return `${numericValue.slice(0, 4)}-${numericValue.slice(4, 11)}`;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Format CNIC input
    if (name === 'cnic') {
      const formattedValue = formatCNIC(value);
      setFormData(prev => ({
        ...prev,
        [name]: formattedValue
      }));
    } 
    // Format phone input
    else if (name === 'phone') {
      const formattedValue = formatPhone(value);
      setFormData(prev => ({
        ...prev,
        [name]: formattedValue
      }));
    } 
    else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Clear error when user starts typing
    if (error) {
      setError('');
    }

    // If role is agent, fetch supervisors
    if (name === 'role' && value === 'agent') {
      fetchSupervisors();
    }
  };

  const validateForm = () => {
    if (!formData.first_name.trim()) {
      setError('First name is required');
      return false;
    }
    if (!formData.last_name.trim()) {
      setError('Last name is required');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!formData.role) {
      setError('Role is required');
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    // CNIC validation (if provided)
    if (formData.cnic && formData.cnic.trim()) {
      // Remove dashes for validation
      const numericCNIC = formData.cnic.replace(/\D/g, '');
      if (numericCNIC.length !== 13) {
        setError('CNIC must be 13 digits');
        return false;
      }
    }

    // Phone validation (if provided)
    if (formData.phone && formData.phone.trim()) {
      // Remove dashes for validation
      const numericPhone = formData.phone.replace(/\D/g, '');
      if (numericPhone.length !== 11 || !numericPhone.startsWith('03')) {
        setError('Phone must be 11 digits starting with 03');
        return false;
      }
    }

    // Password validation for new users
    if (!isEditMode) {
      if (!formData.password) {
        setError('Password is required');
        return false;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        return false;
      }
    }

    return true;
  };

  const handleResetPassword = () => {
    setShowPasswordModal(true);
  };

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    setIsResettingPassword(false);
  };

  const handlePasswordConfirm = async (newPassword) => {
    if (!currentUser) {
      setError('User not authenticated');
      return;
    }

    setIsResettingPassword(true);
    setError('');

    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id.toString(),
          'x-user-role': currentUser.role
        },
        body: JSON.stringify({ password: newPassword })
      });

      const data = await response.json();
      
      if (data.success) {
        showSuccess('Password reset successfully!');
        handlePasswordModalClose();
        setError(''); // Clear any existing errors
      } else {
        showError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      showError('Failed to reset password');
      console.error('Error resetting password:', err);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
      setError('User not authenticated');
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const url = isEditMode ? `/api/users/${user.id}` : '/api/users';
      const method = isEditMode ? 'PUT' : 'POST';
      
      const requestData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        role: formData.role,
        phone: formData.phone ? formData.phone.replace(/\D/g, '') : '',
        cnic: formData.cnic ? formData.cnic.replace(/\D/g, '') : '',
        address: formData.address
      };

      // Only include password for new users
      if (!isEditMode) {
        requestData.password = formData.password;
      }

      // Include superiorId for agents
      if (formData.role === 'agent' && formData.superiorId) {
        requestData.superiorId = formData.superiorId;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id.toString(),
          'x-user-role': currentUser.role
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();
      
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || `Failed to ${isEditMode ? 'update' : 'create'} user`);
      }
    } catch (err) {
      setError(`Failed to ${isEditMode ? 'update' : 'create'} user`);
      console.error('Error submitting form:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? 'Update User' : 'Register New User'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6" autoComplete="off">
          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* First Name */}
            <div>
              <label htmlFor="first_name" className="block mb-2 text-sm font-medium text-gray-900">
                First Name *
              </label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter First Name"
                required
              />
            </div>

            {/* Last Name */}
            <div>
              <label htmlFor="last_name" className="block mb-2 text-sm font-medium text-gray-900">
                Last Name *
              </label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter Last Name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="example@abc.com"
                autoComplete="off"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block mb-2 text-sm font-medium text-gray-900">
                Phone
              </label>
              <input
                type="text"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="03xx-xxxxxxx"
              />
            </div>

            {/* CNIC */}
            <div>
              <label htmlFor="cnic" className="block mb-2 text-sm font-medium text-gray-900">
                CNIC
              </label>
              <input
                type="text"
                id="cnic"
                name="cnic"
                value={formData.cnic}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="xxxxx-xxxxxxx-x"
              />
            </div>

            {/* Address */}
            <div className="md:col-span-2">
              <label htmlFor="address" className="block mb-2 text-sm font-medium text-gray-900">
                Address
              </label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
                placeholder="Enter Address"
              />
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block mb-2 text-sm font-medium text-gray-900">
                Role *
              </label>
              <div className="relative">
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={loadingRoles}
                >
                  <option value="">Select Role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.display_name}
                    </option>
                  ))}
                </select>
                {loadingRoles && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Supervisor Selection (for agents) */}
            {formData.role === 'agent' && (
              <div>
                <label htmlFor="superiorId" className="block mb-2 text-sm font-medium text-gray-900">
                  Supervisor
                </label>
                <div className="relative">
                  <select
                    id="superiorId"
                    name="superiorId"
                    value={formData.superiorId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loadingSupervisors}
                  >
                    <option value="">Select Supervisor</option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.full_name}
                      </option>
                    ))}
                  </select>
                  {loadingSupervisors && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Password Fields (only for new users) */}
            {!isEditMode && (
              <>
                <div>
                  <label htmlFor="password" className="block mb-2 text-sm font-medium text-gray-900">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter Password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

              </>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-between items-center mt-8">
            <div>
              {isEditMode && (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="px-4 py-2 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg font-medium transition-colors"
                >
                  Reset Password
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {isEditMode ? 'Updating...' : 'Creating...'}
                  </div>
                ) : (
                  isEditMode ? 'Update User' : 'Create User'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <PasswordModal
          isOpen={showPasswordModal}
          onClose={handlePasswordModalClose}
          onConfirm={handlePasswordConfirm}
          userName={`${formData.first_name} ${formData.last_name}`}
          isLoading={isResettingPassword}
        />
      )}
    </div>
  );
}
