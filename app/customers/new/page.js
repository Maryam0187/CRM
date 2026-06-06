'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import apiClient from '../../../lib/apiClient';
import ProtectedRoute from '../../../components/ProtectedRoute';
import CustomerForm from '../../../components/CustomerForm';
import { formatLandline } from '../../../lib/validation';

function NewCustomerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [initialCustomer, setInitialCustomer] = useState(null);

  const fromCall = searchParams.get('fromCall') === '1';
  const landlineParam = searchParams.get('landline')?.trim() || '';
  const firstNameParam = searchParams.get('firstName')?.trim() || '';
  const stateParam = searchParams.get('state')?.trim() || '';
  const cityParam = searchParams.get('city')?.trim() || '';
  const zipcodeParam = searchParams.get('zipcode')?.trim() || '';
  const callSidParam = searchParams.get('callSid')?.trim() || '';

  useEffect(() => {
    if (!fromCall || !landlineParam) return;

    const formattedLandline = formatLandline(landlineParam) || landlineParam;
    setInitialCustomer({
      firstName: firstNameParam,
      landline: formattedLandline,
      state: stateParam,
      city: cityParam,
      zipcode: zipcodeParam
    });
  }, [fromCall, landlineParam, firstNameParam, stateParam, cityParam, zipcodeParam]);

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
        if (fromCall && (formData.landline || landlineParam || callSidParam)) {
          try {
            await apiClient.post(`/api/customers/${result.data.id}/link-call-logs`, {
              phoneNumber: formData.landline || landlineParam,
              callSid: callSidParam || undefined
            });
          } catch (linkErr) {
            console.warn('Customer created but call log link failed:', linkErr);
          }
        }
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

  const handleCancel = () => {
    router.push(fromCall ? '/call-logs' : '/customers');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {fromCall ? 'Back to Call Logs' : 'Back to Customers'}
          </button>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Customer</h1>
            <p className="text-sm text-gray-500 mb-6">
              {fromCall
                ? 'Create a customer from this call. Phone number is pre-filled from the call log.'
                : 'Create a new customer. You can view their sales and call history on the detail page.'}
            </p>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <CustomerForm
              key={initialCustomer ? `call-${landlineParam}` : 'blank'}
              initialCustomer={initialCustomer}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              submitLabel="Create Customer"
              saving={saving}
              lockLandline={fromCall && !!landlineParam}
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function NewCustomerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <NewCustomerPageContent />
    </Suspense>
  );
}
