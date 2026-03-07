'use client';

import { useState, useEffect } from 'react';
import { formatDisplayDate } from '../lib/validation.js';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin, isAgent, isSupervisor, isProcessor, isVerification } from '../lib/roleUtils';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient } from '../lib/apiClient';
import { SALES_STATUSES, getStatusDisplayName } from '../lib/salesStatuses';

export default function PaymentView() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const saleId = searchParams.get('saleId');
  const customerId = searchParams.get('customerId');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [updatingRefs, setUpdatingRefs] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user, saleId, customerId, showFullDetails]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (saleId) params.append('saleId', saleId);
      if (customerId) params.append('customerId', customerId);
      if (isAdmin(user) && showFullDetails) params.append('showFullDetails', 'true');
      
      const url = `/api/payments?${params.toString()}`;
      const response = await apiClient.get(url);
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

  // Sort so current sale (from URL) is first when viewing a specific sale
  const sortedPayments = (() => {
    if (!saleId || payments.length <= 1) return payments;
    const currentId = parseInt(saleId, 10);
    const current = payments.find((p) => p.saleId === currentId);
    const others = payments.filter((p) => p.saleId !== currentId);
    return current ? [current, ...others] : payments;
  })();

  const handleUsedOldPaymentRefs = async (newRefs) => {
    if (!saleId) return;
    setUpdatingRefs(true);
    setError(null);
    try {
      const response = await apiClient.put(`/api/sales/${saleId}`, { usedOldPaymentRefs: newRefs });
      const result = await response.json();
      if (result.success) await fetchPayments();
      else setError(result.message || 'Failed to update');
    } catch (err) {
      setError(err.message || 'Failed to update');
    } finally {
      setUpdatingRefs(false);
    }
  };

  const addOldPaymentRef = (paymentType, paymentId, originalSaleId) => {
    const current = payments.find((p) => p.saleId === parseInt(saleId, 10));
    const refs = current?.saleInfo?.usedOldPaymentRefs || [];
    if (refs.some((r) => r.paymentType === paymentType && r.paymentId === paymentId && r.originalSaleId === originalSaleId)) return;
    handleUsedOldPaymentRefs([...refs, { paymentType, paymentId, originalSaleId }]);
  };

  const removeOldPaymentRef = (paymentType, paymentId) => {
    const current = payments.find((p) => p.saleId === parseInt(saleId, 10));
    const refs = (current?.saleInfo?.usedOldPaymentRefs || []).filter(
      (r) => !(r.paymentType === paymentType && r.paymentId === paymentId)
    );
    handleUsedOldPaymentRefs(refs);
  };

  const handleAdminAction = async (action, status, saleIdToUpdate) => {
    const effectiveSaleId = saleIdToUpdate ?? saleId;
    if (!effectiveSaleId) return;
    
    setSavingStatus(true);
    setError(null);
    
    try {
      // Update sale status
      const response = await apiClient.put(`/api/sales/${effectiveSaleId}`, {
        status: status
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Log the action to sales logs
        const saleData = payments.find((p) => p.saleId === effectiveSaleId) || payments[0];
        if (saleData) {
          const logData = {
            saleId: parseInt(effectiveSaleId),
            customerId: saleData.customer?.id || saleData.saleInfo?.customerId,
            agentId: user?.id ?? saleData.agent?.id ?? saleData.saleInfo?.agentId, // Who performed the action (e.g. supervisor marking done)
            action: action,
            status: status,
            currentSaleData: {
              ...saleData.saleInfo,
              status: status
            }
          };
          
          try {
            await apiClient.post('/api/sales-logs', logData);
          } catch (logError) {
            console.warn('Failed to log action:', logError);
          }
        }
        
        // Refresh payments to show updated status
        await fetchPayments();
      } else {
        setError(result.message || 'Failed to update sale status');
      }
    } catch (error) {
      console.error('Error updating sale status:', error);
      setError('Failed to update sale status');
    } finally {
      setSavingStatus(false);
    }
  };

  const shouldShowAdminActions = (status) => {
    // Show admin action buttons only for admin users
    if (!isAdmin(user)) {
      return false;
    }
    
    if (!status) {
      return false;
    }
    
    // Show buttons for ready-for-payment and admin statuses (charged, declined, chargeback)
    const statusValue = String(status).trim();
    const statusLower = statusValue.toLowerCase();
    
    // Check against both enum values and direct strings
    const isReadyForPayment = statusLower === SALES_STATUSES.READY_FOR_PAYMENT.toLowerCase() || 
                              statusLower === 'ready-for-payment' ||
                              statusValue === SALES_STATUSES.READY_FOR_PAYMENT;
    const isCharged = statusLower === SALES_STATUSES.CHARGED.toLowerCase() || 
                      statusLower === 'charged' ||
                      statusValue === SALES_STATUSES.CHARGED;
    const isDeclined = statusLower === SALES_STATUSES.DECLINED.toLowerCase() || 
                       statusLower === 'declined' ||
                       statusValue === SALES_STATUSES.DECLINED;
    const isChargeback = statusLower === SALES_STATUSES.CHARGEBACK.toLowerCase() || 
                         statusLower === 'chargeback' ||
                         statusValue === SALES_STATUSES.CHARGEBACK;
    
    return isReadyForPayment || isCharged || isDeclined || isChargeback;
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
      'appointment': 'bg-purple-100 text-purple-800',
      'ready-for-payment': 'bg-green-100 text-green-800',
      'charged': 'bg-pink-100 text-pink-800',
      'declined': 'bg-red-100 text-red-800',
      'chargeback': 'bg-red-200 text-red-900',
      'lead-call': 'bg-blue-100 text-blue-800',
      'sale-done': 'bg-green-200 text-green-900'
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
                {customerId && saleId
                  ? `Payment Information - Sale #${saleId}`
                  : customerId
                    ? 'Payment Information - Customer'
                    : `Payment Information - Sale #${saleId}`}
              </h1>
              <p className="text-gray-600 mt-1">
                {customerId && saleId
                  ? 'Payments for this sale first, then other sales below. You can use an old payment from another sale for this sale.'
                  : customerId
                    ? 'View all payment details for this customer'
                    : 'View payment details for this sale'}
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

          {/* Role-based information display - show on icon hover */}
          {!isAdmin(user) && (
            <div className="flex items-center">
              <span
                title="Limited view - Showing masked payment information"
                className="cursor-help inline-flex"
              >
                <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Payment Cards (by sale): current sale first, then other sales. All payments on one page. */}
      {(
      <div className="grid gap-6">
        {sortedPayments.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No payment information found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {customerId ? "This customer doesn't have any payment methods on file." : "This sale doesn't have any payment methods added yet."}
            </p>
          </div>
        ) : (
          sortedPayments.map((payment) => {
            const isCurrentSale = saleId && payment.saleId === parseInt(saleId, 10);
            const usedRefs = (payment.saleInfo?.usedOldPaymentRefs || []).filter(Boolean);
            const canShowSaleInfo = isAdmin(user) || (isSupervisor(user) && (payment.agent?.id === user?.id || user?.supervisedAgents?.some((a) => a.id === payment.agent?.id)));
            const canShowAgentName = !isAgent(user) || payment.agent?.id === user?.id;
            return (
            <div key={payment.saleId} className="bg-white shadow rounded-lg overflow-hidden">
              {/* Sale Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Sale #{payment.saleId}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Customer: {payment.customer.name}
                      {canShowAgentName && payment.agent?.name && ` • Agent: ${payment.agent.name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.saleInfo.status)}`}>
                      {getStatusDisplayName(payment.saleInfo.status) || payment.saleInfo.status}
                    </span>
                    <p className="text-sm text-gray-600 mt-1">
                      Created: {formatDate(payment.saleInfo.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons - Visible based on status rules */}
              {(() => {
                const currentStatus = (payment.saleInfo?.status || '').toLowerCase();
                const isCharged = currentStatus === SALES_STATUSES.CHARGED.toLowerCase() || currentStatus === 'charged';
                const isDeclined = currentStatus === SALES_STATUSES.DECLINED.toLowerCase() || currentStatus === 'declined';
                const isChargeback = currentStatus === SALES_STATUSES.CHARGEBACK.toLowerCase() || currentStatus === 'chargeback';
                const isReadyForPayment = currentStatus === SALES_STATUSES.READY_FOR_PAYMENT.toLowerCase() || currentStatus === 'ready-for-payment';
                
                // Determine which buttons to show based on status
                let showButtons = false;
                let showCharged = false;
                let showDeclined = false;
                let showChargeback = false;
                let showCancelled = false;
                let showReadyForPayment = false;
                let sectionTitle = 'Admin Actions';
                
                if (isCharged) {
                  // If charged: show only Chargeback button (admin only)
                  if (isAdmin(user)) {
                    showButtons = true;
                    showChargeback = true; // Chargeback only shows when status is charged
                  }
                } else if (isDeclined) {
                  // If declined: Charged (admin only), Declined (admin only), Ready for Payment (all users), Cancelled (all users)
                  showButtons = true;
                  showCharged = isAdmin(user);
                  showDeclined = isAdmin(user);
                  showReadyForPayment = true; // All users
                  showCancelled = true; // All users
                  sectionTitle = 'Status Actions';
                } else if (isReadyForPayment) {
                  // If ready-for-payment: show admin action buttons (only for admin)
                  if (isAdmin(user)) {
                    showButtons = true;
                    showCharged = true;
                    showDeclined = true;
                    // Chargeback only shows when status is charged, not ready-for-payment
                    showCancelled = true;
                  }
                } else if (isChargeback) {
                  // If chargeback: show buttons (only for admin)
                  if (isAdmin(user)) {
                    showButtons = true;
                    showCharged = true;
                    showDeclined = true;
                    // Don't show chargeback button when already in chargeback status
                  }
                } else if (isAdmin(user)) {
                  // For other statuses, show admin buttons only for admin
                  showButtons = true;
                  showCharged = true;
                  showDeclined = true;
                  // Chargeback only shows when status is charged
                }
                
                if (!showButtons) return null;
                
                return (
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">{sectionTitle}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {showCharged && (
                        <button
                          onClick={() => handleAdminAction('charged', SALES_STATUSES.CHARGED, payment.saleId)}
                          disabled={savingStatus}
                          className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          💰 Charged
                        </button>
                      )}
                      {showDeclined && (
                        <button
                          onClick={() => handleAdminAction('declined', SALES_STATUSES.DECLINED, payment.saleId)}
                          disabled={savingStatus}
                          className="bg-red-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ❌ Declined
                        </button>
                      )}
                      {showChargeback && (
                        <button
                          onClick={() => handleAdminAction('chargeback', SALES_STATUSES.CHARGEBACK, payment.saleId)}
                          disabled={savingStatus}
                          className="bg-red-800 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🔄 Chargeback
                        </button>
                      )}
                      {showCancelled && (
                        <button
                          onClick={() => handleAdminAction('cancelled', SALES_STATUSES.CANCELLED, payment.saleId)}
                          disabled={savingStatus}
                          className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ❌ Cancelled
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Payment Details */}
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Sale Information - admin always; supervisor only if sale is from them or their agent */}
                  {canShowSaleInfo && (
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
                  )}

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
                        <span className="text-sm font-medium">{payment.customer.email || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Phone:</span>
                        <span className="text-sm font-medium">{payment.customer.phone || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Old payments used for this sale (from other sales) */}
                {isCurrentSale && usedRefs.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Old payments used for this sale</h4>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                      These payment methods were added for another sale and are shown here for use with Sale #{payment.saleId}.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                      {usedRefs.map((ref, refIdx) => {
                        const origSale = payments.find((p) => p.saleId === ref.originalSaleId);
                        if (!origSale) return null;
                        const type = ref.paymentType;
                        const id = ref.paymentId;
                        let item = null;
                        if (type === 'card') item = (origSale.cards || []).find((c) => c.id === id);
                        else if (type === 'bank') item = (origSale.banks || []).find((b) => b.id === id);
                        else if (type === 'cheque_electronic') item = (origSale.chequesElectronic || []).find((c) => c.id === id);
                        else if (type === 'cheque_mail') item = (origSale.chequesMail || []).find((c) => c.id === id);
                        else if (type === 'payment_email') item = (origSale.paymentEmails || []).find((e) => e.id === id);
                        if (!item) return null;
                        return (
                          <div key={`ref-${refIdx}-${type}-${id}`} className="relative rounded-lg p-4 bg-amber-50 border border-amber-200">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-medium text-amber-800">Old payment — from Sale #{ref.originalSaleId}</span>
                              <button
                                type="button"
                                onClick={() => removeOldPaymentRef(type, id)}
                                disabled={updatingRefs}
                                className="text-xs text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
                              >
                                Remove from this sale
                              </button>
                            </div>
                            {type === 'card' && (
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-gray-600">Card:</span><span className="font-mono">{item.provider?.toUpperCase()} ****{item.cardNumber?.slice(-4)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Expiry:</span><span>{item.expiryDate || 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Name:</span><span>{item.customerName || 'N/A'}</span></div>
                              </div>
                            )}
                            {type === 'bank' && (
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-gray-600">Bank:</span><span>{item.bankName || 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Account:</span><span className="font-mono">{item.accountNumber}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Holder:</span><span>{item.accountHolder || 'N/A'}</span></div>
                              </div>
                            )}
                            {(type === 'cheque_electronic' || type === 'cheque_mail') && (
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-gray-600">Bank:</span><span>{item.bankName || 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Cheque #:</span><span className="font-mono">{item.chequeNumber || 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Name:</span><span>{item.nameOnCheque || 'N/A'}</span></div>
                              </div>
                            )}
                            {type === 'payment_email' && (
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-gray-600">Email:</span><span className="font-mono">{item.emailAddress || 'N/A'}</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment Methods */}
                {(payment.cards.length > 0 || payment.banks.length > 0 || 
                  (payment.chequesElectronic && payment.chequesElectronic.length > 0) || 
                  (payment.chequesMail && payment.chequesMail.length > 0) || 
                  (payment.paymentEmails && payment.paymentEmails.length > 0)) && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-4">Payment Methods</h4>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Cards */}
                      {payment.cards.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Cards</h5>
                          <div className="space-y-3">
                            {payment.cards.map((card, index) => {
                              // Helper functions for expiration status
                              const getCardBgClass = () => {
                                if (card.isExpired) return 'bg-red-50 border-l-4 border-red-500 rounded-lg p-4';
                                if (card.isExpiringSoon) return 'bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4';
                                return 'bg-green-50 border-l-4 border-green-500 rounded-lg p-4';
                              };
                              
                              const getExpiryTextClass = () => {
                                if (card.isExpired) return 'text-red-700 font-bold';
                                if (card.isExpiringSoon) return 'text-yellow-700 font-bold';
                                return 'text-green-700';
                              };
                              
                              const getStatusBadgeClass = () => {
                                if (card.isExpired) return 'bg-red-100 text-red-800';
                                if (card.isExpiringSoon) return 'bg-yellow-100 text-yellow-800';
                                return 'bg-green-100 text-green-800';
                              };
                              
                              return (
                                <div key={index} className={getCardBgClass()}>
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-medium text-gray-900">{card.provider ? card.provider.toUpperCase() : 'N/A'}</span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass()}`}>
                                        {card.isExpired && '❌ Expired'}
                                        {card.isExpiringSoon && '⚠️ Expiring Soon'}
                                        {!card.isExpired && !card.isExpiringSoon && '✅ Valid'}
                                      </span>
                                    </div>
                                    {saleId && !isCurrentSale && (
                                      <button
                                        type="button"
                                        onClick={() => addOldPaymentRef('card', card.id, payment.saleId)}
                                        disabled={updatingRefs}
                                        className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                      >
                                        Add to this sale
                                      </button>
                                    )}
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
                                      <span className={`font-mono ${getExpiryTextClass()}`}>
                                        {card.expiryDate && card.expiryDate.trim() !== '' ? card.expiryDate : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Name on Card:</span>
                                      <span>{card.customerName || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Type:</span>
                                      <span className="capitalize">{card.cardType || 'N/A'}</span>
                                    </div>
                                    
                                    
                                    {card.expirationStatus && (
                              
                                      <div className="mt-2 pt-2 border-t border-gray-200">
                                        
                                        <div className="flex justify-between text-xs">
                                          <span className="text-gray-600">Status:</span>
                                          <span className={card.isExpired ? 'text-red-600 font-medium' : card.isExpiringSoon ? 'text-yellow-600 font-medium' : 'text-green-600 font-medium'}>
                                            {card.expirationStatus.message}
                                          </span>
                                        </div>
                                        <div className="flex justify-between text-sm mt-2">
                                      <span className="text-gray-600">Added:</span>
                                      <span className="text-gray-500 text-xs">
                                        {card.createdDate
                                          ? formatDisplayDate(card.createdDate)
                                          : card.created_at
                                            ? formatDisplayDate(card.created_at)
                                            : 'N/A'}
                                      </span>
                                    </div>
                                      </div>
                                    )}
                                    {isAdmin(user) && card.addedByUserName && (
                                      <div className="mt-2 pt-2 border-t border-gray-200">
                                        <div className="flex justify-between text-sm">
                                          <span className="text-gray-600">Added by:</span>
                                          <span className="text-gray-700 text-xs">{card.addedByUserName}{card.addedByUserRole ? ` (${card.addedByUserRole})` : ''}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
                                  {saleId && !isCurrentSale && (
                                    <button
                                      type="button"
                                      onClick={() => addOldPaymentRef('bank', bank.id, payment.saleId)}
                                      disabled={updatingRefs}
                                      className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                    >
                                      Add to this sale
                                    </button>
                                  )}
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
                                    <span className="text-gray-600">Check Number:</span>
                                    <span className="font-mono">
                                      {bank.checkNumber || 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Account Holder:</span>
                                    <span>{bank.accountHolder || 'N/A'}</span>
                                  </div>
                                  
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Driver License:</span>
                                    <span className="font-mono">
                                      {bank.driverLicense}
                                    </span>
                                  </div>
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Added:</span>
                                    <span className="text-gray-500 text-xs">
                                      {bank.createdDate || formatDisplayDate(bank.created_at) || 'N/A'}
                                    </span>
                                  </div>
                                  {isAdmin(user) && bank.addedByUserName && (
                                    <div className="flex justify-between text-sm mt-1">
                                      <span className="text-gray-600">Added by:</span>
                                      <span className="text-gray-700 text-xs">{bank.addedByUserName}{bank.addedByUserRole ? ` (${bank.addedByUserRole})` : ''}</span>
                                    </div>
                                  )}
                                    </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Electronic Cheques */}
                      {payment.chequesElectronic && payment.chequesElectronic.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Electronic Cheques</h5>
                          <div className="space-y-3">
                            {payment.chequesElectronic.map((cheque, index) => (
                              <div key={index} className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-gray-900">{cheque.bankName || 'N/A'}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      cheque.status === 'active' ? 'bg-green-100 text-green-800' : 
                                      cheque.status === 'processed' ? 'bg-blue-100 text-blue-800' : 
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {cheque.status}
                                    </span>
                                  </div>
                                  {saleId && !isCurrentSale && (
                                    <button
                                      type="button"
                                      onClick={() => addOldPaymentRef('cheque_electronic', cheque.id, payment.saleId)}
                                      disabled={updatingRefs}
                                      className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                    >
                                      Add to this sale
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Routing Number:</span>
                                    <span className="font-mono">{cheque.routingNumber || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Account Number:</span>
                                    <span className="font-mono">{cheque.accountNumber || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Cheque Number:</span>
                                    <span className="font-mono">{cheque.chequeNumber || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Name on Cheque:</span>
                                    <span>{cheque.nameOnCheque || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">State:</span>
                                    <span>{cheque.state || 'N/A'}</span>
                                  </div>
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Added:</span>
                                      <span className="text-gray-500 text-xs">
                                        {cheque.createdDate || formatDisplayDate(cheque.created_at) || 'N/A'}
                                      </span>
                                    </div>
                                    {isAdmin(user) && cheque.addedByUserName && (
                                      <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Added by:</span>
                                        <span className="text-gray-700 text-xs">{cheque.addedByUserName}{cheque.addedByUserRole ? ` (${cheque.addedByUserRole})` : ''}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mail Cheques */}
                      {payment.chequesMail && payment.chequesMail.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Cheques to Mail</h5>
                          <div className="space-y-3">
                            {payment.chequesMail.map((cheque, index) => (
                              <div key={index} className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-gray-900">{cheque.bankName || 'N/A'}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      cheque.status === 'active' ? 'bg-green-100 text-green-800' :
                                      cheque.status === 'sent' ? 'bg-blue-100 text-blue-800' : 
                                      cheque.status === 'received' ? 'bg-green-100 text-green-800' : 
                                      cheque.status === 'processed' ? 'bg-purple-100 text-purple-800' : 
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {cheque.status}
                                    </span>
                                  </div>
                                  {saleId && !isCurrentSale && (
                                    <button
                                      type="button"
                                      onClick={() => addOldPaymentRef('cheque_mail', cheque.id, payment.saleId)}
                                      disabled={updatingRefs}
                                      className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                    >
                                      Add to this sale
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Cheque Number:</span>
                                    <span className="font-mono">{cheque.chequeNumber || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Name on Cheque:</span>
                                    <span>{cheque.nameOnCheque || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Bank Name:</span>
                                    <span>{cheque.bankName || 'N/A'}</span>
                                  </div>
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Added:</span>
                                      <span className="text-gray-500 text-xs">
                                        {cheque.createdDate || formatDisplayDate(cheque.created_at) || 'N/A'}
                                      </span>
                                    </div>
                                    {isAdmin(user) && cheque.addedByUserName && (
                                      <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Added by:</span>
                                        <span className="text-gray-700 text-xs">{cheque.addedByUserName}{cheque.addedByUserRole ? ` (${cheque.addedByUserRole})` : ''}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Payment Emails */}
                      {payment.paymentEmails && payment.paymentEmails.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">Payment Emails</h5>
                          <div className="space-y-3">
                            {payment.paymentEmails.map((email, index) => (
                              <div key={index} className="bg-indigo-50 rounded-lg p-4 border-l-4 border-indigo-500">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-gray-900">📧 Email Invoice</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      email.status === 'active' ? 'bg-green-100 text-green-800' :
                                      email.status === 'sent' ? 'bg-blue-100 text-blue-800' : 
                                      email.status === 'opened' ? 'bg-green-100 text-green-800' : 
                                      email.status === 'paid' ? 'bg-green-200 text-green-900' : 
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {email.status}
                                    </span>
                                  </div>
                                  {saleId && !isCurrentSale && (
                                    <button
                                      type="button"
                                      onClick={() => addOldPaymentRef('payment_email', email.id, payment.saleId)}
                                      disabled={updatingRefs}
                                      className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                    >
                                      Add to this sale
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Email Address:</span>
                                    <span className="font-mono">{email.emailAddress || 'N/A'}</span>
                                  </div>
                                  {email.invoiceLink && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Invoice Link:</span>
                                      <a href={email.invoiceLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        View Link
                                      </a>
                                    </div>
                                  )}
                                  {email.sentAt && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Sent At:</span>
                                      <span className="text-gray-500 text-xs">
                                        {formatDisplayDate(email.sentAt)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Added:</span>
                                      <span className="text-gray-500 text-xs">
                                        {email.createdDate || formatDisplayDate(email.created_at) || 'N/A'}
                                      </span>
                                    </div>
                                    {isAdmin(user) && email.addedByUserName && (
                                      <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Added by:</span>
                                        <span className="text-gray-700 text-xs">{email.addedByUserName}{email.addedByUserRole ? ` (${email.addedByUserRole})` : ''}</span>
                                      </div>
                                    )}
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
                {payment.cards.length === 0 && payment.banks.length === 0 && 
                 (!payment.chequesElectronic || payment.chequesElectronic.length === 0) &&
                 (!payment.chequesMail || payment.chequesMail.length === 0) &&
                 (!payment.paymentEmails || payment.paymentEmails.length === 0) && (
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
          );
          })
        )}
      </div>
      )}
    </div>
  );
}
