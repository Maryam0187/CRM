'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin, isAgent, isSupervisor, isProcessor, isVerification } from '../lib/roleUtils';
import { useSearchParams, useRouter } from 'next/navigation';

export default function PaymentView() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const saleId = searchParams.get('saleId');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullDetails, setShowFullDetails] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user, saleId, showFullDetails]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (saleId) params.append('saleId', saleId);
      if (isAdmin(user) && showFullDetails) params.append('showFullDetails', 'true');
      
      const url = `/api/payments?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'x-user-id': user.id.toString(),
          'x-user-role': user.role
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch payments');
      }

      setPayments(data.payments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const maskCardNumber = (cardNumber) => {
    if (!cardNumber) return 'N/A';
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length < 4) return '****';
    return '**** **** **** ' + cleaned.slice(-4);
  };

  const maskCVV = (cvv) => {
    if (!cvv) return '***';
    return '***';
  };

  const maskAccountNumber = (accountNumber) => {
    if (!accountNumber) return 'N/A';
    const cleaned = accountNumber.replace(/\s/g, '');
    if (cleaned.length < 4) return '****';
    return '****' + cleaned.slice(-4);
  };

  const maskRoutingNumber = (routingNumber) => {
    if (!routingNumber) return 'N/A';
    return '***' + routingNumber.slice(-4);
  };

  const maskDriverLicense = (driverLicense) => {
    if (!driverLicense) return 'N/A';
    return '***' + driverLicense.slice(-4);
  };

  // Helper functions to determine what information to show based on user role
  const canSeeFullCardNumber = () => {
    return isAdmin(user) && showFullDetails;
  };

  const canSeeFullCVV = () => {
    return isAdmin(user) && showFullDetails;
  };

  const canSeeFullAccountNumber = () => {
    return isAdmin(user) && showFullDetails;
  };

  const canSeeFullRoutingNumber = () => {
    return isAdmin(user) && showFullDetails;
  };

  const canSeeFullDriverLicense = () => {
    return isAdmin(user) && showFullDetails;
  };

  const canSeeLastFourCardNumber = () => {
    return isAgent(user) || isSupervisor(user) || isProcessor(user) || isVerification(user) || isAdmin(user);
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'lead': 'bg-yellow-100 text-yellow-800',
      'active': 'bg-green-100 text-green-800',
      'pending': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
      'voicemail': 'bg-gray-100 text-gray-800',
      'hang-up': 'bg-red-100 text-red-800',
      'no_response': 'bg-orange-100 text-orange-800',
      'appointment': 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };


  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading user authentication...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading payments</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Payment Information - Sale #{saleId}
              </h1>
              <p className="text-gray-600 mt-1">
                View payment details for this sale
              </p>
            </div>
          </div>
          
          {/* Admin Toggle */}
          {isAdmin(user) && (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">Show full details:</span>
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showFullDetails ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showFullDetails ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <svg
                className={`h-5 w-5 ${showFullDetails ? 'text-blue-600' : 'text-gray-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
          )}

          {/* Role-based information display */}
          {!isAdmin(user) && (
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-blue-600">
                {isAgent(user) && "Limited view - Showing masked payment information"}
                {isSupervisor(user) && "Limited view - Showing masked payment information"}
                {isProcessor(user) && "Limited view - Showing masked payment information"}
                {isVerification(user) && "Limited view - Showing masked payment information"}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Payment Cards */}
      <div className="grid gap-6">
        {payments.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No payment information found</h3>
            <p className="mt-1 text-sm text-gray-500">This sale doesn't have any payment methods added yet.</p>
          </div>
        ) : (
          payments.map((payment) => (
            <div key={payment.saleId} className="bg-white shadow rounded-lg overflow-hidden">
              {/* Sale Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Sale #{payment.saleId}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Customer: {payment.customer.name} • Agent: {payment.agent.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.saleInfo.status)}`}>
                      {payment.saleInfo.status}
                    </span>
                    <p className="text-sm text-gray-600 mt-1">
                      Created: {formatDate(payment.saleInfo.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Sale Information */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Sale Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Regular Bill:</span>
                        <span className="text-sm font-medium">{formatCurrency(payment.saleInfo.regularBill)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Promotional Bill:</span>
                        <span className="text-sm font-medium">{formatCurrency(payment.saleInfo.promotionalBill)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Last Payment:</span>
                        <span className="text-sm font-medium">{formatCurrency(payment.saleInfo.lastPayment)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Balance:</span>
                        <span className="text-sm font-medium">{formatCurrency(payment.saleInfo.balance)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Last Payment Date:</span>
                        <span className="text-sm font-medium">{formatDate(payment.saleInfo.lastPaymentDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Customer Information */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Customer Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Name:</span>
                        <span className="text-sm font-medium">{payment.customer.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Email:</span>
                        <span className="text-sm font-medium">{payment.customer.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Phone:</span>
                        <span className="text-sm font-medium">{payment.customer.phone}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Methods */}
                {(payment.cards.length > 0 || payment.banks.length > 0) && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-4">Payment Methods</h4>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Cards */}
                      {payment.cards.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Cards</h5>
                          <div className="space-y-3">
                            {payment.cards.map((card, index) => (
                              <div key={index} className="bg-gray-50 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-gray-900">{card.provider ? card.provider.toUpperCase() : 'N/A'}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      card.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {card.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Card Number:</span>
                                    <span className="font-mono">
                                      {card.cardNumber}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">CVV:</span>
                                    <span className="font-mono">
                                      {card.cvv}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Expiry:</span>
                                    <span className="font-mono">
                                      {card.expiryDate && card.expiryDate.trim() !== '' ? card.expiryDate : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Name on Card:</span>
                                    <span>{card.customerName || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Type:</span>
                                    <span>{card.cardType || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Banks */}
                      {payment.banks.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Bank Accounts</h5>
                          <div className="space-y-3">
                            {payment.banks.map((bank, index) => (
                              <div key={index} className="bg-gray-50 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-gray-900">{bank.bankName || 'N/A'}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      bank.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {bank.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Account Number:</span>
                                    <span className="font-mono">
                                      {bank.accountNumber}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Routing Number:</span>
                                    <span className="font-mono">
                                      {bank.routingNumber}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Account Holder:</span>
                                    <span>{bank.accountHolder || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Check Number:</span>
                                    <span>{bank.checkNumber || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Driver License:</span>
                                    <span className="font-mono">
                                      {bank.driverLicense}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* No Payment Methods */}
                {payment.cards.length === 0 && payment.banks.length === 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="text-center py-4">
                      <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <p className="text-sm text-gray-500 mt-2">No payment methods added</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
