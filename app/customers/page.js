'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../lib/apiClient';
import ProtectedRoute from '../../components/ProtectedRoute';
import { getStatusBadgeClasses, getStatusDisplayName } from '../../lib/salesStatuses';

export default function CustomersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paginationInfo, setPaginationInfo] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNextPage: false,
    hasPrevPage: false
  });

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user, currentPage, itemsPerPage]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      const response = await apiClient.get(`/api/customers?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setCustomers(result.data);
        if (result.pagination) {
          setPaginationInfo(result.pagination);
        }
      } else {
        setError(result.message || 'Failed to fetch customers');
      }
    } catch (err) {
      setError('Network error: Unable to fetch customers');
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handlePreviousPage = () => {
    if (paginationInfo.hasPrevPage) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (paginationInfo.hasNextPage) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (loading && customers.length === 0) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={handleBack}
              className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">My Customers</h1>
            <p className="text-gray-600 mt-2">
              View all your customers and their related sales
            </p>
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          ) : (
            <>
              {/* Customers List */}
              <div className="space-y-4">
                {customers.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                    <div className="text-gray-400 mb-4">
                      <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Customers Found</h3>
                    <p className="text-gray-600">
                      You haven't created any customers yet. Start by adding a new sale.
                    </p>
                  </div>
                ) : (
                  customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {customer.firstName} {customer.lastName}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                            {customer.landline && (
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>Landline: {customer.landline}</span>
                              </div>
                            )}
                            {customer.phone && (
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span>Phone: {customer.phone}</span>
                              </div>
                            )}
                            {customer.state && (
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                <span>State: {customer.state}</span>
                              </div>
                            )}
                            {customer.city && (
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>City: {customer.city}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          Created: {new Date(customer.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Related Sales */}
                      {customer.sales && customer.sales.length > 0 ? (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Related Sales ({customer.sales.length})
                          </h4>
                          <div className="space-y-2">
                            {customer.sales.map((sale) => (
                              <div
                                key={sale.id}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                                onClick={() => router.push(`/add-sale?id=${sale.id}`)}
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="text-sm font-medium text-gray-900">
                                    Sale #{sale.id}
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(sale.status || '')}`}>
                                    {getStatusDisplayName(sale.status) || 'N/A'}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(sale.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                          No sales associated with this customer
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {paginationInfo.totalItems > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                      disabled={loading}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span className="text-sm text-gray-700">per page</span>
                  </div>

                  {/* Pagination info */}
                  <div className="text-sm text-gray-700">
                    Showing {((paginationInfo.currentPage - 1) * paginationInfo.itemsPerPage) + 1} to{' '}
                    {Math.min(paginationInfo.currentPage * paginationInfo.itemsPerPage, paginationInfo.totalItems)} of{' '}
                    {paginationInfo.totalItems} results
                  </div>

                  {/* Pagination buttons */}
                  {paginationInfo.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviousPage}
                        disabled={!paginationInfo.hasPrevPage || loading}
                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, paginationInfo.totalPages) }, (_, i) => {
                          let pageNum;
                          if (paginationInfo.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (paginationInfo.currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (paginationInfo.currentPage >= paginationInfo.totalPages - 2) {
                            pageNum = paginationInfo.totalPages - 4 + i;
                          } else {
                            pageNum = paginationInfo.currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              disabled={loading}
                              className={`px-3 py-2 text-sm font-medium rounded-md ${
                                pageNum === paginationInfo.currentPage
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={handleNextPage}
                        disabled={!paginationInfo.hasNextPage || loading}
                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

