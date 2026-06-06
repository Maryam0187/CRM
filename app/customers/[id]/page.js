'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../../../lib/apiClient';
import ProtectedRoute from '../../../components/ProtectedRoute';
import CustomerForm from '../../../components/CustomerForm';
import CallHistory from '../../../components/CallHistory';
import { getStatusBadgeClasses, getStatusDisplayName } from '../../../lib/salesStatuses';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales' },
  { id: 'calls', label: 'Call Logs' }
];

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

export default function CustomerDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/api/customers/${id}`);
      const result = await res.json();
      if (result.success) {
        setCustomer(result.data);
      } else {
        setError(result.message || 'Customer not found');
      }
    } catch (err) {
      console.error('Fetch customer error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchCustomer();
  }, [id]);

  const handleUpdate = async (formData) => {
    try {
      setSaving(true);
      setSaveError(null);
      const res = await apiClient.put(`/api/customers/${id}`, formData);
      const result = await res.json();
      if (result.success) {
        setEditing(false);
        await fetchCustomer();
      } else {
        setSaveError(result.message || 'Failed to update customer');
      }
    } catch (err) {
      console.error('Update customer error:', err);
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const buildNewSaleUrl = () => {
    if (!customer) return '/add-sale';
    const params = new URLSearchParams();
    params.set('fromCall', '1');
    if (customer.landline) params.set('landline', customer.landline);
    if (customer.firstName) params.set('firstName', customer.firstName);
    return `/add-sale?${params.toString()}`;
  };

  const displayName = customer
    ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer'
    : '';

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-5xl mx-auto animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-48 bg-gray-200 rounded" />
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !customer) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-5xl mx-auto">
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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error || 'Customer not found'}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const sales = customer.sales || [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-5xl mx-auto">
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

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Customer #{customer.id}
                {customer.created_at && (
                  <> · Added {new Date(customer.created_at).toLocaleDateString()}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Edit Customer
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push(buildNewSaleUrl())}
                className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                New Sale
              </button>
            </div>
          </div>

          <div className="border-b border-gray-200 mb-6">
            <nav className="flex gap-1 -mb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'sales' && sales.length > 0 && (
                    <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                      {sales.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'overview' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {editing ? (
                <>
                  {saveError && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {saveError}
                    </div>
                  )}
                  <CustomerForm
                    initialCustomer={customer}
                    onSubmit={handleUpdate}
                    onCancel={() => {
                      setEditing(false);
                      setSaveError(null);
                    }}
                    submitLabel="Save Changes"
                    saving={saving}
                  />
                </>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoRow label="Landline" value={customer.landline} />
                  <InfoRow label="Cell Phone" value={customer.phone} />
                  <InfoRow label="Email" value={customer.email} />
                  <InfoRow label="Address" value={customer.address} />
                  <InfoRow label="State" value={customer.state} />
                  <InfoRow label="City" value={customer.city} />
                  <InfoRow label="Zipcode" value={customer.zipcode} />
                  <InfoRow label="Country" value={customer.country} />
                  <InfoRow label="Mailing Address" value={customer.mailingAddress} />
                  {customer.customerFeedback && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <InfoRow label="Customer Feedback" value={customer.customerFeedback} />
                    </div>
                  )}
                  {customer.creator && (
                    <InfoRow
                      label="Created By"
                      value={`${customer.creator.firstName || ''} ${customer.creator.lastName || ''}`.trim()}
                    />
                  )}
                </dl>
              )}
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {sales.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No sales yet for this customer.</p>
                  <button
                    type="button"
                    onClick={() => router.push(buildNewSaleUrl())}
                    className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Create First Sale
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                      onClick={() => router.push(`/add-sale?id=${sale.id}`)}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900">Sale #{sale.id}</span>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(sale.status || '')}`}
                        >
                          {getStatusDisplayName(sale.status) || 'N/A'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(sale.created_at).toLocaleDateString()}
                        </span>
                        {sale.agent && (
                          <span className="text-xs text-gray-500">
                            Agent: {sale.agent.firstName} {sale.agent.lastName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/payments?customerId=${customer.id}&saleId=${sale.id}`);
                          }}
                          className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Payments
                        </button>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'calls' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <CallHistory
                customerId={String(customer.id)}
                showCustomerInfo={false}
                showAgentInfo={true}
                limit={15}
              />
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
