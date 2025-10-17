'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Table from './Table';
import DateFilter from './DateFilter';
import ProtectedRoute from './ProtectedRoute';
import SalesTimeline from './SalesTimeline';
import AppointmentSummary from './AppointmentSummary';
import { useAuth } from '../contexts/AuthContext';
import { useFilterStorage } from '../lib/useFilterStorage';

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  
  // Save filter state to localStorage
  const { filters, updateFilter } = useFilterStorage('homeFilters', {
    status: '',
    dateFilter: 'today'
  });
  
  // Extract filter values
  const status = filters.status;
  const dateFilter = filters.dateFilter;
  
  // Other state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [paginationInfo, setPaginationInfo] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 5,
    hasNextPage: false,
    hasPrevPage: false
  });
  
  // Supervisor-specific state
  const [supervisedAgents, setSupervisedAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showingSupervisorSales, setShowingSupervisorSales] = useState(true); // Default to showing supervisor's own sales
  
  
  // Timeline modal state
  const [isTimelineModalVisible, setIsTimelineModalVisible] = useState(false);
  const [selectedTimelineSaleId, setSelectedTimelineSaleId] = useState(null);


  // Set supervised agents from user session data
  const initializeSupervisedAgents = () => {
    if (user?.role !== 'supervisor' || !user?.supervisedAgents) return;
    
    // Convert supervised agents data to match the expected format
    const agentsData = user.supervisedAgents.map(agent => ({
      agent: agent
    }));
    
    setSupervisedAgents(agentsData);
    
    // Set first agent as default selected if available
    if (agentsData.length > 0) {
      setSelectedAgent(agentsData[0].agent);
    }
  };

  // Fetch sales data from API
  const fetchSalesData = async (statusFilter = '', dateFilterValue = dateFilter, agentId = null, page = currentPage, limit = itemsPerPage) => {
    setLoading(true);
    setError(null);
    try {
      console.log('fetchSalesData called with user:', user?.role, 'showingSupervisorSales:', showingSupervisorSales, 'selectedAgent:', selectedAgent?.id);
      
      // Build URL with filters
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (dateFilterValue) params.append('dateFilter', dateFilterValue);
      
      // Add pagination parameters
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      // Add user information for role-based filtering
      if (user?.role === 'supervisor') {
        // For supervisors, default to their own sales, or show selected agent's sales
        const targetUserId = agentId || (selectedAgent?.id || user.id);
        if (targetUserId) {
          params.append('userId', targetUserId);
          if (selectedAgent && !showingSupervisorSales) {
            params.append('userRole', 'agent');
            console.log('Supervisor API: Showing agent sales for', selectedAgent.firstName);
          } else {
            // Default to supervisor's own sales
            params.append('userRole', 'supervisor_own');
            console.log('Supervisor API: Showing supervisor own sales for', user.first_name);
          }
        }
      } else {
        // For other roles, show their own data
        if (user) {
          params.append('userId', user.id);
          params.append('userRole', user.role);
        }
      }
      
      const url = `/api/sales${params.toString() ? `?${params.toString()}` : ''}`;
      console.log('API URL:', url);
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setSalesData(result.data);
        if (result.pagination) {
          setPaginationInfo(result.pagination);
        }
      } else {
        setError(result.message || 'Failed to fetch sales data');
      }
    } catch (err) {
      setError('Network error: Unable to fetch sales data');
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initialize supervised agents for supervisors from session data
  useEffect(() => {
    if (user?.role === 'supervisor') {
      initializeSupervisedAgents();
      // Ensure supervisor starts with their own sales view
      setShowingSupervisorSales(true);
      setSelectedAgent(null);
    }
  }, [user]);

  // Load sales data on component mount and when status, date filter, selected agent, or pagination changes
  useEffect(() => {
    if (user?.role === 'supervisor') {
      // For supervisors, always load data (default to their own sales)
      // Only fetch if we have the proper state initialized
      if (showingSupervisorSales !== undefined) {
        fetchSalesData(status, dateFilter, null, currentPage, itemsPerPage);
      }
    } else if (user?.role && user?.role !== 'supervisor') {
      fetchSalesData(status, dateFilter, null, currentPage, itemsPerPage);
    }
  }, [user, status, dateFilter, selectedAgent, showingSupervisorSales, currentPage, itemsPerPage]);


  // Handler functions for supervisor interface
  const handleAgentSelect = (agent) => {
    setSelectedAgent(agent);
    setShowingSupervisorSales(false);
    setCurrentPage(1); // Reset to first page when switching agents
  };

  const handleShowSupervisorSales = () => {
    setShowingSupervisorSales(true);
    setSelectedAgent(null);
    setCurrentPage(1); // Reset to first page when switching views
  };

  // Pagination control functions
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
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

  // Sales table columns configuration
  const salesColumns = [
    {
      header: 'ID',
      key: 'id',
      className: 'font-medium text-gray-900'
    },
    {
      header: 'Status',
      key: 'status',
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value === 'active' ? 'bg-green-100 text-green-800' :
          value === 'pending' ? 'bg-yellow-100 text-yellow-800' :
          value === 'completed' ? 'bg-blue-100 text-blue-800' :
          'bg-red-100 text-red-800'
        }`}>
          {value ? value.charAt(0).toUpperCase() + value.slice(1) : 'N/A'}
        </span>
      )
    },
    {
      header: 'Customer Name',
      key: 'customer',
      render: (customer) => (
        <span className="font-medium text-gray-900">
          {customer?.firstName || 'N/A'}
        </span>
      )
    },
    {
      header: 'Landline No',
      key: 'customer',
      render: (customer) => (
        <span className="text-gray-500">
          {customer?.landline || 'N/A'}
        </span>
      )
    },
    {
      header: 'Cell No',
      key: 'customer',
      render: (customer) => (
        <span className="text-gray-500">
          {customer?.phone || 'N/A'}
        </span>
      )
    },
    {
      header: 'Created Date',
      key: 'created_at',
      render: (value) => (
        <span className="text-gray-500">
          {new Date(value).toLocaleDateString()}
        </span>
      )
    },
    {
      header: 'Payment Status',
      key: 'paymentStatus',
      render: (value, row) => {
        const hasCards = row.cards && row.cards.length > 0;
        const hasBanks = row.banks && row.banks.length > 0;
        const hasPayments = hasCards || hasBanks;
        
        // Show existing payment status
        if (hasPayments) {
          const paymentTypes = [];
          if (hasCards) paymentTypes.push(`${row.cards.length} Card${row.cards.length > 1 ? 's' : ''}`);
          if (hasBanks) paymentTypes.push(`${row.banks.length} Bank${row.banks.length > 1 ? 's' : ''}`);
          
          return (
            <div className="flex flex-col">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-1">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {paymentTypes.join(', ')}
              </span>
              <span className="text-xs text-gray-500">
                {hasCards && hasBanks ? 'Cards & Banks' : hasCards ? 'Cards only' : 'Banks only'}
              </span>
            </div>
          );
        }
        
        return (
          <span className="text-gray-400 text-sm">No payments</span>
        );
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (value, row) => {
        const hasCards = row.cards && row.cards.length > 0;
        const hasBanks = row.banks && row.banks.length > 0;
        const hasPayments = hasCards || hasBanks;
        
        return (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(row.id);
              }}
              className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors duration-200"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Sale
            </button>
            {hasPayments && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewPayment(row.id);
                }}
                className="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors duration-200"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Payment
              </button>
            )}
            {user?.role === 'admin' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTimelineSaleId(row.id);
                  setIsTimelineModalVisible(true);
                }}
                className="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors duration-200"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Timeline
              </button>
            )}
          </div>
        );
      }
    }
  ];

  const handleRowClick = (row, index) => {
    console.log('Sale clicked:', row, 'Index:', index);
    // You can add navigation or modal opening logic here
  };

  const handleFilterChange = (filterValue) => {
    console.log('Date filter changed:', filterValue);
    updateFilter('dateFilter', filterValue);
    setCurrentPage(1); // Reset to first page when changing filters
    // Fetch sales data with the new date filter
    fetchSalesData(status, filterValue, null, 1, itemsPerPage);
  };

  const handleStatusChange = (e) => {
    updateFilter('status', e.target.value);
    setCurrentPage(1); // Reset to first page when changing filters
    // Fetch sales data with the new status filter
    fetchSalesData(e.target.value, dateFilter, null, 1, itemsPerPage);
  };

  const clearStatus = () => {
    updateFilter('status', '');
    setCurrentPage(1); // Reset to first page when clearing filters
    // Fetch sales data without status filter
    fetchSalesData('', dateFilter, null, 1, itemsPerPage);
  };

  const handleRefresh = () => {
    fetchSalesData(status, dateFilter, null, currentPage, itemsPerPage);
  };

  const handleEdit = (saleId) => {
    console.log('Edit sale:', saleId);
    // Navigate to add-sale page with edit mode
    router.push(`/add-sale?id=${saleId}`);
  };

  const handleViewPayment = (saleId) => {
    // Redirect to dedicated payments page to view all payment information
    router.push(`/payments?saleId=${saleId}`);
  };


  const formatDate = (date) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  };

  // Format sales data for display
  const formatSalesData = (data) => {
    return data.map(sale => ({
      ...sale,
      // Ensure all required fields are present
      customerName: sale.customerName || `${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}`.trim(),
      landlineNo: sale.landlineNo || sale.customer?.phone || '',
      cellNo: sale.cellNo || '',
      carrier: sale.carrier || '',
      basicPackage: sale.basicPackage || ''
    }));
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Sales Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Welcome back, {user?.first_name || 'User'}! Here&apos;s your sales performance and activities.
              </p>
              {user?.role === 'agent' && user?.supervisor && (
                <p className="mt-2 text-sm text-green-600 font-medium">
                  Your Supervisor: {user.supervisor.firstName} {user.supervisor.lastName}
                </p>
              )}
            </div>
            <div className="mt-4 sm:mt-0 flex space-x-3">
              <button 
                onClick={() => router.push('/add-sale')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
              >
                Add New Sale
              </button>
            </div>
        </div>
      </div>
      </div>

      {/* Supervisor Agent Selection Interface */}
      {user?.role === 'supervisor' && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">View sales for:</span>
              
              {/* Me Button */}
              <button
                onClick={handleShowSupervisorSales}
                disabled={loading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  loading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : showingSupervisorSales
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Me ({user?.first_name})
              </button>
              
              {/* Agent Buttons */}
              {supervisedAgents.map((relationship) => (
                <button
                  key={relationship.agent.id}
                  onClick={() => handleAgentSelect(relationship.agent)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                    loading
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : selectedAgent?.id === relationship.agent.id
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {relationship.agent.firstName} {relationship.agent.lastName}
                </button>
              ))}
              
              {supervisedAgents.length === 0 && !loading && (
                <span className="text-sm text-gray-500 italic">No agents assigned</span>
              )}
            </div>
            
            {/* Current View Indicator */}
            <div className="mt-3 text-sm text-gray-600">
              {showingSupervisorSales ? (
                <span>Showing your sales data</span>
              ) : selectedAgent ? (
                <span>
                  Showing sales data for <strong>{selectedAgent.firstName} {selectedAgent.lastName}</strong>
                </span>
              ) : (
                <span>Select an agent or "Me" to view sales data</span>
              )}
            </div>
          </div>
        </div>
      )}

        {/* Main Content */}
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Appointment Summary */}
        <div className="mb-8">
          <AppointmentSummary />
        </div>

        {/* Date Filter */}
        <div className="mb-8 flex justify-center">
          <DateFilter onFilterChange={handleFilterChange} value={dateFilter} />
        </div>

        {/* Sales Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Sales Management</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {loading ? 'Loading sales data...' : `Showing ${salesData.length} sales`}
                </p>
              </div>
               {/* Status Filter */}
            <div className="flex gap-2 justify-end mb-6">
            <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              <div className="min-w-[250px] flex gap-2">
                <select
                  id="status"
                  value={status}
                  onChange={handleStatusChange}
                  disabled={loading}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={clearStatus}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200"
                >
                  Clear
                </button>
              </div>
            </div>
            </div>


            {error ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-600 text-lg mb-4">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors duration-200"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <Table
                  data={formatSalesData(salesData)}
                  columns={salesColumns}
                  itemsPerPage={itemsPerPage}
                  onRowClick={handleRowClick}
                  emptyMessage={loading ? "Loading sales data..." : "No sales found for the selected criteria"}
                />
                
                {/* Pagination Controls */}
                {paginationInfo.totalPages > 1 && (
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviousPage}
                        disabled={!paginationInfo.hasPrevPage || loading}
                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      
                      {/* Page numbers */}
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
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      


      {/* Sales Timeline Modal */}
      <SalesTimeline
        isOpen={isTimelineModalVisible}
        onClose={() => {
          setIsTimelineModalVisible(false);
          setSelectedTimelineSaleId(null);
        }}
        saleId={selectedTimelineSaleId}
      />
      </div>
    </ProtectedRoute>
  );
}
