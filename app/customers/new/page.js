'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../lib/apiClient';
import ProtectedRoute from '../../components/ProtectedRoute';
import CustomerForm from '../../components/CustomerForm';

export default function NewCustomerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (formData) => {
    try {
      setSaving(true);
      setError(null);

      const res = await apiClient.post('/api/customers', {
        ...formData,
        status: 'prospect',
        createdBy: user?.id || null
      });
      const result = await res.json();

      if (result.success && result.data?.id) {
        router.push(`/customers/${result.data.id}`);
        return;
      }

      setError(result.message || 'Failed to create customer');
    } catch (err) {
      console.error('Create customer error:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Customers
          </button>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Customer</h1>
            <p className="text-sm text-gray-500 mb-6">
              Create a new customer. You can view their sales and call history on the detail page.
            </p>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <CustomerForm
              onSubmit={handleSubmit}
              onCancel={() => router.push('/customers')}
              submitLabel="Create Customer"
              saving={saving}
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
