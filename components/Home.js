'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Table from './Table';
import DateFilter from './DateFilter';
import ProtectedRoute from './ProtectedRoute';
import SalesTimeline from './SalesTimeline';
import AppointmentSummary from './AppointmentSummary';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useFilterStorage } from '../lib/useFilterStorage';
import apiClient from '../lib/apiClient';
import { SALES_STATUSES, SALES_STATUS_ARRAY, getStatusBadgeClasses, getStatusDisplayName, getTagDisplayName, getTagBadgeClasses, SALE_TAGS, DISPLAY_TAGS, hasTag } from '../lib/salesStatuses';
import StatusMultiSelect from './StatusMultiSelect';
import { formatLandline, formatPhoneNumber } from '../lib/validation';
import { downloadSaleDoc, buildTableRows, DOC_TABLE_STYLE, DOC_TABLE_COLGROUP } from '../lib/docUtils';

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();

  const buildPaymentSections = (sale) => {
    const cards = Array.isArray(sale?.cards) ? sale.cards : [];
    const banks = Array.isArray(sale?.banks) ? sale.banks : [];

    const cardSections = cards
      .map((card, idx) => {
        const rows = [
          { label: 'Card Type', value: card?.cardType || card?.card_type },
          { label: 'Provider', value: card?.provider },
          { label: 'Customer Name', value: card?.customerName || card?.customer_name },
          { label: 'Masked Card Number', value: card?.maskedCardNumber || card?.masked_card_number || card?.cardNumber || card?.card_number },
          { label: 'Expiry Date', value: card?.expiryDate || card?.expiry_date },
          { label: 'Notes', value: card?.notes }
        ];

        return `
          <h3 style="margin-top: 16px; font-size: 16px; color: #1f2937;">Card ${idx + 1}</h3>
          <table style="${DOC_TABLE_STYLE}">
            ${DOC_TABLE_COLGROUP}
            ${buildTableRows(rows)}
          </table>
        `;
      })
      .join('');

    const bankSections = banks
      .map((bank, idx) => {
        const rows = [
          { label: 'Bank Name', value: bank?.bankName || bank?.bank_name },
          { label: 'Account Holder', value: bank?.accountHolder || bank?.account_holder },
          { label: 'Masked Account Number', value: bank?.maskedAccountNumber || bank?.masked_account_number || bank?.accountNumber || bank?.account_number },
          { label: 'Routing Number', value: bank?.routingNumber || bank?.routing_number },
          { label: 'Check Number', value: bank?.checkNumber || bank?.check_number },
          { label: 'Notes', value: bank?.notes }
        ];

        return `
          <h3 style="margin-top: 16px; font-size: 16px; color: #1f2937;">Bank ${idx + 1}</h3>
          <table style="${DOC_TABLE_STYLE}">
            ${DOC_TABLE_COLGROUP}
            ${buildTableRows(rows)}
          </table>
        `;
      })
      .join('');

    if (!cardSections && !bankSections) {
      return `
        <table style="${DOC_TABLE_STYLE}">
          ${DOC_TABLE_COLGROUP}
          ${buildTableRows([{ label: 'Payment Methods', value: 'No payment information available' }])}
        </table>
      `;
    }

    return `
      ${cardSections || ''}
      ${bankSections || ''}
    `;
  };

  const handleDownloadSaleDoc = (sale) => {
    if (!sale) return;

    try {
      const saleId = sale.id || sale.saleId || sale.sale_id || sale.uuid || 'sale';
      const customerFirstName = sale?.customer?.firstName || sale?.customerName || 'customer';
      const fileName = `${customerFirstName.toString().trim().replace(/\s+/g, '-').toLowerCase()}-sale-${saleId}.doc`;

      const customer = sale.customer || {};

      const saleRows = [
        { label: 'Sale ID', value: saleId },
        { label: 'Status', value: getStatusDisplayName(sale?.status) || sale?.status },
        { label: 'Agent ID', value: sale?.agentId },
        { label: 'Customer ID', value: sale?.customerId },
        { label: 'Created At', value: sale?.created_at || sale?.createdAt ? formatDateTimeShort(sale.created_at ?? sale.createdAt) : 'N/A' },
        { label: 'Updated At', value: sale?.updated_at || sale?.updatedAt ? formatDateTimeShort(sale.updated_at ?? sale.updatedAt) : 'N/A' },
        { label: 'Spoke To', value: sale?.spokeTo || sale?.spoke_to },
        { label: 'PIN Code', value: sale?.pinCode || sale?.pin_code },
        { label: 'Carrier', value: sale?.carrier },
        { label: 'Bundle', value: sale?.bundle },
        { label: 'Company', value: sale?.company },
        { label: 'Notes', value: sale?.notes }
      ];

      const customerRows = [
        { label: 'First Name', value: customer?.firstName },
        { label: 'Last Name', value: customer?.lastName },
        { label: 'Email', value: customer?.email },
        { label: 'Phone', value: customer?.phone },
        { label: 'Landline', value: customer?.landline },
        { label: 'City', value: customer?.city },
        { label: 'State', value: customer?.state },
        { label: 'Country', value: customer?.country },
        { label: 'Address', value: customer?.address }
      ];

      const paymentContent = buildPaymentSections(sale);

      downloadSaleDoc({
        fileName,
        saleRows,
        customerRows,
        paymentContent
      });
    } catch (error) {
      console.error('Failed to generate sale document:', error);
    }
  };

  // Save filter state to localStorage
  const { filters, updateFilter } = useFilterStorage('homeFilters', {
    statuses: [], // Changed from 'status' string to 'statuses' array for multi-select
    dateFilter: 'today',
    dateField: 'created_at',
    numberSearch: '',
    idSearch: '',
    searchLastFour: false // Toggle for searching last 4 digits only
  });
  
  // Extract filter values
  const statuses = Array.isArray(filters.statuses) ? filters.statuses : (filters.statuses ? [filters.statuses] : []);
  const dateFilter = filters.dateFilter;
  const dateField = filters.dateField;
  const numberSearch = filters.numberSearch;
  const idSearch = filters.idSearch || '';
  const searchLastFour = filters.searchLastFour;
  
  // Other state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Debounced number search state
  const [debouncedNumberSearch, setDebouncedNumberSearch] = useState(numberSearch);
  const [debouncedIdSearch, setDebouncedIdSearch] = useState(idSearch);
  
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
  const [showingSupervisorSales, setShowingSupervisorSales] = useState(undefined); // Only set for supervisors
  
  // Load supervisor view state from localStorage
  const loadSupervisorViewState = () => {
    try {
      const savedState = localStorage.getItem('supervisorViewState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        return {
          showingSupervisorSales: parsed.showingSupervisorSales ?? true,
          selectedAgentId: parsed.selectedAgentId ?? null
        };
      }
    } catch (error) {
      console.error('Error loading supervisor view state from localStorage:', error);
    }
    
    return {
      showingSupervisorSales: true,
      selectedAgentId: null
    };
  };
  
  // Save supervisor view state to localStorage
  const saveSupervisorViewState = (showingOwnSales, agentId) => {
    try {
      localStorage.setItem('supervisorViewState', JSON.stringify({
        showingSupervisorSales: showingOwnSales,
        selectedAgentId: agentId
      }));
    } catch (error) {
      console.error('Error saving supervisor view state to localStorage:', error);
    }
  };
  
  // Admin-specific state
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  
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
    
    // Load saved view state from localStorage
    const savedState = loadSupervisorViewState();
    setShowingSupervisorSales(savedState.showingSupervisorSales);
    
    // Restore selected agent if one was saved and it still exists in supervised agents
    if (savedState.selectedAgentId && !savedState.showingSupervisorSales) {
      const savedAgent = agentsData.find(item => item.agent.id === savedState.selectedAgentId);
      if (savedAgent) {
        setSelectedAgent(savedAgent.agent);
      } else {
        // Saved agent no longer exists, fall back to first agent or null
        setSelectedAgent(agentsData.length > 0 ? agentsData[0].agent : null);
      }
    } else {
      setSelectedAgent(null);
    }
  };

  // Fetch all users for admin filter
  const fetchAllUsers = async () => {
    if (user?.role !== 'admin') return;
    
    try {
      const response = await apiClient.get('/api/users');
      const result = await response.json();
      
      if (result.success && result.data) {
        const users = result.data
          .filter(u => u.is_active === true)
          .map(u => ({
            id: u.id,
            firstName: u.firstName || u.first_name || '',
            lastName: u.lastName || u.last_name || '',
            email: u.email,
            role: u.role
          }));
        setAllUsers(users);
        // Clear selected user if they are no longer active
        setSelectedUserId(prev => (prev && users.some(u => u.id === prev) ? prev : null));
      }
    } catch (error) {
      console.error('Error fetching users for admin filter:', error);
    }
  };

  // Fetch sales data from API
  // options.silent = true: refresh without showing loader (e.g. real-time update from socket)
  const fetchSalesData = async (statusesFilter = [], dateFilterValue = dateFilter, agentId = null, page = currentPage, limit = itemsPerPage, dateFieldValue = dateField, numberSearchValue = numberSearch, searchLastFourValue = searchLastFour, idSearchValue = debouncedIdSearch, options = {}) => {
    const { silent = false } = options;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      console.log('fetchSalesData called with user:', user?.role, 'showingSupervisorSales:', showingSupervisorSales, 'selectedAgent:', selectedAgent?.id);
      
      // Ensure we always have a date filter - default to 'today' if none provided
      const effectiveDateFilter = dateFilterValue || 'today';
      const effectiveDateField = dateFieldValue || 'created_at';
      
      // Build URL with filters
      const params = new URLSearchParams();
      // Handle multiple statuses - pass as comma-separated string
      const statusArray = Array.isArray(statusesFilter) ? statusesFilter : (statusesFilter ? [statusesFilter] : []);
      if (statusArray.length > 0) params.append('status', statusArray.join(','));
      params.append('dateFilter', effectiveDateFilter);
      params.append('dateField', effectiveDateField);
      if (numberSearchValue) {
        params.append('numberSearch', numberSearchValue);
        params.append('searchLastFour', searchLastFourValue ? 'true' : 'false');
      }
      if (idSearchValue) {
        params.append('idSearch', idSearchValue);
      }
      
      // Add pagination parameters
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      // Add user information for role-based filtering
      if (user?.role === 'supervisor') {
        // For supervisors, show selected agent's sales or all supervised agents' sales
        if (selectedAgent && !showingSupervisorSales) {
          params.append('agentId', selectedAgent.id);
          console.log('Supervisor API: Showing agent sales for', selectedAgent.firstName);
        } else {
          // Default to all supervised agents' sales - no additional parameters needed
          console.log('Supervisor API: Showing all supervised agents sales for', user.first_name);
        }
      } else if (user?.role === 'admin') {
        // For admins, show selected user's sales or all sales
        if (selectedUserId) {
          params.append('agentId', selectedUserId);
        }
      } else {
        // For agents, show their own data - no additional parameters needed (JWT handles authentication)
        console.log('API: Showing user data for', user.first_name, 'role:', user.role);
      }
      
      const url = `/api/sales${params.toString() ? `?${params.toString()}` : ''}`;
      console.log('API URL:', url);
      
      // Use authenticated fetch with JWT token and automatic refresh
      const response = await apiClient.get(url);
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
      if (!silent) setError('Network error: Unable to fetch sales data');
      console.error('Error fetching sales:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initialize supervised agents for supervisors
  useEffect(() => {
    if (user?.role === 'supervisor') {
      initializeSupervisedAgents();
    }
  }, [user]);

  // Fetch all users for admin filter
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAllUsers();
    }
  }, [user]);

  // Save supervisor view state to localStorage whenever it changes
  useEffect(() => {
    if (user?.role === 'supervisor' && showingSupervisorSales !== undefined) {
      saveSupervisorViewState(showingSupervisorSales, selectedAgent?.id || null);
    }
  }, [user, showingSupervisorSales, selectedAgent]);

  // Debounce number search - wait 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedNumberSearch(numberSearch);
    }, 500); // 500ms delay

    return () => {
      clearTimeout(timer);
    };
  }, [numberSearch]);

  // Debounce ID search - wait 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedIdSearch(idSearch);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [idSearch]);

  // Listen for sale_updated from socket: refresh sales table without loader when on home and the update is relevant
  useEffect(() => {
    if (!socket || !isConnected || !user?.id) return;

    const handleSaleUpdated = (payload) => {
      const { agentId } = payload || {};
      if (pathname !== '/') return;

      const isAgentView = user.role === 'agent' && agentId === user.id;
      const isSupervisorOnAgentTab = user.role === 'supervisor' && !showingSupervisorSales && selectedAgent?.id === agentId;

      if (isAgentView || isSupervisorOnAgentTab) {
        fetchSalesData(statuses, dateFilter, null, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch, { silent: true });
      }
    };

    socket.on('sale_updated', handleSaleUpdated);
    return () => {
      socket.off('sale_updated', handleSaleUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, pathname, user?.id, user?.role, showingSupervisorSales, selectedAgent?.id, statuses, dateFilter, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch]);

  // Load sales data when user, filters, pagination, or supervisor view changes
  useEffect(() => {
    // Only fetch data if user is loaded and we have valid filters
    if (!user?.role) return;
    
    if (user.role === 'supervisor') {
      // Only fetch for supervisors if showingSupervisorSales is set (initialized)
      if (showingSupervisorSales !== undefined) {
        fetchSalesData(statuses, dateFilter, null, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
      }
    } else if (user.role === 'admin') {
      // For admins, pass selectedUserId as agentId parameter
      fetchSalesData(statuses, dateFilter, selectedUserId, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
    } else {
      // For agents, fetch data directly (no supervisor dependencies)
      fetchSalesData(statuses, dateFilter, null, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statuses, dateFilter, dateField, currentPage, itemsPerPage, debouncedNumberSearch, searchLastFour, debouncedIdSearch,
      // Supervisor-specific dependencies only trigger for supervisors due to conditional logic above
      selectedAgent, showingSupervisorSales, selectedUserId]);


  // Handler functions for supervisor interface
  const handleAgentSelect = (agent) => {
    setSelectedAgent(agent);
    setShowingSupervisorSales(false);
    setCurrentPage(1); // Reset to first page when switching agents
    // Save to localStorage
    saveSupervisorViewState(false, agent?.id || null);
  };

  const handleShowSupervisorSales = () => {
    setShowingSupervisorSales(true);
    setSelectedAgent(null);
    setCurrentPage(1); // Reset to first page when switching views
    // Save to localStorage
    saveSupervisorViewState(true, null);
  };

  // Handler functions for admin interface
  const handleUserSelect = (e) => {
    const userId = e.target.value ? parseInt(e.target.value) : null;
    setSelectedUserId(userId);
    setCurrentPage(1); // Reset to first page when switching users
  };

  const clearUserFilter = () => {
    setSelectedUserId(null);
    setCurrentPage(1); // Reset to first page when clearing filter
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

  const salesStickyIdHeader =
    'sticky left-0 z-50 bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[80px]';
  const salesStickyIdBody =
    'sticky left-0 z-20 bg-white group-hover:bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[80px]';
  const salesStickyNameHeader =
    'sticky left-[80px] z-40 bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[200px]';
  const salesStickyNameBody =
    'sticky left-[80px] z-30 bg-white group-hover:bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[200px]';
  const salesStickyLandlineHeader =
    'sticky left-[280px] z-[60] bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[128px]';
  const salesStickyLandlineBody =
    'sticky left-[280px] z-40 bg-white group-hover:bg-gray-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] min-w-[128px]';

  // Sales table columns — fixed: ID, Customer Name, Landline; then Status
  const salesColumns = [
    {
      header: 'ID',
      key: 'id',
      className: 'font-medium text-gray-900',
      stickyHeaderClass: salesStickyIdHeader,
      stickyBodyClass: salesStickyIdBody
    },
    {
      header: 'Customer Name',
      key: 'customer',
      className: 'text-gray-900',
      stickyHeaderClass: salesStickyNameHeader,
      stickyBodyClass: salesStickyNameBody,
      render: (customer) => (
        <span className="font-medium text-gray-900">
          {customer?.firstName || 'N/A'}
        </span>
      )
    },
    {
      header: 'Landline No',
      key: 'customer',
      className: 'text-gray-500',
      stickyHeaderClass: salesStickyLandlineHeader,
      stickyBodyClass: salesStickyLandlineBody,
      render: (customer) => (
        <span className="text-gray-600">
          {customer?.landline ? formatLandline(customer.landline) : 'N/A'}
        </span>
      )
    },
    {
      header: 'Status',
      key: 'status',
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(value || '')}`}>
          {getStatusDisplayName(value) || 'N/A'}
        </span>
      )
    },
    {
      header: 'Cell No',
      key: 'customer',
      render: (customer) => (
        <span className="text-gray-500">
          {customer?.phone ? formatPhoneNumber(customer.phone) : 'N/A'}
        </span>
      )
    },
    ...(user?.role === 'admin'
      ? [{
          header: 'Agent Name',
          key: 'agent',
          render: (agent) => (
            <span className="text-gray-700">
              {agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'N/A' : 'N/A'}
            </span>
          )
        }]
      : []),
    {
      header: 'Created',
      key: 'createdAt',
      render: (value, row) => {
        const dateVal = value ?? row?.created_at;
        return (
          <span className="text-gray-500 text-sm whitespace-nowrap">
            {formatDateTimeShort(dateVal)}
          </span>
        );
      }
    },
    {
      header: 'Updated',
      key: 'updatedAt',
      render: (value, row) => {
        const dateVal = value ?? row?.updated_at;
        return (
          <span className="text-gray-500 text-sm whitespace-nowrap">
            {formatDateTimeShort(dateVal)}
          </span>
        );
      }
    },
    {
      header: 'Tags',
      key: 'tags',
      cellClassName: 'text-gray-700 align-top max-w-xs whitespace-normal',
      render: (tags, row) => {
        // Get tags from sale
        const saleTags = Array.isArray(tags) ? tags : (tags ? [tags] : []);
        const displayTags = [...saleTags];

        // When status is active and sale does NOT have verification tag, show "Verification required"
        if (row.status === SALES_STATUSES.ACTIVE && !hasTag(saleTags, SALE_TAGS.VERIFICATION) && !displayTags.includes(DISPLAY_TAGS.VERIFICATION_REQUIRED)) {
          displayTags.push(DISPLAY_TAGS.VERIFICATION_REQUIRED);
        }

        // When processing required is true (hide when null/false) and sale does NOT have process tag, show "Processing required"
        const processingRequired = row.processingRequired ?? row.processing_required ?? null;
        if (processingRequired === true && !hasTag(saleTags, SALE_TAGS.PROCESS) && !displayTags.includes(DISPLAY_TAGS.PROCESSING_REQUIRED)) {
          displayTags.push(DISPLAY_TAGS.PROCESSING_REQUIRED);
        }

        // Customer-based: show payment-info tag if this customer has any payment on any sale
        const customerHasPayments = row.customerHasPayments === true;
        const hasPayments = customerHasPayments;

        // Automatically include payment-info tag if customer has payments
        if (hasPayments && !displayTags.includes(SALE_TAGS.PAYMENT_INFO)) {
          displayTags.push(SALE_TAGS.PAYMENT_INFO);
        }

        if (displayTags.length === 0) {
          return <span className="text-gray-400 text-sm">No tags</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {displayTags.map((tag, index) => (
              <span
                key={index}
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTagBadgeClasses(tag)}`}
              >
                {getTagDisplayName(tag)}
              </span>
            ))}
          </div>
        );
      }
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (value, row) => {
        // Customer-based: show View Payment if this customer has any payment on any sale
        const hasPayments = row.customerHasPayments === true;
        
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
                  handleViewPayment(row.id, row.customerId);
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
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSaleDoc(row);
                  }}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition-colors duration-200"
                  title="Download Sale DOC"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  <span className="sr-only">Download sale document</span>
                </button>
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
              </>
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
    fetchSalesData(statuses, filterValue, null, 1, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
  };

  const handleStatusChange = (newStatuses) => {
    updateFilter('statuses', newStatuses);
    setCurrentPage(1); // Reset to first page when changing filters
    // Fetch sales data with the new status filter
    fetchSalesData(newStatuses, dateFilter, null, 1, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
  };

  const clearStatuses = () => {
    updateFilter('statuses', []);
    setCurrentPage(1); // Reset to first page when clearing filters
    // Fetch sales data without status filter
    fetchSalesData([], dateFilter, null, 1, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
  };

  const handleNumberSearchChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    updateFilter('numberSearch', value);
    setCurrentPage(1); // Reset to first page when changing search
    // Note: Actual search will be triggered by debouncedNumberSearch via useEffect
  };

  const handleIdSearchChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    updateFilter('idSearch', value);
    setCurrentPage(1);
  };

  const clearIdSearch = () => {
    updateFilter('idSearch', '');
    setDebouncedIdSearch('');
    setCurrentPage(1);
  };

  const clearNumberSearch = () => {
    updateFilter('numberSearch', '');
    setDebouncedNumberSearch(''); // Immediately clear debounced value
    setCurrentPage(1); // Reset to first page when clearing search
  };

  const handleSearchLastFourToggle = (e) => {
    updateFilter('searchLastFour', e.target.checked);
    setCurrentPage(1); // Reset to first page when changing search mode
  };

  const handleRefresh = () => {
    fetchSalesData(statuses, dateFilter, null, currentPage, itemsPerPage, dateField, debouncedNumberSearch, searchLastFour, debouncedIdSearch);
  };

  const handleEdit = (saleId) => {
    console.log('Edit sale:', saleId);
    // Navigate to add-sale page with edit mode
    router.push(`/add-sale?id=${saleId}`);
  };

  const handleViewPayment = (saleId, customerId) => {
    // Redirect to payments page with both sale and customer so page can show "this sale" or "all customer payments"
    if (customerId && saleId) {
      router.push(`/payments?customerId=${customerId}&saleId=${saleId}`);
    } else if (customerId) {
      router.push(`/payments?customerId=${customerId}`);
    } else {
      router.push(`/payments?saleId=${saleId}`);
    }
  };


  const formatDate = (date) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  };

  // Last-seen style: "2 Feb, 26, 2:30 PM"
  const formatDateTimeShort = (dateVal) => {
    if (!dateVal) return 'N/A';
    const d = new Date(dateVal);
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.toLocaleString('en-US', { year: '2-digit' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${day} ${month}, ${year}, ${timeStr}`;
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Sales Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Welcome back, {user?.first_name || 'User'}! Here's your sales performance and activities.
              </p>
              {user?.role === 'agent' && user?.supervisor && (
                <p className="mt-2 text-sm text-green-600 font-medium">
                  Your Supervisor: {user.supervisor.firstName} {user.supervisor.lastName}
                </p>
              )}
            </div>
        </div>
      </div>
      </div>

        {/* Main Content */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

        {/* Appointment Summary */}
        <div className="mb-8">
          <AppointmentSummary />
        </div>

        {/* Date Filter */}
        <div className="mb-8 flex justify-center">
          <DateFilter 
            onFilterChange={handleFilterChange} 
            onDateFieldChange={(field) => updateFilter('dateField', field)}
            value={dateFilter} 
            dateField={dateField}
          />
        </div>

        {/* Supervisor Agent Selection Interface */}
        {user?.role === 'supervisor' && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
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
                Me (supervisor)
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
            <div className="text-sm text-gray-600">
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
        )}

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
               {/* Status Filter and User Filter (for Admin) */}
            <div className="flex gap-2 justify-end items-start flex-wrap">
            <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed h-[42px]"
                >
                  <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              <div className="flex gap-2 items-start">
                {/* Number Search */}
                <div className="w-[220px] flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Search by number..."
                      value={numberSearch}
                      onChange={handleNumberSearchChange}
                      disabled={loading}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed h-[42px]"
                      maxLength={20}
                    />
                    {numberSearch && (
                      <button
                        onClick={clearNumberSearch}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200 h-[42px]"
                        title="Clear number search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {numberSearch && numberSearch.length >= 4 && (
                    <label className="flex items-center gap-2 px-1 py-1.5 mt-1 bg-blue-50 border border-blue-200 rounded-md text-xs text-gray-700 cursor-pointer hover:bg-blue-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={searchLastFour}
                        onChange={handleSearchLastFourToggle}
                        disabled={loading}
                        className="w-3 h-3 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="font-medium">Last 4 only</span>
                    </label>
                  )}
                </div>
                {/* ID Search */}
                <div className="w-[170px] flex gap-2 items-start flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search by ID..."
                    value={idSearch}
                    onChange={handleIdSearchChange}
                    disabled={loading}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed h-[42px]"
                    maxLength={12}
                  />
                  {idSearch && (
                    <button
                      onClick={clearIdSearch}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200 h-[42px]"
                      title="Clear ID search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {/* User Filter (Admin only) */}
                {user?.role === 'admin' && (
                  <div className="w-[180px] flex gap-2 items-start flex-shrink-0">
                    <select
                      id="user"
                      value={selectedUserId || ''}
                      onChange={handleUserSelect}
                      disabled={loading}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed h-[42px]"
                    >
                      <option value="">All Users</option>
                      {allUsers.map((userItem) => (
                        <option key={userItem.id} value={userItem.id}>
                          {userItem.firstName} {userItem.lastName} ({userItem.role})
                        </option>
                      ))}
                    </select>
                    {selectedUserId && (
                      <button
                        onClick={clearUserFilter}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200 h-[42px]"
                        title="Clear user filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
                {/* Status Multi-Select Filter */}
                <div className="w-[200px] flex gap-2 items-start flex-shrink-0">
                  <div className="flex-1">
                    <StatusMultiSelect
                      selectedStatuses={statuses}
                      onChange={handleStatusChange}
                      disabled={loading}
                      placeholder="All Statuses"
                    />
                  </div>
                  {statuses.length > 0 && (
                    <button
                      onClick={clearStatuses}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200 h-[42px]"
                      title="Clear status filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
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
                  variant="management"
                />
                
                {/* Pagination Controls */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Items per page selector - Always visible */}
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

                  {/* Pagination info - Always visible if there are results */}
                  {paginationInfo.totalItems > 0 && (
                    <div className="text-sm text-gray-700">
                      Showing {((paginationInfo.currentPage - 1) * paginationInfo.itemsPerPage) + 1} to{' '}
                      {Math.min(paginationInfo.currentPage * paginationInfo.itemsPerPage, paginationInfo.totalItems)} of{' '}
                      {paginationInfo.totalItems} results
                    </div>
                  )}

                  {/* Pagination buttons - Only show when there's more than 1 page */}
                  {paginationInfo.totalPages > 1 && (
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
                  )}
                </div>
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
