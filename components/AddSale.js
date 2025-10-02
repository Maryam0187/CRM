'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DateModal from './DateModal';
import ReceiverModal from './ReceiverModal';
import StateSelector, { getStateTimezone, convertToUTC, convertFromUTC } from './StateSelector';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient.js';
import { 
  formatPhoneNumber, 
  formatCellNumber, 
  formatLandline,
  formatSSN,
  formatCurrency,
  formatDate,
  formatTime,
  validatePhoneNumber,
  validateSSN,
  validateCurrency 
} from '../lib/validation.js';

// Helper function to calculate time ago
const getTimeAgo = (dateString) => {
  if (!dateString) return 'No previous sales';
  
  const now = new Date();
  const pastDate = new Date(dateString);
  const diffInMs = now - pastDate;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return '1 day ago';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
};

export default function AddSale() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  // Check if we're in edit mode
  const editId = searchParams.get('id');
  const isEditMode = !!editId;
  
  // Customer form state
  const [customer, setCustomer] = useState({
    firstName: '',
    landline: '',
    phone: '',
    address: '',
    state: '',
    city: '',
    country: 'USA',
    mailingAddress: '',
    customerFeedback: ''
  });

  // Customer validation state
  const [customerValidation, setCustomerValidation] = useState({
    firstName: { isValid: true, message: '' },
    landline: { isValid: true, message: '' }
  });

  // Sale form state
  const [saleForm, setSaleForm] = useState({
    status: 'new', // Add status field
    spoke_to: '',
    pin_code: '',
    pin_code_status: '',
    ssnName: '',
    ssnNumber: '',
    carrier: '',
    basicPackage: '',
    basicPackageStatus: '',
    NoFTV: '',
    AccHolder: '',
    AccNumber: '',
    NoReceiver: '',
    question: '',
    answer: '',
    regularBill: '',
    promotionalBill: '',
    bundle: '',
    company: '',
    lastPayment: '',
    lastPaymentDate: '',
    breakdown: '',
    notes: '',
    balance: '',
    dueonDate: '',
    techVisitDate: '',
    techVisitTime: '',
    appointmentDateTime: '',
    services: [],
    receivers: {},
    receiversInfo: {}
  });

  // Modal states
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isReceiverModalOpen, setIsReceiverModalOpen] = useState(false);
  const [selectedReceiver, setSelectedReceiver] = useState([]);
  const [modalId, setModalId] = useState(null);
  const [saleStatus, setSaleStatus] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  
  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Dialog state for customer warning
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerWarning, setCustomerWarning] = useState(null);


  // System info for receiver modal
  const [systemInfo, setSystemInfo] = useState({
    receiverId: '',
    smartCardId: '',
    secureId: '',
    locationId: '',
    room: ''
  });

  // Step detection logic
  const getCurrentStep = () => {
    if (!saleForm.status) return 'first'; // Default to first step for new sales
    
    const status = saleForm.status.toLowerCase();
    console.log('Current sale status:', status, 'Edit mode:', isEditMode);
    
    // First step: initial contact (only for new sales or specific initial statuses)
    if (['new', 'lead', 'hang-up', 'voicemail', 'no_response'].includes(status)) {
      console.log('Detected as first step');
      return 'first';
    }
    
    // Third step: processing (only when status is pending for charge)
    if (['pending', 'verification', 'process', 'charge_pending'].includes(status)) {
      console.log('Detected as third step');
      return 'third';
    }
    
    // Admin step: final actions
    if (['completed', 'cancelled', 'approved', 'declined', 'done', 'chargeback'].includes(status)) {
      console.log('Detected as admin step');
      return 'admin';
    }
    
    // Second step: active engagement (for all other statuses including edit mode)
    // This includes: 'active', 'payment_info', 'appointment', 'second_call', 'customer_agree', etc.
    console.log('Detected as second step (default)');
    return 'second';
  };

  // Check if payment info has been added (cards or banks)
  const hasPaymentInfo = () => {
    // This will be updated when we implement card/bank detection
    return false;
  };

  // Options for dropdowns
  const packageStatusOptions = [
    { text: 'Same', value: 'same' },
    { text: 'Upgrade', value: 'upgrade' },
    { text: 'Downgrade', value: 'downgrade' }
  ];

  // State for carriers and receivers from database
  const [carriers, setCarriers] = useState([]);
  const [receivers, setReceivers] = useState([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [loadingReceivers, setLoadingReceivers] = useState(false);

  const serviceOptions = [
    'Tech Visit', 'Receiver Shipment', 'Remotely Upgrade', 'Remote Shipment'
  ];

  const timeOptions = ['8am - 12pm', '12pm - 4pm', '12pm - 5pm'];

  const companyOptions = ['Frontier', 'CenturyLink', 'Windstream'];

  // Fetch carriers from database
  const fetchCarriers = async () => {
    try {
      setLoadingCarriers(true);
      const response = await apiClient.get('/api/carriers');
      const data = await response.json();
      console.log('Carriers API response:', data);
      if (data.success) {
        console.log('Setting carriers:', data.data);
        setCarriers(data.data);
      } else {
        console.error('Carriers API failed:', data);
      }
    } catch (error) {
      console.error('Error fetching carriers:', error);
    } finally {
      setLoadingCarriers(false);
    }
  };

  // Fetch receivers by carrier
  const fetchReceiversByCarrier = async (carrierId) => {
    if (!carrierId) {
      setReceivers([]);
      return;
    }
    
    try {
      setLoadingReceivers(true);
      const response = await apiClient.get(`/api/receivers?carrierId=${carrierId}`);
      const data = await response.json();
      console.log('Receivers API response:', data);
      if (data.success) {
        console.log('Setting receivers:', data.data);
        setReceivers(data.data);
      } else {
        console.error('Receivers API failed:', data);
      }
    } catch (error) {
      console.error('Error fetching receivers:', error);
    } finally {
      setLoadingReceivers(false);
    }
  };

  // Fetch sale data for edit mode
  const fetchSaleData = async () => {
    if (!isEditMode) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/api/sales/${editId}`);
      const result = await response.json();
      
      if (result.success) {
        const sale = result.data;
        
        // Populate customer data
        if (sale.customer) {
          setCustomer({
            firstName: sale.customer.firstName || '',
            landline: sale.customer.landline || '',
            phone: sale.customer.phone || '',
            address: sale.address || sale.customer.address || '',
            state: sale.customer.state || '',
            city: sale.customer.city || '',
            country: sale.customer.country || 'USA',
            mailingAddress: sale.customer.mailingAddress || '',
            customerFeedback: sale.customer.customerFeedback || ''
          });
        }
        
        // Convert UTC appointmentDateTime back to local time for display
        let displayAppointmentDateTime = sale.appointmentDateTime || '';
        if (sale.appointmentDateTime && sale.customer?.state) {
          const localTime = convertFromUTC(sale.appointmentDateTime, sale.customer.state);
          // We'll keep the original UTC value for saving, but we'll use local time for display
          displayAppointmentDateTime = sale.appointmentDateTime; // Keep UTC for consistency
        }

        // Populate sale form data
        setSaleForm({
          status: sale.status || 'new', // Add status field
          spoke_to: sale.spokeTo || '',
          pin_code: sale.pinCode || '',
          pin_code_status: sale.pinCodeStatus || '',
          ssnName: sale.ssnName || '',
          ssnNumber: sale.ssnNumber || '',
          carrier: sale.carrier || '',
          basicPackage: sale.basicPackage || '',
          basicPackageStatus: sale.basicPackageStatus || '',
          NoFTV: sale.noOfTv || '',
          AccHolder: sale.accountHolder || '',
          AccNumber: sale.accountNumber || '',
          NoReceiver: sale.noOfReceiver || '',
          question: sale.securityQuestion || '',
          answer: sale.securityAnswer || '',
          regularBill: sale.regularBill || '',
          promotionalBill: sale.promotionalBill || '',
          bundle: sale.bundle || '',
          company: sale.company || '',
          lastPayment: sale.lastPayment || '',
          lastPaymentDate: sale.lastPaymentDate || '',
          breakdown: sale.breakdown || '',
          notes: sale.notes || '',
          balance: sale.balance || '',
          dueonDate: sale.dueOnDate || '',
          techVisitDate: sale.techVisitDate || '',
          techVisitTime: sale.techVisitTime || '',
          appointmentDateTime: displayAppointmentDateTime,
          services: sale.services || [],
          receivers: sale.receivers || {},
          receiversInfo: sale.receiversInfo || {}
        });
        
        // Set selected receivers
        if (sale.receivers) {
          setSelectedReceiver(Object.keys(sale.receivers));
        }
      } else {
        setError(result.message || 'Failed to fetch sale data');
      }
    } catch (err) {
      setError('Network error: Unable to fetch sale data');
      console.error('Error fetching sale:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load carriers on component mount
  useEffect(() => {
    fetchCarriers();
  }, []);

  // Load data on component mount if in edit mode
  useEffect(() => {
    fetchSaleData();
  }, [editId]);

  // Validation functions
  const validateCustomerName = (name) => {
    if (!name || name.trim() === '') {
      return { isValid: false, message: 'Customer name is required' };
    }
    if (name.trim().length < 2) {
      return { isValid: false, message: 'Customer name must be at least 2 characters' };
    }
    if (name.trim().length > 100) {
      return { isValid: false, message: 'Customer name must be less than 100 characters' };
    }
    if (!/^[a-zA-Z\s'-]+$/.test(name.trim())) {
      return { isValid: false, message: 'Customer name can only contain letters, spaces, hyphens, and apostrophes' };
    }
    return { isValid: true, message: '' };
  };

  const validateLandline = (landline) => {
    if (!landline || landline.trim() === '') {
      return { isValid: false, message: 'Landline number is required' };
    }
    // Remove formatting for validation
    const cleanLandline = landline.replace(/[^\d]/g, '');
    if (cleanLandline.length < 10) {
      return { isValid: false, message: 'Landline number must be at least 10 digits' };
    }
    if (cleanLandline.length > 15) {
      return { isValid: false, message: 'Landline number must be less than 15 digits' };
    }
    if (!/^\d+$/.test(cleanLandline)) {
      return { isValid: false, message: 'Landline number can only contain digits' };
    }
    return { isValid: true, message: '' };
  };

  // Handle customer form changes
  const handleCustomerChange = (field, value) => {
    // Format input based on field type
    let formattedValue = value;
    if (field === 'landline') {
      formattedValue = formatLandline(value);
    } else if (field === 'phone') {
      formattedValue = formatCellNumber(value);
    }
    
    setCustomer(prev => ({
      ...prev,
      [field]: formattedValue
    }));

    // Validate the field
    let validation = { isValid: true, message: '' };
    if (field === 'firstName') {
      validation = validateCustomerName(formattedValue);
    } else if (field === 'landline') {
      validation = validateLandline(formattedValue);
    }

    setCustomerValidation(prev => ({
      ...prev,
      [field]: validation
    }));
  };

  // Validate all customer fields
  const validateAllCustomerFields = () => {
    const nameValidation = validateCustomerName(customer.firstName);
    const landlineValidation = validateLandline(customer.landline);
    
    setCustomerValidation({
      firstName: nameValidation,
      landline: landlineValidation
    });

    return nameValidation.isValid && landlineValidation.isValid;
  };

  // Handle sale form changes
  const handleSaleFormChange = (field, value) => {
    // Format input based on field type
    let formattedValue = value;
    if (field === 'ssnNumber') {
      formattedValue = formatSSN(value);
    } else if (field === 'regularBill' || field === 'promotionalBill' || field === 'lastPayment' || field === 'balance') {
      formattedValue = formatCurrency(value);
    }
    // Note: techVisitTime uses predefined options like "8am - 12pm", so no formatting needed
    
    setSaleForm(prev => ({
      ...prev,
      [field]: formattedValue
    }));

    // If carrier is changed, fetch receivers for that carrier
    if (field === 'carrier') {
      const selectedCarrier = carriers.find(c => c.name === value);
      if (selectedCarrier) {
        fetchReceiversByCarrier(selectedCarrier.id);
      } else {
        setReceivers([]);
      }
    }
  };

  // Handle service selection
  const handleServiceChange = (services) => {
    setSaleForm(prev => ({
      ...prev,
      services: services
    }));
  };

  // Handle receiver selection
  const handleReceiverChange = (receivers) => {
    setSelectedReceiver(receivers);
    
    // Update receivers object
    const newReceivers = {};
    receivers.forEach(receiver => {
      if (!saleForm.receivers[receiver]) {
        newReceivers[receiver] = 1;
      } else {
        newReceivers[receiver] = saleForm.receivers[receiver];
      }
    });
    
    setSaleForm(prev => ({
      ...prev,
      receivers: newReceivers
    }));
  };

  // Increment receiver quantity
  const incrementReceiver = (key) => {
    setSaleForm(prev => ({
      ...prev,
      receivers: {
        ...prev.receivers,
        [key]: (prev.receivers[key] || 0) + 1
      }
    }));
  };

  // Decrement receiver quantity
  const decrementReceiver = (key) => {
    setSaleForm(prev => {
      const newReceivers = { ...prev.receivers };
      newReceivers[key] = (newReceivers[key] || 1) - 1;
      
      if (newReceivers[key] <= 0) {
        delete newReceivers[key];
        setSelectedReceiver(prev => prev.filter(r => r !== key));
      }
      
      return {
        ...prev,
        receivers: newReceivers
      };
    });
  };

  // Open receiver modal
  const openReceiverModal = (index) => {
    setModalId(index);
    setIsReceiverModalOpen(true);
  };

  // Save system information
  const saveSystemInfo = () => {
    setSaleForm(prev => ({
      ...prev,
      receiversInfo: {
        ...prev.receiversInfo,
        [modalId]: systemInfo
      }
    }));
    setIsReceiverModalOpen(false);
    setSystemInfo({
      receiverId: '',
      smartCardId: '',
      secureId: '',
      locationId: '',
      room: ''
    });
  };

  // Open date modal
  const openDateModal = (status) => {
    setSaleStatus(status);
    setIsDateModalOpen(true);
  };

  // Handle date selection
  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setIsDateModalOpen(false);
    // You can add logic here to handle the selected date
  };

  // Open appointment modal with date and time selection
  const openAppointmentModal = () => {
    setSaleStatus('appointment');
    setIsDateModalOpen(true);
  };

  const handleAppointmentSelect = (dateTimeData) => {
    if (typeof dateTimeData === 'object' && dateTimeData.date) {
      // Use state from modal if provided, otherwise fall back to customer form state
      const stateForTimezone = dateTimeData.state || customer.state;
      
      // Check if state is selected for timezone conversion
      if (!stateForTimezone) {
        alert('Please select a state to properly convert the appointment time to UTC.');
        setIsDateModalOpen(false);
        return;
      }

      // If state was selected in modal, update the customer form state as well
      if (dateTimeData.state && dateTimeData.state !== customer.state) {
        setCustomer(prev => ({
          ...prev,
          state: dateTimeData.state
        }));
      }

      // Combine date and time into a single datetime string with timezone conversion
      let appointmentDateTime = null;
      
      if (dateTimeData.date && dateTimeData.time) {
        // Both date and time provided - convert to UTC based on selected state
        appointmentDateTime = convertToUTC(dateTimeData.date, dateTimeData.time, stateForTimezone);
      } else if (dateTimeData.date && !dateTimeData.time) {
        // Only date provided - set time to start of day
        appointmentDateTime = convertToUTC(dateTimeData.date, '00:00:00', stateForTimezone);
      } else if (!dateTimeData.date && dateTimeData.time) {
        // Only time provided - set date to today
        const today = new Date().toISOString().split('T')[0];
        appointmentDateTime = convertToUTC(today, dateTimeData.time, stateForTimezone);
      }
      
      // Update the sale form with combined appointment datetime
      setSaleForm(prev => ({
        ...prev,
        appointmentDateTime: appointmentDateTime
      }));
      
      // Log the appointment action with the combined datetime
      logSalesAction('appointment', 'appointment', {
        appointmentDateTime: appointmentDateTime
      });
    }
    setIsDateModalOpen(false);
  };

  // Step-specific action handlers
  const handleFirstStepAction = (action, status) => {
    if (action === 'appointment') {
      openAppointmentModal();
    } else if (action === 'customer_agree') {
      logSalesAction('customer_agree', 'active');
    } else {
      logSalesAction(action, status);
    }
  };

  const handleSecondStepAction = (action, status) => {
    if (action === 'update_sale_data') {
      // Update sale data without changing status
      logSalesAction('update_sale_data', saleForm.status);
    } else if (action === 'add_note') {
      // Add note without changing status
      logSalesAction('add_note', saleForm.status);
    } else if (action === 'add_appointment') {
      // Add new appointment without changing status
      openAppointmentModal();
    } else if (action === 'customer_agree') {
      logSalesAction('customer_agree', 'active');
    } else if (action === 'second_call') {
      logSalesAction('second_call', 'active');
    } else {
      logSalesAction(action, status);
    }
  };

  const handleThirdStepAction = (action, status) => {
    logSalesAction(action, status);
  };

  const handleAdminAction = (action, status) => {
    logSalesAction(action, status);
  };


  // Add or update sale with status
  // Handle customer dialog close and continue with sale
  const handleCustomerDialogClose = async (status) => {
    setShowCustomerDialog(false);
    setCustomerWarning(null);
    
    if (customerWarning) {
      if (customerWarning.matchType === 'exact' && customerWarning.customerId) {
        // Exact match - add sale to existing customer
        await continueSaleWithExistingCustomer(status, customerWarning.customerId);
      } else if (customerWarning.matchType === 'landline') {
        if (customerWarning.selectedCustomerId) {
          // Selected existing customer - add sale to selected customer
          await continueSaleWithExistingCustomer(status, customerWarning.selectedCustomerId);
        } else {
          // No selection - create new customer
          await continueSaleWithNewCustomer(status);
        }
      }
    }
  };

  // Continue sale creation with new customer
  const continueSaleWithNewCustomer = async (status) => {
    setSaving(true);
    setError(null);
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return;
    }
    
    try {
      // Create new customer with the form data
      const customerData = {
        firstName: customer.firstName.trim(),
        lastName: null,
        email: null,
        phone: customer.phone,
        landline: customer.landline,
        address: customer.address,
        state: customer.state,
        city: customer.city,
        country: 'USA', // Always set to USA
        mailingAddress: customer.mailingAddress,
        customerFeedback: customer.customerFeedback,
        status: 'prospect'
      };
      
      const customerResponse = await apiClient.post('/api/customers', customerData);
      const customerResult = await customerResponse.json();
      
      if (!customerResult.success) {
        // Handle specific error cases based on error type
        if (customerResult.error === 'DUPLICATE_CUSTOMER') {
          throw new Error('A customer with this name and landline number already exists. Please use a different name or landline number.');
        } else if (customerResult.error === 'VALIDATION_ERROR') {
          throw new Error(customerResult.message || 'Please check the customer information and try again.');
        } else {
          throw new Error(customerResult.message || 'Failed to create customer');
        }
      }
      
      const customerId = customerResult.data.id;
      
      // Continue with sale creation using the new customer ID
      await continueSaleWithExistingCustomer(status, customerId);
      
    } catch (error) {
      console.error('Error creating new customer:', error);
      setError(error.message || 'Failed to create customer');
      setSaving(false);
    }
  };

  // Continue sale creation with existing customer
  const continueSaleWithExistingCustomer = async (status, existingCustomerId) => {
    setSaving(true);
    setError(null);
    
    try {
      // Helper function to convert empty strings to null for ENUM fields
      const sanitizeEnumValue = (value) => {
        return (value === '' || value === null || value === undefined) ? null : value;
      };

      // Helper function to convert empty strings to null for other fields
      const sanitizeValue = (value) => {
        return (value === '' || value === null || value === undefined) ? null : value;
      };

      // Prepare sale data
      const saleData = {
        customerId: existingCustomerId,
        agentId: user?.id, // Get agentId from the logged in user
        status: status,
        spokeTo: sanitizeValue(saleForm.spoke_to),
        pinCode: sanitizeValue(saleForm.pin_code),
        pinCodeStatus: sanitizeEnumValue(saleForm.pin_code_status),
        ssnName: sanitizeValue(saleForm.ssnName),
        ssnNumber: sanitizeValue(saleForm.ssnNumber),
        carrier: sanitizeValue(saleForm.carrier),
        basicPackage: sanitizeValue(saleForm.basicPackage),
        basicPackageStatus: sanitizeEnumValue(saleForm.basicPackageStatus),
        NoFTV: sanitizeValue(saleForm.NoFTV),
        AccHolder: sanitizeValue(saleForm.AccHolder),
        AccNumber: sanitizeValue(saleForm.AccNumber),
        securityQuestion: sanitizeValue(saleForm.question),
        securityAnswer: sanitizeValue(saleForm.answer),
        regularBill: sanitizeValue(saleForm.regularBill),
        promotionalBill: sanitizeValue(saleForm.promotionalBill),
        bundle: sanitizeEnumValue(saleForm.bundle),
        company: sanitizeValue(saleForm.company),
        lastPayment: sanitizeValue(saleForm.lastPayment),
        lastPaymentDate: saleForm.lastPaymentDate ? new Date(saleForm.lastPaymentDate).toISOString() : null,
        balance: sanitizeValue(saleForm.balance),
        dueOnDate: saleForm.dueOnDate ? new Date(saleForm.dueOnDate).toISOString() : null,
        breakdown: sanitizeValue(saleForm.breakdown),
        notes: sanitizeValue(saleForm.notes),
        services: saleForm.services || [],
        receivers: saleForm.receivers || {},
        receiversInfo: saleForm.receiversInfo || {},
        techVisitDate: saleForm.techVisitDate ? new Date(saleForm.techVisitDate).toISOString() : null,
        techVisitTime: saleForm.techVisitTime || null,
        appointmentDateTime: saleForm.appointmentDateTime || null
      };

      // Create the sale
      const response = await apiClient.post('/api/sales', saleData);
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to create sale');
      }
      
      // Navigate back to home
      router.push('/');
    } catch (error) {
      console.error('Error creating sale:', error);
      setError(error.message || 'Failed to create sale');
    } finally {
      setSaving(false);
    }
  };

  // Sales logging function
  const logSalesAction = async (action, status, additionalData = {}) => {
    setSaving(true);
    setError(null);
    setSaleStatus(status);
    
    // Update sale form status
    setSaleForm(prev => ({
      ...prev,
      status: status
    }));
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return;
    }
    
    try {
      // First, save the sale with the new status and get the sale ID
      const saleResult = await addSale(status, additionalData);
      
      // Only log if we have valid IDs
      if (saleResult?.id && (customer.id || saleResult.customerId)) {
        const logData = {
          saleId: saleResult.id,
          customerId: customer.id || saleResult.customerId,
          agentId: user?.id,
          action,
          status,
          currentSaleData: {
            ...saleForm,
            customer,
            status,
            ...additionalData
          },
          breakdown: saleForm.breakdown || '',
          note: saleForm.notes || '',
          appointmentDateTime: additionalData.appointmentDateTime || saleForm.appointmentDateTime || null
        };
       
        // Log the action to sales logs
        const response = await apiClient.post('/api/sales-logs', logData);
        const responseData = await response.json();
        
        if (!responseData.success) {
          console.error('Failed to log sales action:', responseData.error);
        }
      }
    } catch (error) {
      console.error('Error logging sales action:', error);
      setError('Failed to log sales action');
    } finally {
      setSaving(false);
    }
  };

  // Handle "Not a Customer" action - update customer status without creating sale
  const handleNotACustomer = async () => {
    setSaving(true);
    setError(null);
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return;
    }
    
    try {
      // Check if customer exists
      if (customer.firstName && customer.firstName.trim() !== '') {
        // Create or update customer with "not_customer" status
        const customerData = {
          firstName: customer.firstName.trim(),
          lastName: null,
          email: null,
          phone: customer.phone,
          landline: customer.landline,
          address: customer.address,
          state: customer.state,
          city: customer.city,
          country: 'USA',
          mailingAddress: customer.mailingAddress,
          customerFeedback: customer.customerFeedback,
          status: 'non_prospect' // Special status for non-prospect
        };
        
        const customerResponse = await apiClient.post('/api/customers', customerData);
        const customerResult = await customerResponse.json();
        
        if (!customerResult.success) {
          console.error('Failed to create customer:', customerResult.message);
          
          // Handle specific error cases based on error type
          if (customerResult.error === 'DUPLICATE_CUSTOMER') {
            setError('A customer with this name and landline number already exists. Please use a different name or landline number.');
          } else if (customerResult.error === 'VALIDATION_ERROR') {
            setError(customerResult.message || 'Please check the customer information and try again.');
          } else if (customerResult.message && customerResult.message.includes('already exists')) {
            setError('This customer already exists in the system. Please check the customer list or use a different name.');
          } else if (customerResult.message && customerResult.message.includes('duplicate')) {
            setError('A customer with this information already exists. Please verify the customer details.');
          } else {
            setError(customerResult.message || 'Failed to create customer record. Please try again.');
          }
          return;
        }
        
        // Note: No sales log entry for non-prospect customers since they don't have sales
        
        // Redirect to dashboard
        router.push('/');
      } else {
        setError('Please enter customer name to mark as non-prospect');
      }
    } catch (error) {
      console.error('Error marking customer as non-prospect:', error);
      setError(error.message || 'Failed to mark customer as non-prospect. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addSale = async (status, additionalData = {}) => {
    setSaving(true);
    setError(null);
    setSaleStatus(status);
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return null;
    }
    
    try {
      let customerId;
      
      if (isEditMode) {
        // For edit mode, get customer ID from existing sale
        const saleResponse = await apiClient.get(`/api/sales/${editId}`);
        const saleResult = await saleResponse.json();
        if (saleResult.success) {
          customerId = saleResult.data.customerId;
          
          // Update customer information if it has changed
          if (customer.firstName && customer.firstName.trim() !== '') {
            const customerUpdateData = {
              firstName: customer.firstName.trim(),
              lastName: null, // Use null instead of empty string
              email: null, // Use null instead of empty string
              phone: customer.phone, // Use  phone
              landline: customer.landline,
              address: customer.address,
              state: customer.state,
              city: customer.city,
              country: 'USA', // Always set to USA
              mailingAddress: customer.mailingAddress,
              customerFeedback: customer.customerFeedback,
              status: 'prospect'
            };
            
            const customerUpdateResponse = await apiClient.put(`/api/customers/${customerId}`, customerUpdateData);
            
            const customerUpdateResult = await customerUpdateResponse.json();
            if (!customerUpdateResult.success) {
              console.warn('Failed to update customer:', customerUpdateResult.message);
              // Don't throw error here, just log warning and continue with sale update
            }
          }
        } else {
          throw new Error('Failed to fetch existing sale data');
        }
      } else {
        // Validate required customer fields
        if (!customer.firstName || customer.firstName.trim() === '') {
          throw new Error('Customer first name is required');
        }
        
        // For new sale, check if customer already exists first
        if (customer.landline) {
          const checkResponse = await apiClient.post('/api/customers/check-existing', {
            landline: customer.landline,
            firstName: customer.firstName.trim()
          });
          
          const checkResult = await checkResponse.json();
          if (checkResult.success && checkResult.exists) {
            if (checkResult.matchType === 'exact') {
              // Exact match found - same name and landline
              const lastSaleDateTime = checkResult.lastSale ? new Date(checkResult.lastSale.created_at).toLocaleString() : 'No previous sales';
              const lastSaleTimeAgo = checkResult.lastSale ? getTimeAgo(checkResult.lastSale.created_at) : 'No previous sales';
              const agentName = checkResult.lastSale?.agent ? `${checkResult.lastSale.agent.firstName} ${checkResult.lastSale.agent.lastName}` : 'Unknown';
              
              // Check if the current user is the same as the last sale agent
              const isCurrentUser = user && checkResult.lastSale?.agent && 
                (user.id === checkResult.lastSale.agent.id || 
                 (user.firstName === checkResult.lastSale.agent.firstName && user.lastName === checkResult.lastSale.agent.lastName));
              
              const displayAgentName = isCurrentUser ? 'You (yourself)' : 'Other agent';
              
              // Show dialog with exact match
              setCustomerWarning({
                matchType: 'exact',
                customerName: checkResult.customer.firstName,
                lastSaleDateTime: lastSaleDateTime,
                lastSaleTimeAgo: lastSaleTimeAgo,
                agentName: displayAgentName,
                isCurrentUser: isCurrentUser,
                customerId: checkResult.customer.id
              });
              setShowCustomerDialog(true);
              setSaving(false);
              return;
              
            } else if (checkResult.matchType === 'landline') {
              // Landline exists with different names - show selection dialog
              setCustomerWarning({
                matchType: 'landline',
                newCustomerName: customer.firstName.trim(),
                landlineCustomers: checkResult.landlineCustomers,
                customerCount: checkResult.landlineCustomers.length
              });
              setShowCustomerDialog(true);
              setSaving(false);
              return;
            }
          } else {
            // Customer doesn't exist, create new one
            const customerData = {
              firstName: customer.firstName.trim(),
              lastName: null, // Use null instead of empty string
              email: null, // Use null instead of empty string
              phone: customer.phone, // Use phone
              landline: customer.landline,
              address: customer.address,
              status: 'prospect'
            };
            
            const customerResponse = await apiClient.post('/api/customers', customerData);
            
            const customerResult = await customerResponse.json();
            if (!customerResult.success) {
              throw new Error(customerResult.message || 'Failed to create customer');
            }
            customerId = customerResult.data.id;
          }
        } else {
          // No landline provided, create new customer
          const customerData = {
            firstName: customer.firstName.trim(),
            lastName: null, // Use null instead of empty string
            email: null, // Use null instead of empty string
            phone: customer.phone, // Use  phone
            landline: customer.landline,
            address: customer.address,
            status: 'prospect'
          };
          
          const customerResponse = await apiClient.post('/api/customers', customerData);
          
          const customerResult = await customerResponse.json();
          if (!customerResult.success) {
            throw new Error(customerResult.message || 'Failed to create customer');
          }
          customerId = customerResult.data.id;
        }
      }
      
      // Helper function to convert empty strings to null for ENUM fields
      const sanitizeEnumValue = (value) => {
        return (value === '' || value === null || value === undefined) ? null : value;
      };

      // Helper function to convert empty strings to null for other fields
      const sanitizeValue = (value) => {
        return (value === '' || value === null || value === undefined) ? null : value;
      };

      // Prepare sale data
      const saleData = {
        customerId: customerId,
        agentId: user?.id, // Get agentId from the logged in user
        status: status,
        spokeTo: sanitizeValue(saleForm.spoke_to),
        pinCode: sanitizeValue(saleForm.pin_code),
        pinCodeStatus: sanitizeEnumValue(saleForm.pin_code_status),
        ssnName: sanitizeValue(saleForm.ssnName),
        ssnNumber: sanitizeValue(saleForm.ssnNumber),
        carrier: sanitizeValue(saleForm.carrier),
        basicPackage: sanitizeValue(saleForm.basicPackage),
        basicPackageStatus: sanitizeEnumValue(saleForm.basicPackageStatus),
        noOfTv: sanitizeValue(saleForm.NoFTV),
        noOfReceiver: sanitizeValue(saleForm.NoReceiver),
        accountHolder: sanitizeValue(saleForm.AccHolder),
        accountNumber: sanitizeValue(saleForm.AccNumber),
        securityQuestion: sanitizeValue(saleForm.question),
        securityAnswer: sanitizeValue(saleForm.answer),
        regularBill: sanitizeValue(saleForm.regularBill),
        promotionalBill: sanitizeValue(saleForm.promotionalBill),
        bundle: sanitizeEnumValue(saleForm.bundle),
        company: sanitizeValue(saleForm.company),
        lastPayment: sanitizeValue(saleForm.lastPayment),
        lastPaymentDate: sanitizeValue(saleForm.lastPaymentDate),
        balance: sanitizeValue(saleForm.balance),
        dueOnDate: sanitizeValue(saleForm.dueonDate),
        breakdown: sanitizeValue(saleForm.breakdown),
        notes: sanitizeValue(saleForm.notes),
        services: saleForm.services,
        receivers: saleForm.receivers,
        receiversInfo: saleForm.receiversInfo,
        techVisitDate: sanitizeValue(saleForm.techVisitDate),
        techVisitTime: sanitizeValue(saleForm.techVisitTime),
        appointmentDateTime: additionalData.appointmentDateTime || saleForm.appointmentDateTime || null
      };
      
      // Save or update sale
      let saleResult;
      if (isEditMode) {
        const response = await apiClient.put(`/api/sales/${editId}`, saleData);
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to update sale');
        }
        saleResult = result.data;
      } else {
        const response = await apiClient.post('/api/sales', saleData);
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to create sale');
        }
        saleResult = result.data;
      }
      
      // Navigate back to home
      router.push('/');
      
      return saleResult;
    } catch (error) {
      setError(error.message || 'An error occurred while saving the sale');
      console.error('Error saving sale:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEditMode ? 'Edit Sale' : 'Add New Sale'}
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {isEditMode 
                  ? 'Update the sale record with customer and sale information'
                  : 'Create a new sale record with customer and sale information'
                }
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm font-medium text-blue-800">Loading sale data...</span>
            </div>
          </div>
        </div>
      )}

      {/* Step-Based Action Buttons */}
      <div className="sticky top-16 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Current Step Indicator */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Step {getCurrentStep() === 'first' ? '1' : getCurrentStep() === 'second' ? '2' : getCurrentStep() === 'third' ? '3' : 'Admin'}: 
                {getCurrentStep() === 'first' ? ' Initial Contact' : 
                 getCurrentStep() === 'second' ? ' Active Engagement' : 
                 getCurrentStep() === 'third' ? ' Processing' : ' Final Actions'}
              </h3>
              <div className="text-sm text-gray-500">
                <div>Status: {saleForm.status || 'New'}</div>
                <div>Edit Mode: {isEditMode ? 'Yes' : 'No'}</div>
                <div>Step: {getCurrentStep()}</div>
              </div>
            </div>
          </div>

          {/* Step 1: Initial Contact Actions */}
          {getCurrentStep() === 'first' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleFirstStepAction('hangup', 'hang-up')}
                disabled={saving || loading}
                className="bg-red-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📞 Hangup
              </button>
              <button
                onClick={() => handleFirstStepAction('voicemail', 'voicemail')}
                disabled={saving || loading}
                className="bg-orange-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📧 Voicemail
              </button>
              <button
                onClick={() => handleFirstStepAction('no_response', 'no_response')}
                disabled={saving || loading}
                className="bg-gray-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ No Response
              </button>
              <button
                onClick={() => handleFirstStepAction('appointment', 'appointment')}
                disabled={saving || loading}
                className="bg-purple-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-purple-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📅 Appointment
              </button>
              <button
                onClick={() => handleFirstStepAction('lead_call', 'lead')}
                disabled={saving || loading}
                className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎯 Lead Call
              </button>
              <button
                onClick={() => handleFirstStepAction('second_call', 'active')}
                disabled={saving || loading}
                className="bg-green-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Second Call
              </button>
              <button
                onClick={() => handleFirstStepAction('customer_agree', 'active')}
                disabled={saving || loading}
                className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Customer Agree
              </button>
              <button
                onClick={() => handleNotACustomer()}
                disabled={saving || loading}
                className="bg-gray-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚫 Non-Prospect
              </button>
            </div>
          )}

          {/* Step 2: Active Engagement Actions */}
          {getCurrentStep() === 'second' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleSecondStepAction('update_sale_data', saleForm.status)}
                disabled={saving || loading}
                className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📝 Update Sale Data
              </button>
              <button
                onClick={() => handleSecondStepAction('customer_agree', 'active')}
                disabled={saving || loading}
                className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Customer Agree
              </button>
              <button
                onClick={() => handleSecondStepAction('add_note', saleForm.status)}
                disabled={saving || loading}
                className="bg-yellow-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📝 Add Note
              </button>
              <button
                onClick={() => handleSecondStepAction('add_appointment', saleForm.status)}
                disabled={saving || loading}
                className="bg-purple-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-purple-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📅 Add Appointment
              </button>
              <button
                onClick={() => handleSecondStepAction('second_call', 'active')}
                disabled={saving || loading}
                className="bg-green-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Second Call
              </button>
            </div>
          )}

          {/* Step 3: Processing Actions */}
          {getCurrentStep() === 'third' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleThirdStepAction('verification', 'verification')}
                disabled={saving || loading}
                className="bg-indigo-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔍 Verification
              </button>
              <button
                onClick={() => handleThirdStepAction('process', 'process')}
                disabled={saving || loading}
                className="bg-yellow-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚙️ Process
              </button>
              <button
                onClick={() => handleThirdStepAction('charge_pending', 'charge_pending')}
                disabled={saving || loading}
                className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💰 Charge Pending
              </button>
            </div>
          )}

          {/* Admin Actions */}
          {getCurrentStep() === 'admin' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleAdminAction('charge', 'charge')}
                disabled={saving || loading}
                className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💰 Charge
              </button>
              <button
                onClick={() => handleAdminAction('decline', 'declined')}
                disabled={saving || loading}
                className="bg-red-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Decline
              </button>
              <button
                onClick={() => handleAdminAction('cancelled', 'cancelled')}
                disabled={saving || loading}
                className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚫 Cancelled
              </button>
              <button
                onClick={() => handleAdminAction('approved', 'approved')}
                disabled={saving || loading}
                className="bg-green-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Approved
              </button>
              <button
                onClick={() => handleAdminAction('done', 'done')}
                disabled={saving || loading}
                className="bg-green-800 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Done
              </button>
              <button
                onClick={() => handleAdminAction('chargeback', 'chargeback')}
                disabled={saving || loading}
                className="bg-red-800 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Chargeback
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Customer Information Form */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Customer Information</h2>
            
            {/* Validation Summary */}
            {(!customerValidation.firstName.isValid || !customerValidation.landline.isValid) && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h3 className="text-sm font-medium text-red-800">Please fix the following errors:</h3>
                </div>
                <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                  {!customerValidation.firstName.isValid && (
                    <li>{customerValidation.firstName.message}</li>
                  )}
                  {!customerValidation.landline.isValid && (
                    <li>{customerValidation.landline.message}</li>
                  )}
                </ul>
              </div>
            )}
            
            <form className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block mb-2 text-sm font-medium text-gray-900">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={customer.firstName}
                    onChange={(e) => handleCustomerChange('firstName', e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 ${
                      customerValidation.firstName.isValid 
                        ? 'border-gray-300' 
                        : 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    }`}
                    placeholder="Enter Name"
                  />
                  {!customerValidation.firstName.isValid && (
                    <p className="mt-1 text-sm text-red-600">{customerValidation.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="spokeTo" className="block mb-2 text-sm font-medium text-gray-900">
                    I spoke to
                  </label>
                  <input
                    type="text"
                    id="spokeTo"
                    value={saleForm.spoke_to || ''}
                      onChange={(e) => handleSaleFormChange('spoke_to', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Attendee Name"
                  />
                </div>
                <div>
                  <label htmlFor="landline" className="block mb-2 text-sm font-medium text-gray-900">
                    LandLine Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="landline"
                    value={customer.landline}
                    onChange={(e) => handleCustomerChange('landline', e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 ${
                      customerValidation.landline.isValid 
                        ? 'border-gray-300' 
                        : 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    }`}
                    placeholder="555-123-4567"
                  />
                  {!customerValidation.landline.isValid && (
                    <p className="mt-1 text-sm text-red-600">{customerValidation.landline.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="phone" className="block mb-2 text-sm font-medium text-gray-900">
                    Cell Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={customer.phone}
                    onChange={(e) => handleCustomerChange('phone', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="555-123-4567"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="address" className="block mb-2 text-sm font-medium text-gray-900">
                  Physical/Service Address
                </label>
                <input
                  type="text"
                  id="address"
                  value={customer.address}
                  onChange={(e) => handleCustomerChange('address', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  placeholder="Street Address"
                />
              </div>
              
              {/* Address Details */}
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <label htmlFor="country" className="block mb-2 text-sm font-medium text-gray-900">
                    Country
                  </label>
                  <input
                    type="text"
                    id="country"
                    value="USA"
                    disabled
                    className="bg-gray-100 border border-gray-300 text-gray-500 text-sm rounded-lg block w-full p-2.5 cursor-not-allowed"
                    placeholder="USA"
                  />
                </div>
                <StateSelector
                  value={customer.state}
                  onChange={(e) => handleCustomerChange('state', e.target.value)}
                  label="State"
                  showTimezone={true}
                  className=""
                />
                <div>
                  <label htmlFor="city" className="block mb-2 text-sm font-medium text-gray-900">
                    City
                  </label>
                  <input
                    type="text"
                    id="city"
                    value={customer.city}
                    onChange={(e) => handleCustomerChange('city', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter City"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="mailingAddress" className="block mb-2 text-sm font-medium text-gray-900">
                  Mailing Address
                </label>
                <textarea
                  id="mailingAddress"
                  value={customer.mailingAddress}
                  onChange={(e) => handleCustomerChange('mailingAddress', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  placeholder="Enter Mailing Address (if different from above)"
                  rows="3"
                />
              </div>
              
              <div>
                <label htmlFor="customerFeedback" className="block mb-2 text-sm font-medium text-gray-900">
                  Customer Feedback
                </label>
                <textarea
                  id="customerFeedback"
                  value={customer.customerFeedback}
                  onChange={(e) => handleCustomerChange('customerFeedback', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  placeholder="Enter customer feedback or notes about the interaction"
                  rows="3"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Sale Information Form */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Sale Information</h2>
            
            <form className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Pin Code */}
                <div>
                  <label htmlFor="pinCode" className="block mb-2 text-sm font-medium text-gray-900">
                    Pin code
                  </label>
                  <input
                    type="text"
                    id="pinCode"
                    value={saleForm.pin_code}
                    onChange={(e) => handleSaleFormChange('pin_code', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Pin code"
                  />
                </div>

                {/* Pin Code Status */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Pin code status
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="matched"
                        name="pinCodeStatus"
                        value="matched"
                        checked={saleForm.pin_code_status === 'matched'}
                        onChange={(e) => handleSaleFormChange('pin_code_status', e.target.value)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="matched" className="ml-2 text-sm font-medium text-gray-900">
                        Matched
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="notMatched"
                        name="pinCodeStatus"
                        value="not_matched"
                        checked={saleForm.pin_code_status === 'not_matched'}
                        onChange={(e) => handleSaleFormChange('pin_code_status', e.target.value)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="notMatched" className="ml-2 text-sm font-medium text-gray-900">
                        Not Matched
                      </label>
                    </div>
                  </div>
                </div>

                {/* SSN Name */}
                <div>
                  <label htmlFor="ssnName" className="block mb-2 text-sm font-medium text-gray-900">
                    SSN Name
                  </label>
                  <input
                    type="text"
                    id="ssnName"
                    value={saleForm.ssnName}
                    onChange={(e) => handleSaleFormChange('ssnName', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter SSN Name"
                  />
                </div>

                {/* SSN Number */}
                <div>
                  <label htmlFor="ssnNumber" className="block mb-2 text-sm font-medium text-gray-900">
                    SSN Number
                  </label>
                  <input
                    type="text"
                    id="ssnNumber"
                    value={saleForm.ssnNumber}
                    onChange={(e) => handleSaleFormChange('ssnNumber', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="123-45-6789"
                  />
                </div>

                {/* Carrier */}
                <div>
                  <label htmlFor="carrier" className="block mb-2 text-sm font-medium text-gray-900">
                    Carrier
                  </label>
                  <select
                    id="carrier"
                    value={saleForm.carrier}
                    onChange={(e) => handleSaleFormChange('carrier', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    disabled={loadingCarriers}
                  >
                    <option value="">{loadingCarriers ? 'Loading carriers...' : 'Select Carrier'}</option>
                    {console.log('Rendering carriers:', carriers)}
                    {carriers && carriers.length > 0 ? carriers.map((carrier) => (
                      <option key={carrier.id} value={carrier.name}>{carrier.name}</option>
                    )) : (
                      <option value="" disabled>No carriers available</option>
                    )}
                  </select>
                </div>

                {/* Services */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Services
                  </label>
                  <div className="space-y-2">
                    {serviceOptions.map((service) => (
                      <label key={service} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={saleForm.services.includes(service)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleServiceChange([...saleForm.services, service]);
                            } else {
                              handleServiceChange(saleForm.services.filter(s => s !== service));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-900">{service}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tech Visit Date */}
                {saleForm.services.includes('Tech Visit') && (
                  <div>
                    <label htmlFor="techDate" className="block mb-2 text-sm font-medium text-gray-900">
                      Select Date
                    </label>
                    <input
                      type="date"
                      id="techDate"
                      value={saleForm.techVisitDate}
                      onChange={(e) => handleSaleFormChange('techVisitDate', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    />
                  </div>
                )}

                {/* Tech Visit Time */}
                {saleForm.services.includes('Tech Visit') && (
                  <div>
                    <label htmlFor="techTime" className="block mb-2 text-sm font-medium text-gray-900">
                      Select Time
                    </label>
                    <select
                      id="techTime"
                      value={saleForm.techVisitTime}
                      onChange={(e) => handleSaleFormChange('techVisitTime', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    >
                      <option value="">Select Time</option>
                      {timeOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                )}


                {/* Basic Package */}
                <div>
                  <label htmlFor="basicPackage" className="block mb-2 text-sm font-medium text-gray-900">
                    Basic Package
                  </label>
                  <input
                    type="text"
                    id="basicPackage"
                    value={saleForm.basicPackage}
                    onChange={(e) => handleSaleFormChange('basicPackage', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Basic Package"
                  />
                </div>

                {/* Package Status */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Package status
                  </label>
                  <select
                    value={saleForm.basicPackageStatus}
                    onChange={(e) => handleSaleFormChange('basicPackageStatus', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  >
                    <option value="">Select Status</option>
                    {packageStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.text}</option>
                    ))}
                  </select>
                </div>

                {/* Select Receiver */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Select Receiver
                  </label>
                  {!saleForm.carrier ? (
                    <p className="text-sm text-gray-500">Please select a carrier first</p>
                  ) : (
                    <div className="space-y-2">
                      {loadingReceivers ? (
                        <p className="text-sm text-gray-500">Loading receivers...</p>
                      ) : receivers.length === 0 ? (
                        <p className="text-sm text-gray-500">No receivers available for this carrier</p>
                      ) : (
                        receivers.map((receiver) => (
                          <label key={receiver.id} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedReceiver.includes(receiver.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleReceiverChange([...selectedReceiver, receiver.name]);
                                } else {
                                  handleReceiverChange(selectedReceiver.filter(r => r !== receiver.name));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-900">{receiver.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Receiver Quantity Controls */}
                {selectedReceiver.length > 0 && (
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">
                      Choose Quantity
                    </label>
                    <div className="space-y-3">
                      {Object.keys(saleForm.receivers).map((receiver) => (
                        <div key={receiver} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openReceiverModal(receiver)}
                            className="bg-blue-600 text-white font-medium rounded-lg text-sm px-3 py-2 hover:bg-blue-700 transition-colors duration-200"
                          >
                            Add System info ({receiver})
                          </button>
                          <div className="flex max-w-[8rem]">
                            <button
                              type="button"
                              onClick={() => decrementReceiver(receiver)}
                              className="bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-s-lg p-3 h-11 focus:ring-gray-100 focus:ring-2 focus:outline-none"
                            >
                              <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                              </svg>
                            </button>
                            <input
                              type="text"
                              value={saleForm.receivers[receiver] || 0}
                              disabled
                              className="bg-gray-50 border-x-0 border-gray-300 h-11 text-center text-gray-900 text-sm focus:ring-blue-500 focus:border-blue-500 block w-full py-2.5"
                            />
                            <button
                              type="button"
                              onClick={() => incrementReceiver(receiver)}
                              className="bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-e-lg p-3 h-11 focus:ring-gray-100 focus:ring-2 focus:outline-none"
                            >
                              <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Number of TV */}
                <div>
                  <label htmlFor="noOfTV" className="block mb-2 text-sm font-medium text-gray-900">
                    Number of TV
                  </label>
                  <input
                    type="text"
                    id="noOfTV"
                    value={saleForm.NoFTV}
                    onChange={(e) => handleSaleFormChange('NoFTV', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Number Of TV"
                  />
                </div>

                {/* Number of Receiver */}
                <div>
                  <label htmlFor="noOfReceiver" className="block mb-2 text-sm font-medium text-gray-900">
                    Number of Receiver
                  </label>
                  <input
                    type="text"
                    id="noOfReceiver"
                    value={saleForm.NoReceiver}
                    onChange={(e) => handleSaleFormChange('NoReceiver', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Number Of Receiver"
                  />
                </div>

                {/* Account Holder */}
                <div>
                  <label htmlFor="accHolder" className="block mb-2 text-sm font-medium text-gray-900">
                    Account Holder
                  </label>
                  <input
                    type="text"
                    id="accHolder"
                    value={saleForm.AccHolder}
                    onChange={(e) => handleSaleFormChange('AccHolder', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Account Holder Name"
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label htmlFor="accNumber" className="block mb-2 text-sm font-medium text-gray-900">
                    Account #
                  </label>
                  <input
                    type="text"
                    id="accNumber"
                    value={saleForm.AccNumber}
                    onChange={(e) => handleSaleFormChange('AccNumber', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Account Holder Number"
                  />
                </div>

                {/* Security Question */}
                <div>
                  <label htmlFor="question" className="block mb-2 text-sm font-medium text-gray-900">
                    Security Question
                  </label>
                  <input
                    type="text"
                    id="question"
                    value={saleForm.question}
                    onChange={(e) => handleSaleFormChange('question', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Security Question"
                  />
                </div>

                {/* Answer */}
                <div>
                  <label htmlFor="answer" className="block mb-2 text-sm font-medium text-gray-900">
                    Answer
                  </label>
                  <input
                    type="text"
                    id="answer"
                    value={saleForm.answer}
                    onChange={(e) => handleSaleFormChange('answer', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Security Answer"
                  />
                </div>

                {/* Regular Bill */}
                <div>
                  <label htmlFor="regularBill" className="block mb-2 text-sm font-medium text-gray-900">
                    Regular Bill
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-gray-500">$</span>
                    </div>
                    <input
                      type="text"
                      id="regularBill"
                      value={saleForm.regularBill}
                      onChange={(e) => handleSaleFormChange('regularBill', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                      placeholder="$123.45"
                    />
                  </div>
                </div>

                {/* Promotional Bill */}
                <div>
                  <label htmlFor="promotionalBill" className="block mb-2 text-sm font-medium text-gray-900">
                    Promotional Bill
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-gray-500">$</span>
                    </div>
                    <input
                      type="text"
                      id="promotionalBill"
                      value={saleForm.promotionalBill}
                      onChange={(e) => handleSaleFormChange('promotionalBill', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                      placeholder="$123.45"
                    />
                  </div>
                </div>

                {/* Bundled */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Bundled
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="bundleYes"
                        name="bundle"
                        value="yes"
                        checked={saleForm.bundle === 'yes'}
                        onChange={(e) => handleSaleFormChange('bundle', e.target.value)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="bundleYes" className="ml-2 text-sm font-medium text-gray-900">
                        Yes
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="bundleNo"
                        name="bundle"
                        value="no"
                        checked={saleForm.bundle === 'no'}
                        onChange={(e) => handleSaleFormChange('bundle', e.target.value)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="bundleNo" className="ml-2 text-sm font-medium text-gray-900">
                        No
                      </label>
                    </div>
                  </div>
                </div>

                {/* Select Company */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-900">
                    Select Company
                  </label>
                  <select
                    value={saleForm.company}
                    onChange={(e) => handleSaleFormChange('company', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  >
                    <option value="">Select Company</option>
                    {companyOptions.map((company) => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                </div>

                {/* Last Payment */}
                <div>
                  <label htmlFor="lastPayment" className="block mb-2 text-sm font-medium text-gray-900">
                    Last Payment
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-gray-500">$</span>
                    </div>
                    <input
                      type="text"
                      id="lastPayment"
                      value={saleForm.lastPayment}
                      onChange={(e) => handleSaleFormChange('lastPayment', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                      placeholder="$123.45"
                    />
                  </div>
                </div>

                {/* Last Payment Date */}
                <div>
                  <label htmlFor="lastPaymentDate" className="block mb-2 text-sm font-medium text-gray-900">
                    Select Date
                  </label>
                  <input
                    type="date"
                    id="lastPaymentDate"
                    value={saleForm.lastPaymentDate}
                    onChange={(e) => handleSaleFormChange('lastPaymentDate', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  />
                </div>

                {/* Balance */}
                <div>
                  <label htmlFor="balance" className="block mb-2 text-sm font-medium text-gray-900">
                    Balance
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <span className="text-gray-500">$</span>
                    </div>
                    <input
                      type="text"
                      id="balance"
                      value={saleForm.balance}
                      onChange={(e) => handleSaleFormChange('balance', e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                      placeholder="$123.45"
                    />
                  </div>
                </div>

                {/* Due on Date */}
                <div>
                  <label htmlFor="dueOnDate" className="block mb-2 text-sm font-medium text-gray-900">
                    Due on
                  </label>
                  <input
                    type="date"
                    id="dueOnDate"
                    value={saleForm.dueonDate}
                    onChange={(e) => handleSaleFormChange('dueonDate', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  />
                </div>
              </div>

              {/* Breakdown */}
              <div>
                <label htmlFor="breakdown" className="block mb-2 text-sm font-medium text-gray-900">
                  Breakdown
                </label>
                <textarea
                  id="breakdown"
                  rows={8}
                  value={saleForm.breakdown}
                  onChange={(e) => handleSaleFormChange('breakdown', e.target.value)}
                  className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Breakdown here"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block mb-2 text-sm font-medium text-gray-900">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={8}
                  value={saleForm.notes}
                  onChange={(e) => handleSaleFormChange('notes', e.target.value)}
                  className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Notes"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Date Modal */}
      {isDateModalOpen && (
        <DateModal
          title={saleStatus === 'appointment' ? "Set Appointment Date & Time" : "Select Date"}
          onClose={() => setIsDateModalOpen(false)}
          onDateSelect={saleStatus === 'appointment' ? handleAppointmentSelect : handleDateSelect}
          showTime={saleStatus === 'appointment'}
          showState={saleStatus === 'appointment'}
          initialState={customer.state}
          onStateChange={(newState) => {
            // Update customer state when changed in modal
            setCustomer(prev => ({
              ...prev,
              state: newState
            }));
          }}
          initialDate={saleStatus === 'appointment' && saleForm.appointmentDateTime && customer.state ? 
            convertFromUTC(saleForm.appointmentDateTime, customer.state).date : 
            (saleStatus === 'appointment' && saleForm.appointmentDateTime ? 
              saleForm.appointmentDateTime.split('T')[0] : '')}
          initialTime={saleStatus === 'appointment' && saleForm.appointmentDateTime && customer.state ? 
            convertFromUTC(saleForm.appointmentDateTime, customer.state).time : 
            (saleStatus === 'appointment' && saleForm.appointmentDateTime ? 
              saleForm.appointmentDateTime.split('T')[1]?.substring(0, 5) : '')}
        />
      )}

      {/* Receiver Modal */}
      {isReceiverModalOpen && (
        <ReceiverModal
          title="Add System Information"
          modalId={modalId}
          systemInfo={systemInfo}
          setSystemInfo={setSystemInfo}
          onClose={() => setIsReceiverModalOpen(false)}
          onSave={saveSystemInfo}
        />
      )}

      {/* Customer Existence Dialog */}
      {showCustomerDialog && customerWarning && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Customer Already Exists
                  </h3>
                </div>
              </div>
              
              <div className="mb-4">
                {customerWarning.matchType === 'exact' ? (
                  // Exact match - same name and landline
                  <>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Exact match found:</strong> {customerWarning.customerName}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Last Sale:</strong> {customerWarning.lastSaleDateTime}
                    </p>
                    <p className="text-sm text-gray-500 mb-2">
                      <strong>Time Since Last Sale:</strong> {customerWarning.lastSaleTimeAgo}
                    </p>
                    <p className={`text-sm mb-2 ${customerWarning.isCurrentUser ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
                      <strong>Last Sale Agent:</strong> {customerWarning.agentName}
                    </p>
                    <p className="text-sm text-blue-600 mt-3 font-medium">
                      This will add a new sale to the existing customer.
                    </p>
                  </>
                ) : (
                  // Landline match - different names
                  <>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Landline exists with {customerWarning.customerCount} different customer(s):</strong>
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      👆 Click on a customer below to select them, or create a new customer
                    </p>
                    <div className="max-h-32 overflow-y-auto mb-3">
                      {customerWarning.landlineCustomers.map((customer, index) => (
                        <div key={customer.id} className="mb-2">
                          <button
                            onClick={() => {
                              setCustomerWarning(prev => ({
                                ...prev,
                                selectedCustomerId: customer.id,
                                selectedCustomerName: customer.firstName
                              }));
                            }}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                              customerWarning.selectedCustomerId === customer.id
                                ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-md'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium">
                                  {customer.firstName} {customer.lastName || ''}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  ID: {customer.id} • Created: {new Date(customer.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              {customerWarning.selectedCustomerId === customer.id && (
                                <div className="ml-2">
                                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3">
                      <button
                        onClick={() => {
                          setCustomerWarning(prev => ({
                            ...prev,
                            selectedCustomerId: null,
                            selectedCustomerName: null
                          }));
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                          !customerWarning.selectedCustomerId
                            ? 'bg-green-100 border-green-400 text-green-800 shadow-md'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-blue-600">
                              Create New Customer: {customerWarning.newCustomerName}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              This will create a new customer with the entered name
                            </div>
                          </div>
                          {!customerWarning.selectedCustomerId && (
                            <div className="ml-2">
                              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCustomerDialog(false);
                    setCustomerWarning(null);
                    setSaving(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCustomerDialogClose(saleStatus)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {customerWarning.matchType === 'exact' 
                    ? 'Add Sale to Existing Customer'
                    : customerWarning.selectedCustomerId 
                      ? `Add Sale to ${customerWarning.selectedCustomerName}`
                      : 'Create New Customer'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

