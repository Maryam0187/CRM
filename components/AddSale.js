'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DateModal from './DateModal';
import NoteModal from './NoteModal';
// import ReceiverModal from './ReceiverModal'; // Removed - using textarea template instead
import StateSelector, { getStateTimezone, convertToUTC, convertFromUTC } from './StateSelector';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';
import apiClient from '../lib/apiClient.js';
import CallButton from './CallButton';
import CallHistory from './CallHistory';
import AddCardForm from './AddCardForm';
import AddBankForm from './AddBankForm';
import AddChequeElectronicForm from './AddChequeElectronicForm';
import AddChequeMailForm from './AddChequeMailForm';
import AddPaymentEmailForm from './AddPaymentEmailForm';
import ConfirmModal from './ConfirmModal';
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
import { useToast } from '../contexts/ToastContext';
import { SALES_STATUSES, SALE_TAGS, DISPLAY_TAGS, getStepForStatus, getStatusDisplayName, getStatusColorClass, getStatusBadgeClasses, hasTag, toggleTag, getTagDisplayName, getTagBadgeClasses } from '../lib/salesStatuses.js';
import { downloadSaleDoc, escapeHtml as docEscapeHtml, buildTableRows as docBuildTableRows, DOC_TABLE_STYLE, DOC_TABLE_COLGROUP } from '../lib/docUtils';

// Helper function to calculate time ago
const getTimeAgo = (dateString) => {
  if (!dateString) return 'No previous sales';
  
  const now = new Date();
  const pastDate = new Date(dateString);
  
  
  // Handle invalid dates
  if (isNaN(pastDate.getTime())) {
    return 'Invalid date';
  }
  
  // Handle future dates
  if (pastDate > now) {
    return 'Future date';
  }
  
  // Get date components for accurate day calculation
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();
  
  const pastYear = pastDate.getFullYear();
  const pastMonth = pastDate.getMonth();
  const pastDay = pastDate.getDate();
  
  // Check if it's the same day
  if (nowYear === pastYear && nowMonth === pastMonth && nowDay === pastDay) {
    const diffInMs = now - pastDate;
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    
    if (diffInHours < 1) {
      return diffInMinutes < 1 ? 'Just now' : `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    } else {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    }
  }
  
  // Calculate days difference using date arithmetic
  const nowTime = new Date(nowYear, nowMonth, nowDay).getTime();
  const pastTime = new Date(pastYear, pastMonth, pastDay).getTime();
  const daysDiff = Math.floor((nowTime - pastTime) / (1000 * 60 * 60 * 24));
  
  
  if (daysDiff === 1) {
    return 'Yesterday';
  } else if (daysDiff < 7) {
    return `${daysDiff} days ago`;
  } else if (daysDiff < 30) {
    const weeks = Math.floor(daysDiff / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (daysDiff < 365) {
    const months = Math.floor(daysDiff / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    const years = Math.floor(daysDiff / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
};


export default function AddSale() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const { callStatus } = useCall();
  
  // Refs to track CallButton instances for call state checking
  const callButtonRefs = useRef([]);
  
  
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

  // Call functionality state
  const [callData, setCallData] = useState(null);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [createdSale, setCreatedSale] = useState(null); // Track created sale for call button
  const [checkedCustomer, setCheckedCustomer] = useState(null); // Track checked customer (no sale yet)
  const [showCallInfo, setShowCallInfo] = useState(false); // Show customer/sale info before call
  const [showCheckNumber, setShowCheckNumber] = useState(false); // Show check number button
  const [isCheckingNumber, setIsCheckingNumber] = useState(false); // Loading state for check number
  const [showCustomerInfoModal, setShowCustomerInfoModal] = useState(false); // Show customer info popup
  const [lastSaleInfo, setLastSaleInfo] = useState(null); // Store last sale information
  const [isCheckNumberMode, setIsCheckNumberMode] = useState(false); // Track if in check number mode
  const [hideCheckNumberSection, setHideCheckNumberSection] = useState(false); // Hide Check Number block after call button is clicked
  const [callJustEnded, setCallJustEnded] = useState(false); // Track if call just ended to highlight action buttons
  const [sale, setSale] = useState(null); // Store full sale data including cards/banks for tag checking
  
  // Payment section state
  const [showPaymentSection, setShowPaymentSection] = useState(false); // Show payment section after call ends
  const [selectedPaymentType, setSelectedPaymentType] = useState('card'); // 'card' or 'bank'
  
  // Preserve form data when toggling between payment options
  const [cardFormData, setCardFormData] = useState({
    cardType: '',
    provider: '',
    customerName: '',
    cardNumber: '',
    cvv: '',
    expiryDate: '',
    notes: ''
  });
  const [bankFormData, setBankFormData] = useState({
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    routingNumber: '',
    checkNumber: '',
    driverLicense: '',
    nameOnLicense: '',
    stateId: '',
    notes: ''
  });
  
  // Success message state
  const [successMessage, setSuccessMessage] = useState('');
  
  // Clear success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const escapeHtml = docEscapeHtml;
  const buildTableRows = docBuildTableRows;

  const buildPaymentContent = () => {
    const tableStyle = DOC_TABLE_STYLE;

    if (selectedPaymentType === 'card') {
      const rows = [
        { label: 'Payment Type', value: 'Card' },
        { label: 'Card Type', value: cardFormData.cardType },
        { label: 'Provider', value: cardFormData.provider },
        { label: 'Customer Name', value: cardFormData.customerName },
        { label: 'Card Number', value: cardFormData.cardNumber },
        { label: 'CVV', value: cardFormData.cvv },
        { label: 'Expiry Date', value: cardFormData.expiryDate },
        { label: 'Notes', value: cardFormData.notes }
      ];
      return `<table style="${tableStyle}">${DOC_TABLE_COLGROUP}${buildTableRows(rows)}</table>`;
    }

    if (selectedPaymentType === 'bank') {
      const rows = [
        { label: 'Payment Type', value: 'Bank' },
        { label: 'Bank Name', value: bankFormData.bankName },
        { label: 'Account Holder', value: bankFormData.accountHolder },
        { label: 'Account Number', value: bankFormData.accountNumber },
        { label: 'Routing Number', value: bankFormData.routingNumber },
        { label: 'Check Number', value: bankFormData.checkNumber },
        { label: "Driver's License", value: bankFormData.driverLicense },
        { label: 'Name on License', value: bankFormData.nameOnLicense },
        { label: 'State ID', value: bankFormData.stateId },
        { label: 'Notes', value: bankFormData.notes }
      ];
      return `<table style="${tableStyle}">${DOC_TABLE_COLGROUP}${buildTableRows(rows)}</table>`;
    }

    return `<table style="${tableStyle}">${DOC_TABLE_COLGROUP}${buildTableRows([{ label: 'Payment Details', value: 'No payment information provided' }])}</table>`;
  };

  const handleDownloadDoc = () => {
    try {
      const customerFileName =
        customer.firstName && customer.firstName.trim().length > 0
          ? customer.firstName.trim().replace(/\s+/g, '-').toLowerCase()
          : 'customer';

      const customerRows = [
        { label: 'First Name', value: customer.firstName },
        { label: 'Landline', value: customer.landline },
        { label: 'Phone', value: customer.phone },
        { label: 'Address', value: customer.address },
        { label: 'City', value: customer.city },
        { label: 'State', value: customer.state },
        { label: 'Country', value: customer.country },
        { label: 'Mailing Address', value: customer.mailingAddress },
        { label: 'Customer Feedback', value: customer.customerFeedback }
      ];

      const saleRows = [
        { label: 'Sale ID', value: saleForm.id || 'N/A' },
        { label: 'Status', value: saleForm.status },
        { label: 'Spoke To', value: saleForm.spoke_to },
        { label: 'PIN Code', value: saleForm.pin_code },
        { label: 'PIN Code Status', value: saleForm.pin_code_status },
        { label: 'SSN Name', value: saleForm.ssnName },
        { label: 'SSN Number', value: saleForm.ssnNumber },
        { label: 'SSN Number Status', value: saleForm.ssn_number_status },
        { label: 'Carrier', value: saleForm.carrier },
        { label: 'Basic Package', value: saleForm.basicPackage },
        { label: 'New Package', value: saleForm.newPackage },
        { label: 'Basic Package Status', value: saleForm.basicPackageStatus },
        { label: '# of TV', value: saleForm.NoFTV },
        { label: 'Account Holder', value: saleForm.AccHolder },
        { label: 'Account Number', value: saleForm.AccNumber },
        { label: '# of Receivers', value: saleForm.NoReceiver },
        { label: 'Security Question', value: saleForm.question },
        { label: 'Security Answer', value: saleForm.answer },
        { label: 'Regular Bill', value: saleForm.regularBill },
        { label: 'Promotional Bill', value: saleForm.promotionalBill },
        { label: 'Bundle', value: saleForm.bundle },
        { label: 'Company', value: saleForm.company },
        { label: 'Last Payment', value: saleForm.lastPayment },
        { label: 'Last Payment Date', value: saleForm.lastPaymentDate },
        { label: 'Breakdown', value: saleForm.breakdown },
        { label: 'Additional Info', value: saleForm.additionalInfo },
        { label: 'Notes', value: saleForm.notes },
        { label: 'Balance', value: saleForm.balance },
        { label: 'Due On', value: saleForm.dueonDate }
      ];

      const paymentContent = buildPaymentContent();

      downloadSaleDoc({
        fileName: `${customerFileName}-sale-${saleForm.id || 'id'}.doc`,
        saleRows,
        customerRows,
        paymentContent
      });

      showSuccess('Sale summary downloaded successfully.');
    } catch (error) {
      console.error('Error generating sale document:', error);
      showError('Unable to generate the sale document. Please try again.');
    }
  };

  // Sale form state
  const [saleForm, setSaleForm] = useState({
    status: 'new', // Add status field
    spoke_to: '',
    pin_code: '',
    pin_code_status: '',
    ssnName: '',
    ssnNumber: '',
    ssn_number_status: '',
    carrier: '',
    basicPackage: '',
    basicPackageStatus: '',
    newPackage: '',
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
    additionalInfo: '',
    notes: '',
    balance: '',
    dueonDate: '',
    techVisitDate: '',
    techVisitTime: '',
    appointmentDateTime: '',
    services: [],
    receivers: {},
    receiversInfo: {},
    processingRequired: null // null | true | false - only relevant when status is active
  });

  // Modal states
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isNoteEditModalOpen, setIsNoteEditModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const notesContainerRef = useRef(null);
  const lastNoteRef = useRef(null);
  // const [isReceiverModalOpen, setIsReceiverModalOpen] = useState(false); // Removed - using textarea template

  // Function to scroll notes container to bottom
  const scrollNotesToBottom = () => {
    // Try multiple approaches to ensure scrolling works
    if (lastNoteRef.current) {
      // Scroll to the last note element
      lastNoteRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'end' 
      });
    } else if (notesContainerRef.current) {
      // Fallback: scroll container to bottom
      const container = notesContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  };

  // State to track when a new note is added
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);

  // Auto-scroll only when a new note is added
  useEffect(() => {
    if (shouldScrollToBottom && notesContainerRef.current) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        scrollNotesToBottom();
        setShouldScrollToBottom(false); // Reset the flag
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [shouldScrollToBottom]);
  const [selectedReceiver, setSelectedReceiver] = useState([]);
  const [showOtherReceiverInput, setShowOtherReceiverInput] = useState(false);
  const [otherReceiverName, setOtherReceiverName] = useState('');
  const [savingOtherReceiver, setSavingOtherReceiver] = useState(false);
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

  // Toggle: when ON, Process button is enabled; when OFF, Process button is disabled (active sales only)
  const [processButtonEnabled, setProcessButtonEnabled] = useState(true);

  // Comment modal state
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [commentingNote, setCommentingNote] = useState(null);
  const [commentText, setCommentText] = useState('');


  // Receiver textarea templates - simplified system info
  const [receiverTemplates, setReceiverTemplates] = useState({});
  
  // Receiver collapsible state
  const [expandedReceivers, setExpandedReceivers] = useState({});

  // Step detection logic
  const getCurrentStep = () => {
    if (!saleForm.status) return 'first'; // Default to first step for new sales
    
    const status = saleForm.status.toLowerCase();
    
    // Use the centralized step detection function
    const step = getStepForStatus(status);
    return step;
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
      if (data.success) {
        setCarriers(data.data);
      } else {
      }
    } catch (error) {
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
      if (data.success) {
        setReceivers(data.data);
      } else {
      }
    } catch (error) {
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
        
        // Store full sale data including cards/banks for tag checking
        setSale(sale);
        
        // Populate customer data
        if (sale.customer) {
          const customerId = sale.customerId || sale.customer.id;
          setCustomer({
            id: customerId, // Use sale.customerId or customer.id
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
          id: sale.id, // Add the sale ID
          status: sale.status || 'new', // Add status field
          created_at: sale.created_at, // Add creation date
          agent: sale.agent, // Add agent information
          spoke_to: sale.spokeTo || '',
          pin_code: sale.pinCode || '',
          pin_code_status: sale.pinCodeStatus || '',
          ssnName: sale.ssnName || '',
          ssnNumber: sale.ssnNumber || '',
          ssn_number_status: sale.ssnNumberStatus || '',
          carrier: sale.carrier || '',
          basicPackage: sale.basicPackage || '',
          basicPackageStatus: sale.basicPackageStatus || '',
          newPackage: sale.newPackage || '',
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
          additionalInfo: sale.additionalInfo || '',
          notes: sale.notes || '',
          balance: sale.balance || '',
          dueonDate: sale.dueOnDate || '',
          techVisitDate: sale.techVisitDate || '',
          techVisitTime: sale.techVisitTime || '',
          appointmentDateTime: displayAppointmentDateTime,
          services: sale.services || [],
          receivers: sale.receivers || {},
          receiversInfo: sale.receiversInfo || {},
          tags: sale.tags || [], // Load tags when sale is fetched
          processingRequired: sale.processingRequired ?? sale.processing_required ?? null
        });
        // Sync Process toggle from backend: ON when processingRequired is true, OFF when false/null
        setProcessButtonEnabled(sale.processingRequired === true || sale.processing_required === true);
        
        // Set selected receivers
        if (sale.receivers) {
          const receiverKeys = Object.keys(sale.receivers);
          setSelectedReceiver(receiverKeys);
        }

        // Set receiver templates if they exist
        if (sale.receiversInfo) {
          setReceiverTemplates(sale.receiversInfo);
        }
        
        // Fetch receivers for the selected carrier
        if (sale.carrier) {
          // Since carriers are saved by name in the database, always look by name
          let selectedCarrier;
          selectedCarrier = carriers.find(c => c.name === sale.carrier);
          
          if (selectedCarrier) {
            fetchReceiversByCarrier(selectedCarrier.id);
          } else {
            // If carriers not loaded yet, fetch them directly
            fetchCarriers().then(() => {
              // Use a small delay to let the state update
              setTimeout(() => {
                // Re-fetch carriers to get the latest state
                apiClient.get('/api/carriers').then(response => response.json()).then(data => {
                  if (data.success && data.data.length > 0) {
                    const retryCarrier = data.data.find(c => c.name === sale.carrier);
                    if (retryCarrier) {
                      fetchReceiversByCarrier(retryCarrier.id);
                    } else {
                      setError(`Carrier "${sale.carrier}" not found. Available carriers: ${data.data.map(c => c.name).join(', ')}`);
                    }
                  } else {
                    setError('No carriers available. Please contact support.');
                  }
                }).catch(err => {
                  setError('Error loading carriers. Please try again.');
                });
              }, 200);
            }).catch(err => {
              setError('Error loading carriers. Please try again.');
            });
          }
        }
        
        // Set checkedCustomer to true in edit mode so call end overlay works
        if (isEditMode && customer.id) {
          setCheckedCustomer({
            id: customer.id,
            customerId: customer.id,
            status: 'checked',
            customerName: customer.firstName
          });
        }
      } else {
        setError(result.message || 'Failed to fetch sale data');
      }
    } catch (err) {
      setError('Network error: Unable to fetch sale data');
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
    console.log('Formatted value:', customer);
    setCustomer(prev => ({
      ...prev,
      [field]: formattedValue
    }));

    // If customer already exists in DB, sync critical field updates immediately
    if (field === 'state') {
      const targetCustomerId = customer?.id || checkedCustomer?.customerId;
      if (targetCustomerId && formattedValue) {
        try {
          apiClient.put(`/api/customers/${targetCustomerId}`, { state: formattedValue });
        } catch (e) {
          console.warn('Failed to sync state update to server', e);
        }
      }
    }

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

  // Check if we have a valid phone number for calling
  const hasValidPhoneNumber = () => {
    const phone = customer.phone || customer.landline;
    if (!phone) return false;
    
    // Remove formatting for validation
    const cleanPhone = phone.replace(/[^\d]/g, '');
    return cleanPhone.length >= 10;
  };

  // Set callJustEnded based on call status from CallContext
  const prevCallStatusRef = useRef(null);
  useEffect(() => {
    // Track previous status to detect transitions
    const prevStatus = prevCallStatusRef.current;
    const currentStatus = callStatus;
    
    // Define active states (call is ongoing)
    const activeStates = ['in-progress', 'ringing', 'connecting'];
    // Define end states (call has ended)
    const endStates = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    
    // Detect transition from active state to end state or null
    const wasActive = prevStatus && activeStates.includes(prevStatus);
    const isEnded = currentStatus && endStates.includes(currentStatus);
    // Also detect when status goes from active/null to null (endCall was called)
    const transitionedToNull = prevStatus && activeStates.includes(prevStatus) && currentStatus === null;
    
    if (isEnded || transitionedToNull) {
      // Call has ended - set callJustEnded to true
      // This handles:
      // 1. Direct end state (completed, failed, etc.)
      // 2. Transition from active to null (endCall was called after status was set)
      setCallJustEnded(true);
      console.log('📞 Call ended - setting callJustEnded to true', { prevStatus, currentStatus, isEnded, transitionedToNull });
    } else if (currentStatus && activeStates.includes(currentStatus)) {
      // New call is starting - reset callJustEnded
      setCallJustEnded(false);
    }
    
    // Update ref AFTER processing (so we can detect transitions next time)
    prevCallStatusRef.current = currentStatus;
    
    // Note: We don't reset callJustEnded when callStatus becomes null (which happens in endCall)
    // This ensures the UI stays highlighted even after endCall clears the status
    // The callJustEnded flag will remain true until a new call starts
  }, [callStatus]);

  // Handle call completion

  const handleCallCompleted = (callResult) => {
    console.log('Call completed:', callResult);
    setCallData(callResult);
    
    // Hide the customer/sale info panel after call is initiated
    setShowCallInfo(false);
    // Close customer info popup after call is initiated
    setShowCustomerInfoModal(false);
    // Reset checked customer and last sale info
    setCheckedCustomer(null);
    setLastSaleInfo(null);
    setHideCheckNumberSection(false); // Show Check Number again when call completes
    // Note: callJustEnded is now set automatically based on callStatus from CallContext
  };

  // Handle call initiation (not completion)
  const handleCallInitiated = (callResult) => {
    console.log('Call initiated:', callResult);
    setCallData(callResult);
    
    // Hide the customer/sale info panel after call is initiated
    setShowCallInfo(false);
    // Close customer info popup after call is initiated
    setShowCustomerInfoModal(false);
    // Hide Check Number section when call button is clicked after number was checked
    setHideCheckNumberSection(true);
    // Don't reset checked customer - keep it for status updates
  };

  // Reset call highlight when user interacts with action buttons
  const resetCallHighlight = () => {
    setCallJustEnded(false);
  };

  // Payment panel handlers
  const handlePaymentPanelClose = () => {
    setShowPaymentSection(false);
    setSelectedPaymentType('card');
    // Don't clear form data - preserve it for next time
  };

  const handlePaymentSuccess = async (type, data) => {
    console.log('Payment saved:', data);
    
    // Clear the form data for the successful payment type
    if (type === 'card') {
      setCardFormData({
        cardType: '',
        provider: '',
        customerName: '',
        cardNumber: '',
        cvv: '',
        expiryDate: '',
        notes: ''
      });
    } else if (type === 'bank') {
      setBankFormData({
        bankName: '',
        accountHolder: '',
        accountNumber: '',
        routingNumber: '',
        checkNumber: '',
        driverLicense: '',
        nameOnLicense: '',
        stateId: '',
        notes: ''
      });
    }
    
    // Show success message based on payment type
    let paymentTypeName = 'Payment';
    if (type === 'card') {
      paymentTypeName = 'Card';
    } else if (type === 'bank') {
      paymentTypeName = 'Bank';
    } else if (type === 'cheque_electronic') {
      paymentTypeName = 'Electronic Cheque';
    } else if (type === 'cheque_mail') {
      paymentTypeName = 'Cheque to Mail';
    } else if (type === 'payment_email') {
      paymentTypeName = 'Payment Email';
    }
    
    setSuccessMessage(`${paymentTypeName} payment information added successfully!`);
    
    // Log the payment collection action to sales logs
    // Payment-info tag is now automatically shown based on payment methods existence, no need to update tag
    if (saleForm.id || editId) {
      logSalesAction('payment_collected', saleForm.status, {
        paymentType: type,
        paymentData: data
      });
    }
    
    handlePaymentPanelClose();
  };

  const openPaymentPanel = (paymentType = 'card') => {
    setSelectedPaymentType(paymentType);
    setShowPaymentSection(true);
  };

  // Handlers for updating form data
  const handleCardFormDataChange = (newData) => {
    setCardFormData(newData);
  };

  const handleBankFormDataChange = (newData) => {
    setBankFormData(newData);
  };

  // Fetch customer's last sale information (excluding current sale)
  const fetchLastSaleInfo = async (customerId, excludeSaleId = null) => {
    try {
      const response = await apiClient.get(`/api/sales?customerId=${customerId}&limit=5`);
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        // Filter out the current sale and get the most recent previous sale
        const previousSales = result.data.filter(sale => sale.id !== excludeSaleId);
        
        if (previousSales.length > 0) {
          setLastSaleInfo(previousSales[0]); // Get the most recent previous sale
          return previousSales[0];
        } else {
          setLastSaleInfo(null); // No previous sales (only current sale exists)
          return null;
        }
      } else {
        setLastSaleInfo(null); // No sales at all
        return null;
      }
    } catch (error) {
      console.error('Error fetching last sale info:', error);
      setLastSaleInfo(null);
      return null;
    }
  };

  // Handle check number action - simplified flow
  const handleCheckNumber = async () => {
    if (!hasValidPhoneNumber()) {
      setError('Please enter a valid phone number');
      return;
    }

    // Prevent multiple calls if already checking
    if (isCheckingNumber) {
      return;
    }

    setIsCheckingNumber(true);
    setError(null);
    
    // Reset previous states
    setCheckedCustomer(null);
    setShowCustomerInfoModal(false);
    setLastSaleInfo(null);
    setHideCheckNumberSection(false);

    try {
      // Check if customer already exists with this landline
      if (customer.landline) {
        const checkResponse = await apiClient.post('/api/customers/check-existing', {
          landline: customer.landline,
          firstName: customer.firstName.trim()
        });
        
        const checkResult = await checkResponse.json();
        if (checkResult.success && checkResult.exists) {
          // If exact match found, auto-populate the form with that customer's data
          let selectedCustomerId = null;
          let selectedCustomerName = null;
          
          if (checkResult.matchType === 'exact' && checkResult.exactMatchCustomer) {
            const exactMatch = checkResult.exactMatchCustomer;
            setCustomer(prev => ({
              ...prev,
              firstName: exactMatch.firstName,
              lastName: exactMatch.lastName || '',
              email: exactMatch.email || '',
              phone: exactMatch.phone || '',
              landline: exactMatch.landline || prev.landline,
              address: exactMatch.address || '',
              state: exactMatch.state || '',
              city: exactMatch.city || '',
              id: exactMatch.id
            }));
            selectedCustomerId = exactMatch.id;
            selectedCustomerName = exactMatch.firstName;
          }
          
          // Show customer selection dialog when landline exists
          setCustomerWarning({
            matchType: checkResult.matchType, // 'exact' or 'landline'
            hasExactMatch: checkResult.hasExactMatch,
            exactMatchCustomer: checkResult.exactMatchCustomer,
            newCustomerName: customer.firstName.trim(),
            landlineCustomers: checkResult.landlineCustomers,
            customerCount: checkResult.customerCount,
            selectedCustomerId: selectedCustomerId,
            selectedCustomerName: selectedCustomerName
          });
          
          setIsCheckNumberMode(true);
          setShowCustomerDialog(true);
        } else {
          // No existing customer - create new one
          const customerResult = await createCustomerOnly();
          
          if (customerResult?.id) {
            setCheckedCustomer({
              id: customerResult.id,
              customerId: customerResult.id,
              status: 'checked',
              customerName: customerResult.firstName
            });
            
            // Update customer state with the ID
            setCustomer(prev => ({ ...prev, id: customerResult.id }));
            
            // No last sale for new customer
            setLastSaleInfo({
              lastSale: null,
              customer: customerResult
            });
            
            // Show call button and last sale info on page (no popup)
            // setShowCustomerInfoModal(true);
          }
        }
      } else {
        // Check failed - don't create customer
        setError('Failed to validate customer. Please try again.');
      }
    } catch (err) {
      console.error('Error checking number:', err);
      setError('Failed to check customer. Please try again.');
    } finally {
      setIsCheckingNumber(false);
    }
  };

  // Create customer only (no sale yet) for check number flow
  const createCustomerOnly = async () => {
    setSaving(true);
    setError(null);
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return null;
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
        country: 'USA',
        mailingAddress: customer.mailingAddress,
        customerFeedback: customer.customerFeedback,
        status: 'prospect',
        createdBy: user?.id || null
      };

      console.log('Creating customer:', customerData);
      
      const customerResponse = await apiClient.post('/api/customers', customerData);
      const customerResult = await customerResponse.json();
      
      if (customerResult.success) {
        setSaving(false);
        // Persist created customer id into form state so later edits (like state) can sync
        try {
          const created = customerResult.data;
          if (created?.id) {
            setCustomer(prev => ({ ...prev, id: created.id }));
          }
        } catch (e) {}
        showSuccess('Customer created successfully');
        return customerResult.data; // Return customer data only
        
      } else {
        throw new Error(customerResult.message || 'Failed to create customer');
      }
      
    } catch (error) {
      setError(error.message || 'Failed to create customer');
      setSaving(false);
      return null;
    }
  };

  // Handle sale form changes
  const handleSaleFormChange = (field, value) => {
    // Format input based on field type
    let formattedValue = value;
    if (field === 'regularBill' || field === 'promotionalBill' || field === 'lastPayment' || field === 'balance') {
      formattedValue = formatCurrency(value);
    }
    // Note: techVisitTime uses predefined options like "8am - 12pm", so no formatting needed
    
    setSaleForm(prev => ({
      ...prev,
      [field]: formattedValue
    }));

    // If carrier is changed, reset receivers and fetch new ones
    if (field === 'carrier') {
      // Reset selected receivers when carrier changes
      setSelectedReceiver([]);
      setShowOtherReceiverInput(false);
      setOtherReceiverName('');
      setSaleForm(prev => ({
        ...prev,
        receivers: {},
        receiversInfo: {}
      }));
      
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
    
    // Initialize templates for newly selected receivers
    receivers.forEach(receiver => {
      const count = newReceivers[receiver] || 1;
      initializeReceiverTemplates(receiver, count);
    });
  };

  // Handle creating a new receiver
  const handleCreateOtherReceiver = async () => {
    if (!otherReceiverName.trim()) {
      showError('Please enter a receiver name');
      return;
    }

    if (!saleForm.carrier) {
      showError('Please select a carrier first');
      return;
    }

    // Find the selected carrier to get its ID
    const selectedCarrier = carriers.find(c => c.name === saleForm.carrier);
    if (!selectedCarrier) {
      showError('Carrier not found. Please select a carrier first.');
      return;
    }

    setSavingOtherReceiver(true);
    try {
      // Create the new receiver
      const response = await apiClient.post('/api/receivers', {
        name: otherReceiverName.trim(),
        carrierId: selectedCarrier.id,
        status: 'active',
        createdBy: user?.id || null
      });

      const data = await response.json();
      
      if (data.success) {
        // Notify admins about the new receiver
        try {
          const notifyResponse = await apiClient.post('/api/receivers/notify-admin', {
            receiverName: otherReceiverName.trim(),
            carrierName: saleForm.carrier,
            createdBy: user?.firstName && user?.lastName 
              ? `${user.firstName} ${user.lastName}` 
              : user?.email || 'Unknown User'
          });
          const notifyData = await notifyResponse.json();
          if (!notifyData.success) {
            console.warn('Admin notification failed:', notifyData.message);
          }
        } catch (notifyError) {
          console.error('Failed to notify admins:', notifyError);
          // Don't fail the whole operation if notification fails, but log it
        }

        // Refresh receivers list
        await fetchReceiversByCarrier(selectedCarrier.id);
        
        // Add the new receiver to selected receivers
        handleReceiverChange([...selectedReceiver, otherReceiverName.trim()]);
        
        // Reset other receiver input
        setOtherReceiverName('');
        setShowOtherReceiverInput(false);
        
        showSuccess(`Receiver "${otherReceiverName.trim()}" added successfully!`);
      } else {
        showError(data.message || 'Failed to create receiver');
      }
    } catch (error) {
      console.error('Error creating receiver:', error);
      showError('Failed to create receiver. Please try again.');
    } finally {
      setSavingOtherReceiver(false);
    }
  };

  // Increment receiver quantity
  const incrementReceiver = (key) => {
    setSaleForm(prev => {
      const newCount = (prev.receivers[key] || 0) + 1;
      return {
        ...prev,
        receivers: {
          ...prev.receivers,
          [key]: newCount
        }
      };
    });
    
    // Initialize templates for the new count
    const newCount = (saleForm.receivers[key] || 0) + 1;
    initializeReceiverTemplates(key, newCount);
  };

  // Decrement receiver quantity
  const decrementReceiver = (key) => {
    setSaleForm(prev => {
      const newReceivers = { ...prev.receivers };
      const currentCount = newReceivers[key] || 1;
      const newCount = currentCount - 1;
      
      if (newCount <= 0) {
        delete newReceivers[key];
        setSelectedReceiver(prev => prev.filter(r => r !== key));
        
        // Clean up templates for removed receiver
        setReceiverTemplates(prev => {
          const newTemplates = { ...prev };
          Object.keys(newTemplates).forEach(templateKey => {
            if (templateKey.startsWith(`${key}_`)) {
              delete newTemplates[templateKey];
            }
          });
          return newTemplates;
        });
        
        setSaleForm(prev => ({
          ...prev,
          receiversInfo: Object.fromEntries(
            Object.entries(prev.receiversInfo).filter(([templateKey]) => !templateKey.startsWith(`${key}_`))
          )
        }));
      } else {
        newReceivers[key] = newCount;
        
        // Clean up excess templates
        setReceiverTemplates(prev => {
          const newTemplates = { ...prev };
          for (let i = newCount + 1; i <= currentCount; i++) {
            delete newTemplates[`${key}_${i}`];
          }
          return newTemplates;
        });
        
        setSaleForm(prev => ({
          ...prev,
          receiversInfo: Object.fromEntries(
            Object.entries(prev.receiversInfo).filter(([templateKey]) => {
              if (templateKey.startsWith(`${key}_`)) {
                const index = parseInt(templateKey.split('_')[1]);
                return index <= newCount;
              }
              return true;
            })
          )
        }));
      }
      
      return {
        ...prev,
        receivers: newReceivers
      };
    });
  };

  // Receiver template functions
  const updateReceiverTemplate = (receiverName, template) => {
    setReceiverTemplates(prev => ({
      ...prev,
      [receiverName]: template
    }));
    
    // Also update receiversInfo in saleForm
    setSaleForm(prev => ({
      ...prev,
      receiversInfo: {
        ...prev.receiversInfo,
        [receiverName]: template
      }
    }));
  };

  // Get receiver template
  const getReceiverTemplate = (receiverName) => {
    return receiverTemplates[receiverName] || getDefaultReceiverTemplate();
  };

  // Initialize receiver templates when count changes
  const initializeReceiverTemplates = (receiverName, count) => {
    for (let i = 1; i <= count; i++) {
      const templateKey = `${receiverName}_${i}`;
      if (!receiverTemplates[templateKey]) {
        updateReceiverTemplate(templateKey, getDefaultReceiverTemplate());
      }
    }
  };

  // Toggle receiver expansion
  const toggleReceiverExpansion = (receiverName) => {
    setExpandedReceivers(prev => ({
      ...prev,
      [receiverName]: !prev[receiverName]
    }));
  };

  // Remove specific system information textarea
  const removeSystemInformation = (receiverName, index) => {
    const currentCount = saleForm.receivers[receiverName] || 0;
    
    if (currentCount <= 1) {
      // If only one textarea, remove the entire receiver
      handleReceiverChange(selectedReceiver.filter(r => r !== receiverName));
      return;
    }
    
    // Decrease count
    setSaleForm(prev => ({
      ...prev,
      receivers: {
        ...prev.receivers,
        [receiverName]: currentCount - 1
      }
    }));
    
    // Remove the specific template
    const templateKey = `${receiverName}_${index + 1}`;
    setReceiverTemplates(prev => {
      const newTemplates = { ...prev };
      delete newTemplates[templateKey];
      
      // Shift remaining templates down
      for (let i = index + 2; i <= currentCount; i++) {
        const oldKey = `${receiverName}_${i}`;
        const newKey = `${receiverName}_${i - 1}`;
        if (newTemplates[oldKey]) {
          newTemplates[newKey] = newTemplates[oldKey];
          delete newTemplates[oldKey];
        }
      }
      
      return newTemplates;
    });
    
    // Update receiversInfo in saleForm
    setSaleForm(prev => {
      const newReceiversInfo = { ...prev.receiversInfo };
      delete newReceiversInfo[templateKey];
      
      // Shift remaining info down
      for (let i = index + 2; i <= currentCount; i++) {
        const oldKey = `${receiverName}_${i}`;
        const newKey = `${receiverName}_${i - 1}`;
        if (newReceiversInfo[oldKey]) {
          newReceiversInfo[newKey] = newReceiversInfo[oldKey];
          delete newReceiversInfo[oldKey];
        }
      }
      
      return {
        ...prev,
        receiversInfo: newReceiversInfo
      };
    });
  };

  // Default receiver template
  const getDefaultReceiverTemplate = () => {
    return `Receiver ID: 
Smart Card ID: 
Secure ID: 
Location ID: 
Room: `;
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

      // Prepare notes if provided in appointment
      let notesString = saleForm.notes;
      if (dateTimeData.note && dateTimeData.note.trim()) {
        const appointmentNote = {
          id: Date.now(),
          timestamp: new Date().toLocaleString(),
          note: dateTimeData.note.trim(),
          appointment: `${dateTimeData.date} ${dateTimeData.time}`,
          userId: user?.id, // Add current user ID to track who added the note
          userName: user ? `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || 'Unknown User' : 'Unknown User' // Add user name for display
        };
        
        const currentNotes = parseNotes(saleForm.notes);
        const updatedNotes = [appointmentNote, ...currentNotes];
        notesString = updatedNotes.map(note => JSON.stringify(note)).join('|||');
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
      
      // Update the sale form with combined appointment datetime AND notes
      setSaleForm(prev => {
        return {
          ...prev,
          appointmentDateTime: appointmentDateTime,
          notes: notesString
        };
      });
      
      // Log the appointment action with the combined datetime AND notes
      logSalesAction('appointment', 'appointment', {
        appointmentDateTime: appointmentDateTime,
        notes: notesString
      });
    }
    setIsDateModalOpen(false);
  };

  // Open note modal
  const openNoteModal = () => {
    setIsNoteModalOpen(true);
  };

  // Open note edit modal
  const openNoteEditModal = (note) => {
    setEditingNote(note);
    setIsNoteEditModalOpen(true);
  };

  // Open comment modal
  const openCommentModal = (note) => {
    setCommentingNote(note);
    setCommentText('');
    setIsCommentModalOpen(true);
  };

  // Handle comment submission
  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !commentingNote) return;

    const comment = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      comment: commentText.trim(),
      userId: user?.id,
      userName: user ? `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || 'Unknown User' : 'Unknown User'
    };

    // Add comment to the note
    const notes = parseNotes(saleForm.notes);
    const updatedNotes = notes.map(note => {
      if (note.id === commentingNote.id) {
        return {
          ...note,
          comments: [...(note.comments || []), comment]
        };
      }
      return note;
    });

    // Update the notes string
    const updatedNotesString = updatedNotes.map(note => JSON.stringify(note)).join('|||');
    setSaleForm(prev => ({ ...prev, notes: updatedNotesString }));

    // Save the updated notes to the database if in edit mode
    if (isEditMode && editId) {
      try {
        const response = await apiClient.put(`/api/sales/${editId}`, {
          notes: updatedNotesString,
          status: saleForm.status // Include current status to prevent it from being set to null
        });
        
        if (!response.ok) {
          console.error('Failed to save notes with comments');
        }
      } catch (error) {
        console.error('Error saving notes with comments:', error);
      }
    }

    // Log the comment action
    await logNoteAction('add_comment', {
      noteId: commentingNote.id,
      commentContent: comment.comment,
      timestamp: comment.timestamp
    });

    // Close modal and reset
    setIsCommentModalOpen(false);
    setCommentingNote(null);
    setCommentText('');
  };

  // Handle note edit save
  const handleNoteEditSave = async (editedNoteData) => {
    await handleNoteEdit(
      editingNote.id,
      editedNoteData.note,
      editedNoteData.date,
      editedNoteData.time
    );
    setIsNoteEditModalOpen(false);
    setEditingNote(null);
  };

  const handleNoteAdd = async (noteData) => {
    // Get current date and time
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    
    // Create structured note object
    const noteObject = {
      id: Date.now(), // Unique ID for editing
      timestamp: `${currentDate} ${currentTime}`,
      note: noteData.note || 'Note added',
      appointment: noteData.date && noteData.time ? `${noteData.date} ${noteData.time}` : null,
      userId: user?.id, // Add current user ID to track who added the note
      userName: user ? `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || 'Unknown User' : 'Unknown User' // Add user name for display
    };
    
    // Convert to string format with delimiter
    const noteString = JSON.stringify(noteObject);
    
    // Update the sale form notes field with delimiter
    const newNotes = saleForm.notes ? `${saleForm.notes}|||${noteString}` : noteString;
    setSaleForm(prev => ({
      ...prev,
      notes: newNotes
    }));
    
    // Update appointment_datetime if date and time are provided (like appointment action)
    if (noteData.date && noteData.time && (noteData.state || customer.state)) {
      const stateForTimezone = noteData.state || customer.state;
      const timezone = getStateTimezone(stateForTimezone);
      const appointmentDateTime = convertToUTC(noteData.date, noteData.time, timezone);
      
      
      setSaleForm(prev => ({
        ...prev,
        appointmentDateTime: appointmentDateTime
      }));
    }
    
    // Save notes to database if editing an existing sale
    if (isEditMode && editId) {
      try {
        const updateData = {
          notes: newNotes,
          status: saleForm.status,
          appointment_datetime: saleForm.appointmentDateTime || null
        };
        
        
        // If note has appointment date/time, also update the main appointment field
        if (noteData.date && noteData.time && (noteData.state || customer.state)) {
          const stateForTimezone = noteData.state || customer.state;
          const timezone = getStateTimezone(stateForTimezone);
          const appointmentDateTime = convertToUTC(noteData.date, noteData.time, timezone);
          updateData.appointment_datetime = appointmentDateTime;
        }
        
        const response = await apiClient.put(`/api/sales/${editId}`, updateData);
        const result = await response.json();
        if (result.success) {
          // Success - appointment and notes saved
        } else {
          console.error('Failed to update sale with notes and appointment');
        }
      } catch (error) {
        console.error('Error updating sale:', error);
      }
    }
    
    // Log the note addition action to sales logs (without triggering full sale update)
      await logNoteAction('add_note', {
        noteId: noteObject.id,
        noteContent: noteObject.note,
        appointment: noteObject.appointment,
        timestamp: noteObject.timestamp
      });
      
      // Trigger scroll only when adding a new note
      setShouldScrollToBottom(true);
      
      setIsNoteModalOpen(false);
  };

  // Parse notes from delimiter-separated string to array
  const parseNotes = (notesString) => {
    if (!notesString) return [];
    const notes = notesString.split('|||').map(noteStr => {
      try {
        return JSON.parse(noteStr);
      } catch (e) {
        // Handle legacy format
        return {
          id: Date.now() + Math.random(),
          timestamp: 'Legacy',
          note: noteStr,
          appointment: null
        };
      }
    });
    
    // Sort notes by timestamp in descending order (newest first)
    return notes.sort((a, b) => {
      // Convert timestamps to Date objects for comparison
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA; // Descending order (newest first)
    });
  };

  // Update a specific note
  const handleNoteEdit = async (noteId, newNoteText, newAppointmentDate = null, newAppointmentTime = null) => {
    const notes = parseNotes(saleForm.notes);
    const updatedNotes = notes.map(note => {
      if (note.id === noteId) {
        const updatedNote = { ...note, note: newNoteText };
        
        // Update appointment if provided
        if (newAppointmentDate && newAppointmentTime) {
          updatedNote.appointment = `${newAppointmentDate} ${newAppointmentTime}`;
          
          // Also update the main appointment_datetime field if this note has an appointment
          if (customer.state) {
            const timezone = getStateTimezone(customer.state);
            const appointmentDateTime = convertToUTC(newAppointmentDate, newAppointmentTime, timezone);
            
            setSaleForm(prev => ({
              ...prev,
              appointmentDateTime: appointmentDateTime
            }));
          }
        } else if (newAppointmentDate === '' && newAppointmentTime === '') {
          // Clear appointment if both fields are empty
          updatedNote.appointment = null;
        }
        
        return updatedNote;
      }
      return note;
    });
    
    // Convert back to delimiter-separated string
    const notesString = updatedNotes.map(note => JSON.stringify(note)).join('|||');
    
    setSaleForm(prev => ({
      ...prev,
      notes: notesString
    }));
    
    // Save updated notes to database if editing an existing sale
    if (isEditMode && editId) {
      try {
        const updateData = {
          notes: notesString,
          status: saleForm.status,
          appointment_datetime: saleForm.appointmentDateTime || null
        };
        
        // If the edited note has appointment date/time, also update the main appointment field
        const editedNote = updatedNotes.find(note => note.id === noteId);
        if (editedNote && editedNote.appointment && customer.state) {
          const [appointmentDate, appointmentTime] = editedNote.appointment.split(' ');
          if (appointmentDate && appointmentTime) {
            const timezone = getStateTimezone(customer.state);
            const appointmentDateTime = convertToUTC(appointmentDate, appointmentTime, timezone);
            updateData.appointment_datetime = appointmentDateTime;
          }
        }
        
        const response = await apiClient.put(`/api/sales/${editId}`, updateData);
        const result = await response.json();
        if (result.success) {
          // Success - appointment and notes updated
        } else {
          console.error('Failed to update sale with edited notes and appointment');
        }
      } catch (error) {
        console.error('Error updating sale:', error);
      }
    }
    
    // Log the note edit action to sales logs (without triggering full sale update)
    const editedNote = updatedNotes.find(note => note.id === noteId);
    if (editedNote) {
      await logNoteAction('edit_note', {
        noteId: noteId,
        noteContent: editedNote.note,
        appointment: editedNote.appointment,
        timestamp: editedNote.timestamp
      });
    }
  };

  // Step-specific action handlers
  const handleFirstStepAction = (action, status) => {
    resetCallHighlight(); // Reset highlight when action is taken
    if (action === 'appointment') {
      openAppointmentModal();
    } else if (action === 'sale_done') {
      // When sale-done is selected, set status to ACTIVE without adding tags by default
      logSalesAction('sale_done', SALES_STATUSES.ACTIVE);
    } else {
      logSalesAction(action, status);
    }
  };

  const handleSecondStepAction = (action, status) => {
    if (action === 'update_sale_data') {
      // Update sale data without changing status
      logSalesAction('update_sale_data', saleForm.status);
    } else if (action === 'add_note') {
      // Open note modal
      openNoteModal();
    } else if (action === 'add_appointment') {
      // Add new appointment without changing status
      openAppointmentModal();
    } else if (action === 'add_payments') {
      // Show payment section - tag will be updated when payment is successfully added
      setShowPaymentSection(true);
      // Don't update tag immediately - will be handled when payment is saved
    } else if (action === 'cancelled') {
      logSalesAction('cancelled', SALES_STATUSES.CANCELLED);
    } else {
      logSalesAction(action, status);
    }
  };

  const handleThirdStepAction = (action, status) => {
    // Step 3 is removed - verification and process are now tags on ACTIVE sales
    // This function is kept for backward compatibility but should not be used
    if (action === 'cancelled') {
      logSalesAction('cancelled', SALES_STATUSES.LEAD_CALL);
    } else if (action === 'verification' || action === 'process') {
      // These are now handled as tags on ACTIVE sales
      // Redirect to tag management
      const currentTags = saleForm.tags || [];
      const tagToToggle = action === 'verification' ? SALE_TAGS.VERIFICATION : SALE_TAGS.PROCESS;
      const newTags = toggleTag(currentTags, tagToToggle);
      updateSaleTags(newTags, action);
    } else {
      logSalesAction(action, status);
    }
  };

  const handleAdminAction = (action, status) => {
    logSalesAction(action, status);
  };

  const handleLeadCallAction = (action, status) => {
    resetCallHighlight(); // Reset highlight when action is taken
    if (action === 'sale_done') {
      // When sale-done is selected, set status to ACTIVE without adding tags by default
      logSalesAction('sale_done', SALES_STATUSES.ACTIVE);
    } else if (action === 'cancelled') {
      // When cancelled, set status back to LEAD_CALL
      logSalesAction('cancelled', SALES_STATUSES.LEAD_CALL);
    } else if (action === 'add_note') {
      // Open note modal
      openNoteModal();
    } else if (action === 'update_sale_data') {
      // Update sale data without changing status
      logSalesAction('update_sale_data', SALES_STATUSES.LEAD_CALL);
    } else if (action === 'add_payments') {
      // Show payment section - tag will be updated when payment is successfully added
      setShowPaymentSection(true);
      // Don't update tag immediately - will be handled when payment is saved
    } else {
      logSalesAction(action, status);
    }
  };


  const handlePaymentInfoAction = (action, status) => {
    // Verification and process are now tags, not statuses
    // These actions should only work on ACTIVE sales
    if (action === 'verification') {
      // Toggle verification tag on active sale
      const currentTags = saleForm.tags || [];
      const newTags = toggleTag(currentTags, SALE_TAGS.VERIFICATION);
      updateSaleTags(newTags, 'verification');
    } else if (action === 'process') {
      // Toggle process tag on active sale
      const currentTags = saleForm.tags || [];
      const newTags = toggleTag(currentTags, SALE_TAGS.PROCESS);
      updateSaleTags(newTags, 'process');
    } else if (action === 'ready_for_payment') {
      logSalesAction('ready_for_payment', SALES_STATUSES.READY_FOR_PAYMENT);
    } else if (action === 'cancelled') {
      // When cancelled, set status back to LEAD_CALL
      logSalesAction('cancelled', SALES_STATUSES.LEAD_CALL);
    } else {
      logSalesAction(action, status);
    }
  };

  const handleReadyForPaymentAction = (action, status) => {
    logSalesAction(action, status);
  };

  // Function to update sale tags (for active sales)
  const updateSaleTags = async (newTags, actionName) => {
    if (!saleForm.id && !editId) {
      setError('No sale found to update tags');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const saleId = saleForm.id || editId;
      
      // Update sale with new tags
      const response = await apiClient.put(`/api/sales/${saleId}`, {
        tags: newTags,
        status: saleForm.status // Keep current status
      });

      const result = await response.json();
      
      if (result.success) {
        // Update local form state
        setSaleForm(prev => ({
          ...prev,
          tags: newTags
        }));

        // Log the tag action
        const customerId = customer.id || result.data?.customerId;
        if (customerId) {
          const logData = {
            saleId: saleId,
            customerId: customerId,
            agentId: user?.id,
            action: actionName,
            status: saleForm.status,
            currentSaleData: {
              ...saleForm,
              tags: newTags
            }
          };
          
          await apiClient.post('/api/sales-logs', logData);
        }

        const tagName = actionName === 'verification' ? 'Verification' : 'Process';
        const isAdded = hasTag(newTags, actionName === 'verification' ? SALE_TAGS.VERIFICATION : SALE_TAGS.PROCESS);
        showSuccess(`Tag "${tagName}" ${isAdded ? 'added' : 'removed'}`);
      } else {
        setError(result.message || 'Failed to update tags');
      }
    } catch (error) {
      console.error('Error updating tags:', error);
      setError('Failed to update tags');
    } finally {
      setSaving(false);
    }
  };

  // Update processing_required in backend when Process toggle is changed (active sales)
  const updateProcessingRequired = async (value) => {
    if (!saleForm.id && !editId) return;
    setSaving(true);
    setError(null);
    try {
      const saleId = saleForm.id || editId;
      const processingValue = value === true;
      const response = await apiClient.put(`/api/sales/${saleId}`, {
        status: saleForm.status,
        processingRequired: processingValue
      });
      const result = await response.json();
      if (result.success) {
        setSaleForm(prev => ({ ...prev, processingRequired: processingValue }));
        showSuccess(processingValue ? 'Processing required set' : 'Processing required cleared');
      } else {
        setError(result.message || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating processing required:', err);
      setError('Failed to update');
    } finally {
      setSaving(false);
    }
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

  // Handle customer dialog close for Check Number flow
  const handleCheckNumberCustomerDialogClose = async () => {
    setShowCustomerDialog(false);
    
    if (customerWarning && (customerWarning.matchType === 'landline' || customerWarning.matchType === 'exact')) {
      // Check if user explicitly selected "Create New Customer" (selectedCustomerId is explicitly null)
      // We need to distinguish between:
      // - selectedCustomerId === null: User clicked "Create New Customer"
      // - selectedCustomerId === undefined: No selection made yet (should use exact match or first customer)
      // - selectedCustomerId === <number>: User selected an existing customer
      
      if (customerWarning.selectedCustomerId === null) {
        // User explicitly selected "Create New Customer" - restore original name and create new customer
        const originalName = customerWarning.newCustomerName || customer.firstName;
        
        // Restore the original name in the form
        setCustomer(prev => ({
          ...prev,
          firstName: originalName,
          lastName: '',
          email: '',
          phone: prev.phone || '',
          landline: prev.landline,
          address: '',
          state: prev.state || '',
          city: prev.city || '',
          id: undefined
        }));
        
        const customerResult = await createCustomerOnly();
        
        if (customerResult?.id) {
          setCheckedCustomer({
            id: customerResult.id,
            customerId: customerResult.id,
            status: 'checked',
            customerName: customerResult.firstName
          });
          
          // Update customer state with the ID
          setCustomer(prev => ({ ...prev, id: customerResult.id }));
          
          // No last sale for new customer
          setLastSaleInfo({
            lastSale: null,
            customer: customerResult
          });
        }
      } else if (customerWarning.selectedCustomerId) {
        // User selected an existing customer
        const customerToUse = customerWarning.landlineCustomers.find(c => c.id === customerWarning.selectedCustomerId);
        
        if (customerToUse) {
          setCheckedCustomer({
            id: customerToUse.id,
            customerId: customerToUse.id,
            status: 'checked',
            customerName: customerToUse.firstName
          });
          
          // Update customer state with the selected customer's data
          setCustomer(prev => ({
            ...prev,
            firstName: customerToUse.firstName,
            lastName: customerToUse.lastName || '',
            email: customerToUse.email || '',
            phone: customerToUse.phone || '',
            landline: customerToUse.landline || prev.landline,
            address: customerToUse.address || '',
            state: customerToUse.state || '',
            city: customerToUse.city || '',
            id: customerToUse.id
          }));
          
          // Use last sale info from customer data (no additional API call)
          setLastSaleInfo({
            lastSale: customerToUse.lastSale,
            customer: customerToUse
          });
        }
      } else {
        // No explicit selection - use exact match or first customer (fallback behavior)
        const customerToUse = customerWarning.exactMatchCustomer || customerWarning.landlineCustomers[0];
          
        if (customerToUse) {
          setCheckedCustomer({
            id: customerToUse.id,
            customerId: customerToUse.id,
            status: 'checked',
            customerName: customerToUse.firstName
          });
          
          // Update customer state with the ID
          setCustomer(prev => ({ ...prev, id: customerToUse.id }));
          
          // Use last sale info from customer data (no additional API call)
          setLastSaleInfo({
            lastSale: customerToUse.lastSale,
            customer: customerToUse
          });
        }
      }
    }
    
    setCustomerWarning(null);
    setIsCheckNumberMode(false);
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
        ssnNumberStatus: sanitizeEnumValue(saleForm.ssn_number_status),
        carrier: sanitizeValue(saleForm.carrier),
        basicPackage: sanitizeValue(saleForm.basicPackage),
        basicPackageStatus: sanitizeEnumValue(saleForm.basicPackageStatus),
        newPackage: sanitizeValue(saleForm.newPackage),
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
        additionalInfo: sanitizeValue(saleForm.additionalInfo),
        notes: (() => {
          const notesValue = saleForm.notes && saleForm.notes.trim() !== '' ? saleForm.notes : null;
          return notesValue;
        })(), // Only send notes if there's content
        services: saleForm.services || [],
        receivers: saleForm.receivers || {},
        receiversInfo: saleForm.receiversInfo || {},
        techVisitDate: saleForm.techVisitDate ? new Date(saleForm.techVisitDate).toISOString() : null,
        techVisitTime: saleForm.techVisitTime || null,
        appointment_datetime: saleForm.appointmentDateTime || null
      };


      // Sync latest customer form fields to backend before creating sale
      try {
        if (existingCustomerId) {
          const customerUpdate = {
            firstName: customer.firstName || undefined,
            landline: customer.landline || undefined,
            phone: customer.phone || undefined,
            address: customer.address || undefined,
            state: customer.state || undefined,
            city: customer.city || undefined,
            country: customer.country || undefined,
            mailingAddress: customer.mailingAddress || undefined,
            customerFeedback: customer.customerFeedback || undefined
          };
          await apiClient.put(`/api/customers/${existingCustomerId}`, customerUpdate);
        }
      } catch (e) {
        console.warn('Customer sync before sale failed', e);
      }

      // Create the sale
      const response = await apiClient.post('/api/sales', saleData);
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to create sale');
      }
      
      // Log the sale creation action
      await apiClient.post('/api/sales-logs', {
        saleId: result.data.id,
        customerId: existingCustomerId,
        agentId: user?.id,
        action: 'sale_created',
        status: status,
        note: (() => {
          // Get last sale info from customerWarning if available
          
          // For exact match (Case 1)
          if (customerWarning && customerWarning.lastSaleDateTime) {
            const lastSaleDateTime = customerWarning.lastSaleDateTime;
            const lastSaleStatus = customerWarning.lastSaleStatus || 'N/A';
            
            return `Sale created with existing customer; Last Sale: ${lastSaleDateTime} | Status: ${lastSaleStatus}`;
          }
          
          // For landline match (Case 2) - get info from selected customer
          if (customerWarning && customerWarning.matchType === 'landline' && customerWarning.selectedCustomerId) {
            const selectedCustomer = customerWarning.landlineCustomers?.find(c => c.id === customerWarning.selectedCustomerId);
            if (selectedCustomer && selectedCustomer.sales && selectedCustomer.sales.length > 0) {
              const lastSale = selectedCustomer.sales[0]; // Most recent sale (sorted by created_at DESC)
              const dateStr = lastSale.created_at ? new Date(lastSale.created_at).toLocaleDateString() : '';
              const timeStr = lastSale.created_at ? new Date(lastSale.created_at).toLocaleTimeString() : '';
              const statusStr = lastSale.status || 'N/A';
              
              return `Sale created with existing customer; Last Sale: ${dateStr} ${timeStr} | Status: ${statusStr}`;
            }
          }
          
          return 'Sale created with existing customer; Last Sale: No previous sale.';
        })(),
        appointment_datetime: saleForm.appointmentDateTime || null
      });
      
      // Log notes if any exist
      if (result.data.id && existingCustomerId && saleForm.notes) {
        const notes = parseNotes(saleForm.notes);
        for (const note of notes) {
          await logNoteActionForNewSale(result.data.id, existingCustomerId, 'add_note', {
            noteId: note.id,
            noteContent: note.note,
            appointment: note.appointment,
            timestamp: note.timestamp
          });
        }
      }
      
      // Navigate back to home
      router.push('/');
    } catch (error) {
      setError(error.message || 'Failed to create sale');
    } finally {
      setSaving(false);
    }
  };

  // Log note actions without triggering full sale update
  const logNoteAction = async (action, noteData) => {
    
    // Skip if we don't have required data
    if (!user?.id) {
      return;
    }

    if (!saleForm.status) {
      return;
    }

    // For new sales, we need to skip logging until the sale is created
    // because we don't have saleId and customerId yet
    if (!isEditMode || !editId) {
      return;
    }

    if (!customer.id) {
      return;
    }

    try {
      const logData = {
        saleId: editId,
        customerId: customer.id,
        agentId: user.id,
        action: action,
        status: saleForm.status,
        note: noteData.noteContent || '',
        appointment_datetime: saleForm.appointmentDateTime || null,
        currentSaleData: {
          noteId: noteData.noteId,
          noteContent: noteData.noteContent,
          appointment: noteData.appointment,
          timestamp: noteData.timestamp,
          totalNotes: parseNotes(saleForm.notes).length
        }
      };
      
      const response = await apiClient.post('/api/sales-logs', logData);
      const responseData = await response.json();
      
      if (!responseData.success) {
        console.error('Failed to log note action:', responseData.message);
      }
    } catch (error) {
      console.error('Error logging note action:', error);
    }
  };

  // Log note actions for new sales after they are created
  const logNoteActionForNewSale = async (saleId, customerId, action, noteData) => {
    if (!saleId || !customerId || !user?.id) return;
    
    try {
      const logData = {
        saleId: saleId,
        customerId: customerId,
        agentId: user.id,
        action: action,
        status: saleForm.status,
        note: noteData.noteContent || '',
        appointment_datetime: saleForm.appointmentDateTime || null,
        currentSaleData: {
          noteId: noteData.noteId,
          noteContent: noteData.noteContent,
          appointment: noteData.appointment,
          timestamp: noteData.timestamp,
          totalNotes: parseNotes(saleForm.notes).length
        }
      };
      
      const response = await apiClient.post('/api/sales-logs', logData);
      const responseData = await response.json();
      
      if (!responseData.success) {
        console.error('Failed to log note action for new sale:', responseData.message);
      }
    } catch (error) {
      console.error('Error logging note action for new sale:', error);
    }
  };

  // Sales logging function
  const logSalesAction = async (action, status, additionalData = {}) => {
    
    setSaving(true);
    setError(null);
    
    // Only update status if it's not null
    if (status !== null) {
      setSaleStatus(status);
      
      // Update sale form status and tags
      setSaleForm(prev => ({
        ...prev,
        status: status,
        // Update tags if provided in additionalData
        tags: additionalData.tags !== undefined ? additionalData.tags : prev.tags || []
      }));
    }
    
    // Validate customer fields before proceeding
    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return;
    }
    
    try {
      // Only save sale if status is not null
      let saleResult = null;
      if (status !== null) {
        saleResult = await addSale(status, additionalData);
        
        // Set created sale for call button display (after any sale is created)
        if (saleResult?.id) {
          setCreatedSale({
            id: saleResult.id,
            customerId: customer.id || saleResult.customerId,
            status: status
          });
          // Show call info for "Check Number" flow (status "lead")
          if (status === 'lead') {
            setShowCallInfo(true);
          }
        }
      }
      
      // Log the action if we have valid IDs (either from sale result or existing sale)
      const saleId = saleResult?.id || saleForm.id || editId;
      const customerId = customer.id || saleResult?.customerId;
      
      if (saleId && customerId) {
        const logData = {
          saleId: saleId,
          customerId: customerId,
          agentId: user?.id,
          action,
          status: status || saleForm.status, // Use current status if not changing
          currentSaleData: {
            ...saleForm,
            customer,
            status: status || saleForm.status,
            ...additionalData
          },
          breakdown: saleForm.breakdown || '',
          note: saleForm.notes || '',
          appointment_datetime: additionalData.appointmentDateTime || saleForm.appointmentDateTime || null
        };
       
        // Log the action to sales logs
        const response = await apiClient.post('/api/sales-logs', logData);
        const responseData = await response.json();
        
        if (!responseData.success) {
          console.error('Failed to log sales action:', responseData.message);
        }
      }
    } catch (error) {
      console.error('Error in logSalesAction:', error);
      setError('Failed to log sales action');
    } finally {
      setSaving(false);
    }
  };

  // Handle "Not a Customer" action - add customer if not exists, update if already added
  const handleNotACustomer = async () => {
    setSaving(true);
    setError(null);

    if (!validateAllCustomerFields()) {
      setError('Please fix the validation errors before proceeding');
      setSaving(false);
      return;
    }

    if (!customer.firstName || customer.firstName.trim() === '') {
      setError('Please enter customer name to mark as non-prospect');
      setSaving(false);
      return;
    }

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
      status: 'non_prospect'
    };

    try {
      let customerId = null;

      // 1) If we already have a customer id (e.g. from "Check Customer" exact match), update that customer
      if (customer.id) {
        customerId = customer.id;
        const updateRes = await apiClient.put(`/api/customers/${customerId}`, { status: 'non_prospect' });
        const updateResult = await updateRes.json();
        if (!updateResult.success) {
          setError(updateResult.message || 'Failed to update customer status.');
          return;
        }
      } else {
        // 2) Check if customer exists by number + name (landline or phone)
        const numberToCheck = customer.landline || customer.phone;
        if (numberToCheck) {
          const checkRes = await apiClient.post('/api/customers/check-existing', {
            landline: numberToCheck,
            firstName: customer.firstName.trim()
          });
          const checkResult = await checkRes.json();
          if (checkResult.success && checkResult.hasExactMatch && checkResult.exactMatchCustomer) {
            customerId = checkResult.exactMatchCustomer.id;
            const updateRes = await apiClient.put(`/api/customers/${customerId}`, { status: 'non_prospect' });
            const updateResult = await updateRes.json();
            if (!updateResult.success) {
              setError(updateResult.message || 'Failed to update customer status.');
              return;
            }
          }
        }

        // 3) If no existing customer, create new one
        if (!customerId) {
          const createRes = await apiClient.post('/api/customers', customerData);
          const createResult = await createRes.json();
          if (!createResult.success) {
            if (createResult.error === 'DUPLICATE_CUSTOMER') {
              setError('A customer with this name and number already exists. Please use a different name or number.');
            } else if (createResult.error === 'VALIDATION_ERROR') {
              setError(createResult.message || 'Please check the customer information and try again.');
            } else {
              setError(createResult.message || 'Failed to create customer record. Please try again.');
            }
            return;
          }
          customerId = createResult.data.id;
        }
      }

      // Log the "not a customer" event in sales_logs (without a sale)
      await apiClient.post('/api/sales-logs', {
        saleId: null,
        customerId: customerId,
        agentId: user?.id,
        action: 'customer_marked_non_prospect',
        status: 'non_prospect',
        note: `Customer marked as non-prospect (not a customer). No sale created.`,
        spokeTo: customer.firstName || null,
        appointment_datetime: null
      });

      router.push('/');
    } catch (error) {
      setError(error.message || 'Failed to mark customer as non-prospect. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Non-Prospect: Delete sale and update customer status
  const handleNonProspect = async () => {
    // Confirm action
    const confirmed = window.confirm(
      'Are you sure you want to mark this customer as Non-Prospect? ' + 
      (isEditMode ? 'This will delete the current sale and cannot be undone.' : 'This customer will not have a sale record.')
    );
    
    if (!confirmed) return;
    
    setSaving(true);
    setError(null);
    
    try {
      if (isEditMode) {
        // Check if sale status allows non-prospect action
        const allowedStatuses = ['appointment', 'hang-up', 'no_response', 'voicemail'];
        if (!allowedStatuses.includes(saleForm.status)) {
          setError('Non-Prospect can only be applied to sales with status: Appointment, Hang-Up, No Response, or Voicemail');
          setSaving(false);
          return;
        }
        
        // For existing sale: Get the sale to find customer ID, then delete sale and update customer
        const saleResponse = await apiClient.get(`/api/sales/${editId}`);
        const saleResult = await saleResponse.json();
        
        if (!saleResult.success) {
          throw new Error('Failed to fetch sale data');
        }
        
        const customerId = saleResult.data.customerId;
        
        // Update customer status to non_prospect
        const customerUpdateResponse = await apiClient.put(`/api/customers/${customerId}`, {
          status: 'non_prospect'
        });
        
        const customerUpdateResult = await customerUpdateResponse.json();
        if (!customerUpdateResult.success) {
          throw new Error('Failed to update customer status');
        }
        
        // Log the action in sales_logs before deleting
        await apiClient.post('/api/sales-logs', {
          saleId: null,
          customerId: customerId,
          agentId: user?.id,
          action: 'customer_marked_non_prospect',
          status: saleForm.status || 'unknown',
          note: `Customer marked as non-prospect. Sale deleted. Previous status: ${saleForm.status || 'unknown'}`,
          spokeTo: saleForm.spoke_to || null,
          appointment_datetime: null
        });
        
        // Delete the sale
        const deleteResponse = await apiClient.delete(`/api/sales/${editId}`);
        const deleteResult = await deleteResponse.json();
        
        if (!deleteResult.success) {
          throw new Error('Failed to delete sale');
        }
        
        // Redirect to dashboard
        router.push('/');
      } else {
        // For new sale (not yet created): Just create customer with non_prospect status
        handleNotACustomer();
      }
    } catch (error) {
      setError(error.message || 'Failed to mark customer as non-prospect. Please try again.');
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
        // If customer already has an ID (from Check Number flow), use it directly
        if (customer.id) {
          customerId = customer.id;
        } else if (customer.landline) {
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
                lastSaleStatus: checkResult.lastSale?.status || 'No previous sales',
                agentName: displayAgentName,
                isCurrentUser: isCurrentUser,
                customerId: checkResult.customer.id,
                lastSale: checkResult.lastSale // Include the full lastSale object with agent info
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
        // Include tags if provided in additionalData (for sale-done action)
        tags: additionalData.tags || saleForm.tags || [],
        spokeTo: sanitizeValue(saleForm.spoke_to),
        pinCode: sanitizeValue(saleForm.pin_code),
        pinCodeStatus: sanitizeEnumValue(saleForm.pin_code_status),
        ssnName: sanitizeValue(saleForm.ssnName),
        ssnNumber: sanitizeValue(saleForm.ssnNumber),
        ssnNumberStatus: sanitizeEnumValue(saleForm.ssn_number_status),
        carrier: sanitizeValue(saleForm.carrier),
        basicPackage: sanitizeValue(saleForm.basicPackage),
        basicPackageStatus: sanitizeEnumValue(saleForm.basicPackageStatus),
        newPackage: sanitizeValue(saleForm.newPackage),
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
        additionalInfo: sanitizeValue(saleForm.additionalInfo),
        notes: (() => {
          // Use notes from additionalData if available (from appointment modal), otherwise use saleForm.notes
          const notesSource = additionalData.notes !== undefined ? additionalData.notes : saleForm.notes;
          const notesValue = notesSource && notesSource.trim() !== '' ? notesSource : null;
          return notesValue;
        })(), // Only send notes if there's content
        services: saleForm.services,
        receivers: saleForm.receivers,
        receiversInfo: saleForm.receiversInfo,
        techVisitDate: sanitizeValue(saleForm.techVisitDate),
        techVisitTime: sanitizeValue(saleForm.techVisitTime),
        appointment_datetime: additionalData.appointmentDateTime || saleForm.appointmentDateTime || null,
        processingRequired: saleForm.processingRequired === undefined ? null : saleForm.processingRequired
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
        // Sync latest customer form fields to backend before creating sale
        try {
          if (customerId) {
            const customerUpdate = {
              firstName: customer.firstName || undefined,
              landline: customer.landline || undefined,
              phone: customer.phone || undefined,
              address: customer.address || undefined,
              state: customer.state || undefined,
              city: customer.city || undefined,
              country: customer.country || undefined,
              mailingAddress: customer.mailingAddress || undefined,
              customerFeedback: customer.customerFeedback || undefined
            };
            await apiClient.put(`/api/customers/${customerId}`, customerUpdate);
          }
        } catch (e) {
          console.warn('Customer sync before sale failed', e);
        }

        const response = await apiClient.post('/api/sales', saleData);
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to create sale');
        }
        saleResult = result.data;
        
        // Log note actions for new sales after they are created
        if (saleResult.id && customerId && saleForm.notes) {
          const notes = parseNotes(saleForm.notes);
          for (const note of notes) {
            await logNoteActionForNewSale(saleResult.id, customerId, 'add_note', {
              noteId: note.id,
              noteContent: note.note,
              appointment: note.appointment,
              timestamp: note.timestamp
            });
          }
        }
      }
      
      // Navigate back to home
      router.push('/');
      
      return saleResult;
    } catch (error) {
      setError(error.message || 'An error occurred while saving the sale');
    } finally {
      setSaving(false);
    }
  };

  // Check if any call is active
  const hasActiveCall = () => {
    return callButtonRefs.current.some(ref => ref && ref.current && ref.current.hasActiveCall && ref.current.hasActiveCall());
  };


  // Handle window/tab close - hangup call
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasActiveCall()) {
        // Hangup all active calls synchronously
        callButtonRefs.current.forEach(ref => {
          if (ref && ref.current && ref.current.hangUp) {
            try {
              ref.current.hangUp();
            } catch (err) {
              console.warn('Error hanging up call on unload:', err);
            }
          }
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Cleanup: Hangup all calls when component unmounts (agent navigates away)
  // useEffect(() => {
  //   return () => {
  //     // Component is unmounting - hangup all active calls
  //     console.log('🧹 AddSale component unmounting - hanging up all active calls');
  //     callButtonRefs.current.forEach(ref => {
  //       if (ref && ref.current && ref.current.hangUp) {
  //         try {
  //           // Call handleEndCall (same as clicking "End Call" button)
  //           // This ensures proper cleanup: disconnects SDK, cancels outbound call, resets state
  //           ref.current.hangUp();
  //         } catch (err) {
  //           console.warn('Error hanging up call on unmount:', err);
  //         }
  //       }
  //     });
  //   };
  // }, []);

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
            <div className="flex items-center gap-3">
              {user?.role === 'admin' && (
                <button
                  onClick={handleDownloadDoc}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  Download DOC
                </button>
              )}
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
                {(() => {
                  const isDeclinedForNonAdmin = getCurrentStep() === 'admin' && user?.role !== 'admin' && 
                    ((saleForm.status || '').toLowerCase() === SALES_STATUSES.DECLINED.toLowerCase() || 
                     (saleForm.status || '').toLowerCase() === 'declined');
                  
                  if (isDeclinedForNonAdmin) {
                    return 'Status Actions';
                  }
                  
                  return `Step ${getCurrentStep() === 'first' ? '1' : 
                      getCurrentStep() === 'lead-call' ? 'Lead-Call' :
                      getCurrentStep() === 'payment-info' ? 'Payment-Info' :
                      getCurrentStep() === 'ready-for-payment' ? 'Ready-For-Payment' :
                      getCurrentStep() === 'second' ? '2' : 
                      getCurrentStep() === 'third' ? '3' : 'Admin'}: ${getCurrentStep() === 'first' ? ' Initial Contact' : 
                 getCurrentStep() === 'lead-call' ? (saleForm.status === 'cancelled' ? ' Lead Call (Cancelled Sale)' : ' Lead Call') :
                 // payment-info step removed - now a tag
                 getCurrentStep() === 'ready-for-payment' ? ' Ready for Payment' :
                 getCurrentStep() === 'second' ? ' Active Engagement' : 
                 getCurrentStep() === 'third' ? ' Processing' : ' Final Actions'}`;
                })()}
              </h3>
              <div className="text-sm text-gray-500">
                {/* <div>Status: {saleForm.status || 'New'}</div>
                <div>Edit Mode: {isEditMode ? 'Yes' : 'No'}</div>
                <div>Step: {getCurrentStep()}</div> */}
                {getCurrentStep() === 'admin' && user?.role !== 'admin' && (() => {
                  const currentStatus = (saleForm.status || '').toLowerCase();
                  const isDeclined = currentStatus === SALES_STATUSES.DECLINED.toLowerCase() || currentStatus === 'declined';
                  // Don't show "Read-only" message when status is declined since non-admin users have actions available
                  if (isDeclined) {
                    return null;
                  }
                  return <div className="text-orange-600 font-medium">Read-only: Admin actions required</div>;
                })()}
              </div>
            </div>
          </div>

          {/* Call End Page Overlay - Makes customer info and below uneditable */}
          

          {/* Step 1: Initial Contact Actions */}
          {getCurrentStep() === 'first' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleFirstStepAction('hangup', SALES_STATUSES.HANG_UP)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.HANG_UP)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                📞 Hangup
              </button>
              <button
                onClick={() => handleFirstStepAction('no_response', SALES_STATUSES.NO_RESPONSE)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.NO_RESPONSE)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                ❌ No Response
              </button>
              <button
                onClick={() => handleFirstStepAction('voicemail', SALES_STATUSES.VOICEMAIL)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.VOICEMAIL)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                📧 Voicemail
              </button>
              <button
                onClick={() => handleFirstStepAction('appointment', SALES_STATUSES.APPOINTMENT)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.APPOINTMENT)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-purple-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                📅 Appointment
              </button>
              <button
                onClick={() => handleFirstStepAction('lead_call', SALES_STATUSES.LEAD_CALL)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.LEAD_CALL)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                🎯 Lead Call
              </button>
              <button
                onClick={() => handleFirstStepAction('sale_done', SALES_STATUSES.SALE_DONE)}
                disabled={saving || loading}
                className={`${getStatusColorClass(SALES_STATUSES.SALE_DONE)} text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                ✅ Sale Done
              </button>
              <button
                onClick={isEditMode ? handleNonProspect : handleNotACustomer}
                disabled={saving || loading}
                className="bg-gray-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚫 Not a Customer
              </button>
              <button
                onClick={isEditMode ? handleNonProspect : handleNotACustomer}
                disabled={saving || loading}
                className="bg-amber-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-amber-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📵 Disconnect #
              </button>
              </div>
            </div>
          )}

          {/* Lead-Call Actions */}
          {getCurrentStep() === 'lead-call' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleLeadCallAction('sale_done', SALES_STATUSES.SALE_DONE)}
                disabled={saving || loading}
                className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Sale Done
              </button>
              <button
                onClick={() => handleLeadCallAction('add_note', 'lead-call')}
                disabled={saving || loading}
                className="bg-yellow-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📝 Add Note
              </button>
              <button
                onClick={() => handleLeadCallAction('update_sale_data', 'lead-call')}
                disabled={saving || loading}
                className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📝 Update Sale Data
              </button>
              <button
                onClick={() => handleLeadCallAction('add_payments', 'payment_info')}
                disabled={saving || loading}
                className="bg-green-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💳 Add Payments
              </button>
              <button
                onClick={() => handleLeadCallAction('cancelled', SALES_STATUSES.CANCELLED)}
                disabled={saving || loading}
                className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Cancelled
              </button>
              </div>
            </div>
          )}


          {/* Payment Info Actions */}
          {getCurrentStep() === 'payment-info' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handlePaymentInfoAction('verification', 'verification')}
                disabled={saving || loading}
                className="bg-indigo-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔍 Verification
              </button>
              <button
                onClick={() => handlePaymentInfoAction('process', 'process')}
                disabled={saving || loading}
                className="bg-yellow-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚙️ Process
              </button>
              <button
                onClick={() => handlePaymentInfoAction('ready_for_payment', 'ready-for-payment')}
                disabled={saving || loading}
                className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Authorize
              </button>
              <button
                onClick={() => handlePaymentInfoAction('cancelled', SALES_STATUSES.CANCELLED)}
                disabled={saving || loading}
                className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Cancelled
              </button>
              </div>
            </div>
          )}

          {/* Ready for Payment Actions - Only visible to admin users */}
          {getCurrentStep() === 'ready-for-payment' && user?.role === 'admin' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleReadyForPaymentAction('charged', 'charged')}
                disabled={saving || loading}
                className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💰 Charged
              </button>
              <button
                onClick={() => handleReadyForPaymentAction('declined', 'declined')}
                disabled={saving || loading}
                className="bg-red-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Declined
              </button>
              <button
                onClick={() => handleReadyForPaymentAction('chargeback', 'chargeback')}
                disabled={saving || loading}
                className="bg-red-800 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Chargeback
              </button>
              <button
                onClick={() => handleReadyForPaymentAction('cancelled', SALES_STATUSES.CANCELLED)}
                disabled={saving || loading}
                className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Cancelled
              </button>
              </div>
            </div>
          )}

          {/* Sale Status Display - For agents and supervisors when ready for payment */}
          {getCurrentStep() === 'ready-for-payment' && user?.role !== 'admin' && (
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Sale Status</h4>
                  <p className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                    Current status: <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColorClass(saleForm.status)} text-white`}>
                      {getStatusDisplayName(saleForm.status)}
                    </span>
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  Payment processing requires administrator approval
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Active Engagement Actions */}
          {getCurrentStep() === 'second' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {/* Sale Done specific actions */}
              {saleForm.status === 'sale-done' && (
                <>
                  <button
                    onClick={() => handleSecondStepAction('add_note', SALES_STATUSES.SALE_DONE)}
                    disabled={saving || loading}
                    className="bg-yellow-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📝 Add Note
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('add_payments', SALES_STATUSES.PAYMENT_INFO)}
                    disabled={saving || loading}
                    className="bg-green-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💳 Add Payments
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('update_sale_data', SALES_STATUSES.SALE_DONE)}
                    disabled={saving || loading}
                    className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📝 Update Sale Data
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('cancelled', SALES_STATUSES.CANCELLED)}
                    disabled={saving || loading}
                    className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ❌ Cancelled
                  </button>
                </>
              )}
              
              {/* ACTIVE status actions with tags */}
              {saleForm.status === SALES_STATUSES.ACTIVE && (
                <>
                  {/* Tags Management Section */}
                  <div className="col-span-full mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Tags:</h4>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          const currentTags = saleForm.tags || [];
                          const newTags = toggleTag(currentTags, SALE_TAGS.VERIFICATION);
                          updateSaleTags(newTags, 'verification');
                        }}
                        disabled={saving || loading}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                          hasTag(saleForm.tags, SALE_TAGS.VERIFICATION)
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {hasTag(saleForm.tags, SALE_TAGS.VERIFICATION) ? '✓ ' : ''}
                        🔍 Verification
                      </button>
                      <button
                        onClick={() => {
                          const currentTags = saleForm.tags || [];
                          const newTags = toggleTag(currentTags, SALE_TAGS.PROCESS);
                          updateSaleTags(newTags, 'process');
                        }}
                        disabled={saving || loading || !processButtonEnabled}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                          hasTag(saleForm.tags, SALE_TAGS.PROCESS)
                            ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {hasTag(saleForm.tags, SALE_TAGS.PROCESS) ? '✓ ' : ''}
                        ⚙️ Process
                      </button>
                       {/* Toggle to enable/disable Process button */}
                       <div className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={processButtonEnabled}
                          onClick={() => {
                            const newValue = !processButtonEnabled;
                            setProcessButtonEnabled(newValue);
                            setSaleForm(prev => ({ ...prev, processingRequired: newValue }));
                            updateProcessingRequired(newValue); // Sale id is always present here (only shown for active sales)
                          }}
                          disabled={saving || loading}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                            processButtonEnabled ? 'bg-yellow-500' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                              processButtonEnabled ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-xs text-gray-600">Processing required</span>
                      </div>
                    </div>
                    {/* Display current tags - automatically include payment-info if cards/banks exist */}
                    {(() => {
                      // Get tags from form
                      const displayTags = [...(saleForm.tags || [])];
                      
                      // When sale is active and does NOT have verification tag, show "Verification required"
                      if (saleForm.status === SALES_STATUSES.ACTIVE && !hasTag(saleForm.tags, SALE_TAGS.VERIFICATION) && !displayTags.includes(DISPLAY_TAGS.VERIFICATION_REQUIRED)) {
                        displayTags.push(DISPLAY_TAGS.VERIFICATION_REQUIRED);
                      }
                      
                      // Show "Processing required" only when toggle is on AND value is true; hide when toggle is false or value is null/false
                      if (processButtonEnabled && saleForm.processingRequired === true && !hasTag(saleForm.tags, SALE_TAGS.PROCESS) && !displayTags.includes(DISPLAY_TAGS.PROCESSING_REQUIRED)) {
                        displayTags.push(DISPLAY_TAGS.PROCESSING_REQUIRED);
                      }
                      
                      // Check if sale has cards or banks (from fetched sale data)
                      const hasCards = sale?.cards && sale.cards.length > 0;
                      const hasBanks = sale?.banks && sale.banks.length > 0;
                      const hasPayments = hasCards || hasBanks;
                      
                      // Automatically add payment-info tag if payments exist (but don't save to form state)
                      if (hasPayments && !displayTags.includes(SALE_TAGS.PAYMENT_INFO)) {
                        displayTags.push(SALE_TAGS.PAYMENT_INFO);
                      }
                      
                      if (displayTags.length === 0) {
                        return <span className="text-gray-400 text-sm">No tags</span>;
                      }
                      
                      return (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          {displayTags.map(tag => (
                            <span key={tag} className={`px-2 py-1 rounded text-xs ${getTagBadgeClasses(tag)}`}>
                              {getTagDisplayName(tag)}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* ACTIVE status buttons: Add Payment, Add Note, Update Sale Data, Cancelled */}
                  <button
                    onClick={() => handleSecondStepAction('add_payments', saleForm.status)}
                    disabled={saving || loading}
                    className="bg-green-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💳 Add Payment
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('add_note', saleForm.status)}
                    disabled={saving || loading}
                    className="bg-yellow-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📝 Add Note
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('update_sale_data', saleForm.status)}
                    disabled={saving || loading}
                    className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📝 Update Sale Data
                  </button>
                  <button
                    onClick={() => handleSecondStepAction('cancelled', SALES_STATUSES.CANCELLED)}
                    disabled={saving || loading}
                    className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ❌ Cancelled
                  </button>
                </>
              )}
              
              {/* General Step 2 actions for other statuses */}
              {saleForm.status !== 'sale-done' && saleForm.status !== SALES_STATUSES.ACTIVE && (
                <>
                  <button
                    onClick={() => handleSecondStepAction('update_sale_data', saleForm.status)}
                    disabled={saving || loading}
                    className="bg-blue-500 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📝 Update Sale Data
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
                    onClick={() => handleSecondStepAction('cancelled', SALES_STATUSES.CANCELLED)}
                    disabled={saving || loading}
                    className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ❌ Cancelled
                  </button>
                </>
              )}
              </div>
            </div>
          )}

          {/* Step 3: Processing Actions */}
          {getCurrentStep() === 'third' && !showPaymentSection && (
            <div className={`p-4 rounded-lg transition-all duration-500 ${
              callJustEnded 
                ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                : 'bg-transparent'
            }`}>
              {callJustEnded && (
                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                  <p className="text-blue-800 text-sm font-medium">
                    📞 Call completed! Please select the outcome below:
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handleThirdStepAction('verification', 'verification')}
                disabled={saving || loading}
                className="bg-indigo-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔍 Verification
              </button>
              <span className="text-xs font-medium text-gray-600 flex items-center">Processing required:</span>
              <button
                onClick={() => handleThirdStepAction('process', 'process')}
                disabled={saving || loading || !processButtonEnabled}
                className="bg-yellow-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-yellow-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚙️ Process
              </button>
              <button
                onClick={() => handleThirdStepAction('charge_pending', SALES_STATUSES.READY_FOR_PAYMENT)}
                disabled={saving || loading}
                className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💰 Charge Pending
              </button>
              <button
                onClick={() => handleThirdStepAction('cancelled', SALES_STATUSES.CANCELLED)}
                disabled={saving || loading}
                className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ❌ Cancelled
              </button>
              </div>
            </div>
          )}

          {/* Admin Actions - Visible based on status rules */}
          {getCurrentStep() === 'admin' && !showPaymentSection && (() => {
            const currentStatus = (saleForm.status || '').toLowerCase();
            const isCharged = currentStatus === SALES_STATUSES.CHARGED.toLowerCase() || currentStatus === 'charged';
            const isDeclined = currentStatus === SALES_STATUSES.DECLINED.toLowerCase() || currentStatus === 'declined';
            const isChargeback = currentStatus === SALES_STATUSES.CHARGEBACK.toLowerCase() || currentStatus === 'chargeback';
            
            // Determine which buttons to show based on status
            let showButtons = false;
            let showCharged = false;
            let showDeclined = false;
            let showChargeback = false;
            let showCancelled = false;
            let showReadyForPayment = false;
            let sectionTitle = 'Admin Actions';
            let isAdminOnly = true;
            
            if (isCharged) {
              // If charged: show only Chargeback button (admin only)
              if (user?.role === 'admin') {
                showButtons = true;
                showChargeback = true; // Chargeback only shows when status is charged
              }
            } else if (isDeclined) {
              // If declined: Charged (admin only), Declined (admin only), Ready for Payment (all users)
              // Cancelled is shown separately for non-admin users in the section below
              if (user?.role === 'admin') {
                showButtons = true;
                showCharged = true;
                showDeclined = true;
                showReadyForPayment = true; // All users
                // Don't show Cancelled here - it's shown in the non-admin section below
                sectionTitle = 'Status Actions';
              } else {
                // For non-admin users, show Ready for Payment here
                showButtons = true;
                showReadyForPayment = true;
                sectionTitle = 'Status Actions';
              }
            } else if (isChargeback) {
              // If chargeback: show Charged and Declined buttons (admin only)
              if (user?.role === 'admin') {
                showButtons = true;
                showCharged = true;
                showDeclined = true;
                // Don't show chargeback button when already in chargeback status
              }
            } else {
              // For other admin statuses (ready-for-payment, etc.), show buttons (admin only)
              if (user?.role === 'admin') {
                showButtons = true;
                showCharged = true;
                showDeclined = true;
                // Chargeback only shows when status is charged, not for other statuses
                showCancelled = true;
              }
            }
            
            // Check if user has permission
            if (!showButtons || (isAdminOnly && user?.role !== 'admin')) {
              return null;
            }
            
            return (
              <div className={`p-4 rounded-lg transition-all duration-500 ${
                callJustEnded 
                  ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                  : 'bg-transparent'
              }`}>
                {callJustEnded && (
                  <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                    <p className="text-blue-800 text-sm font-medium">
                      📞 Call completed! Please select the outcome below:
                    </p>
                  </div>
                )}
                <h4 className="text-sm font-medium text-gray-900 mb-3">{sectionTitle}</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {showCharged && (
                    <button
                      onClick={() => handleAdminAction('charged', SALES_STATUSES.CHARGED)}
                      disabled={saving || loading}
                      className="bg-pink-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-pink-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      💰 Charged
                    </button>
                  )}
                  {showDeclined && (
                    <button
                      onClick={() => handleAdminAction('declined', SALES_STATUSES.DECLINED)}
                      disabled={saving || loading}
                      className="bg-red-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ❌ Declined
                    </button>
                  )}
                  {showChargeback && (
                    <button
                      onClick={() => handleAdminAction('chargeback', SALES_STATUSES.CHARGEBACK)}
                      disabled={saving || loading}
                      className="bg-red-800 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🔄 Chargeback
                    </button>
                  )}
                  {showCancelled && (
                    <button
                      onClick={() => handleAdminAction('cancelled', SALES_STATUSES.CANCELLED)}
                      disabled={saving || loading}
                      className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ❌ Cancelled
                    </button>
                  )}
                  {showReadyForPayment && (
                    <button
                      onClick={() => handleAdminAction('ready_for_payment', SALES_STATUSES.READY_FOR_PAYMENT)}
                      disabled={saving || loading}
                      className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✅ Authorize
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Sale Status Display with Actions - For agents when status is declined */}
          {getCurrentStep() === 'admin' && user?.role !== 'admin' && (() => {
            const currentStatus = (saleForm.status || '').toLowerCase();
            const isDeclined = currentStatus === SALES_STATUSES.DECLINED.toLowerCase() || currentStatus === 'declined';
            
            if (isDeclined) {
              // Show Cancelled button only for non-admin users when status is declined
              // (Charged and Declined buttons are admin-only and shown in admin section above)
              return (
                <div className={`p-4 rounded-lg transition-all duration-500 ${
                  callJustEnded 
                    ? 'bg-blue-50 border-2 border-blue-400 shadow-lg ring-2 ring-blue-200 relative z-50' 
                    : 'bg-transparent'
                }`}>
                  {callJustEnded && (
                    <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded text-center">
                      <p className="text-blue-800 text-sm font-medium">
                        📞 Call completed! Please select the outcome below:
                      </p>
                    </div>
                  )}
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Status Actions</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    <button
                      onClick={() => handleAdminAction('ready_for_payment', SALES_STATUSES.READY_FOR_PAYMENT)}
                      disabled={saving || loading}
                      className="bg-green-600 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✅ Authorize
                    </button>
                    <button
                      onClick={() => handleAdminAction('cancelled', SALES_STATUSES.CANCELLED)}
                      disabled={saving || loading}
                      className="bg-red-700 text-white font-medium rounded-lg text-xs px-3 py-2 hover:bg-red-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ❌ Cancelled
                    </button>
                  </div>
                </div>
              );
            } else {
              // Show read-only status display for other statuses
              return (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Sale Status</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Current status: <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColorClass(saleForm.status)} text-white`}>
                          {getStatusDisplayName(saleForm.status)}
                        </span>
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      Only administrators can change final payment statuses
                    </div>
                  </div>
                </div>
              );
            }
          })()}
        </div>
      </div>


      {/* Success Message */}
      {successMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-green-800 font-medium">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Section - Shows when Add Payment is clicked */}
      {showPaymentSection && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Payment Information</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Collect payment details from the customer
                  </p>
                </div>
                <button
                  onClick={() => setShowPaymentSection(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Payment Type Tabs */}
              <div className="flex flex-wrap border border-gray-300 rounded-lg mb-6">
                <button
                  onClick={() => setSelectedPaymentType('card')}
                  className={`px-4 py-3 text-sm font-medium rounded-l-lg transition-colors ${
                    selectedPaymentType === 'card'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Credit/Debit Card
                </button>
                <button
                  onClick={() => setSelectedPaymentType('bank')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    selectedPaymentType === 'bank'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Bank Account
                </button>
                <button
                  onClick={() => setSelectedPaymentType('cheque_electronic')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    selectedPaymentType === 'cheque_electronic'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Cheque Electronic
                </button>
                <button
                  onClick={() => setSelectedPaymentType('cheque_mail')}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    selectedPaymentType === 'cheque_mail'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Cheque to Mail
                </button>
                <button
                  onClick={() => setSelectedPaymentType('payment_email')}
                  className={`px-4 py-3 text-sm font-medium rounded-r-lg transition-colors ${
                    selectedPaymentType === 'payment_email'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Email Invoice
                </button>
              </div>

              {/* Payment Form */}
              <div className="bg-gray-50 rounded-lg p-6">
                {selectedPaymentType === 'card' ? (
                  <AddCardForm 
                    mode="create" 
                    saleId={saleForm.id || editId} 
                    customerId={saleForm.customerId}
                    onSuccess={(data) => handlePaymentSuccess('card', data)}
                    initialData={cardFormData}
                    onDataChange={handleCardFormDataChange}
                  />
                ) : selectedPaymentType === 'bank' ? (
                  <AddBankForm 
                    mode="create" 
                    saleId={saleForm.id || editId} 
                    customerId={saleForm.customerId}
                    onSuccess={(data) => handlePaymentSuccess('bank', data)}
                    initialData={bankFormData}
                    onDataChange={handleBankFormDataChange}
                  />
                ) : selectedPaymentType === 'cheque_electronic' ? (
                  <AddChequeElectronicForm 
                    mode="create" 
                    saleId={saleForm.id || editId} 
                    customerId={saleForm.customerId}
                    onSuccess={(data) => handlePaymentSuccess('cheque_electronic', data)}
                    initialData={{}}
                    onDataChange={() => {}}
                  />
                ) : selectedPaymentType === 'cheque_mail' ? (
                  <AddChequeMailForm 
                    mode="create" 
                    saleId={saleForm.id || editId} 
                    customerId={saleForm.customerId}
                    onSuccess={(data) => handlePaymentSuccess('cheque_mail', data)}
                    initialData={{}}
                    onDataChange={() => {}}
                  />
                ) : (
                  <AddPaymentEmailForm 
                    mode="create" 
                    saleId={saleForm.id || editId} 
                    customerId={saleForm.customerId}
                    onSuccess={(data) => handlePaymentSuccess('payment_email', data)}
                    initialData={{}}
                    onDataChange={() => {}}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Information Form */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Customer Information</h2>
            
            {/* View Call History Button - Top of customer information */}
            {customer.id && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => setShowCallHistory(!showCallHistory)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012 2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {showCallHistory ? 'Hide Call History' : 'View Call History'}
                </button>
              </div>
            )}
            
            {/* Call Status Indicator (not in edit mode) */}
            {callData && !isEditMode && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-green-800 text-sm font-medium">
                      Call initiated successfully! Call ID: {callData.callSid}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCallHistory(!showCallHistory)}
                    className="text-green-600 hover:text-green-800 text-sm font-medium underline"
                  >
                    {showCallHistory ? 'Hide Call History' : 'View Call History'}
                  </button>
                </div>
              </div>
            )}


            {/* Call History Button (when no recent call and not in edit mode) */}
            {false && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => setShowCallHistory(!showCallHistory)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {showCallHistory ? 'Hide Call History' : 'View Call History'}
                </button>
              </div>
            )}

            {/* Call History */}
            {showCallHistory && customer.id && (
              <div className="mb-6">
                <CallHistory
                  customerId={customer.id}
                  limit={10}
                  showCustomerInfo={false}
                  showAgentInfo={true}
                  className="bg-gray-50 rounded-lg p-4"
                />
              </div>
            )}
            
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
                    {isEditMode && (
                      <span className="text-gray-500 text-xs ml-2">(Read-only in edit mode)</span>
                    )}
                    {!isEditMode && hideCheckNumberSection && (
                      <span className="text-gray-500 text-xs ml-2">(Read-only - called)</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    id="landline"
                    value={customer.landline}
                    onChange={(e) => handleCustomerChange('landline', e.target.value)}
                    disabled={isEditMode || hideCheckNumberSection}
                    className={`border text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 ${
                      isEditMode || hideCheckNumberSection
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
                        : customerValidation.landline.isValid 
                          ? 'bg-gray-50 border-gray-300' 
                          : 'bg-gray-50 border-red-500 focus:ring-red-500 focus:border-red-500'
                    }`}
                    placeholder="555-123-4567"
                  />
                  {!customerValidation.landline.isValid && (
                    <p className="mt-1 text-sm text-red-600">{customerValidation.landline.message}</p>
                  )}
                  
                  {/* Check Number Button - Show when not in edit mode and not hidden after call */}
                  {!isEditMode && !hideCheckNumberSection && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={handleCheckNumber}
                        disabled={isCheckingNumber || !customerValidation.landline.isValid}
                        className={`px-4 py-2 text-sm font-medium rounded-lg ${
                          isCheckingNumber || !customerValidation.landline.isValid
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-300'
                        }`}
                      >
                        {isCheckingNumber ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Checking...
                          </span>
                        ) : (
                          'Check Number'
                        )}
                      </button>
                      <p className="mt-1 text-xs text-gray-500">
                        This will validate customer and show call button
                      </p>
                    </div>
                  )}
                  

                  {/* Edit Mode - Show Current Sale Information and Call Button */}
                  {isEditMode && saleForm.id && customer.id && !checkedCustomer && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      {/* Ready to Call Section - Always show */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-medium text-blue-800">Ready to Call</h3>
                        {user?.twilio_enabled !== false && (
                          <CallButton
                            ref={(el) => {
                              if (el && !callButtonRefs.current.find(ref => ref?.current === el)) {
                                callButtonRefs.current.push({ current: el });
                              }
                            }}
                            customerId={customer.id}
                            saleId={saleForm.id}
                            phoneNumber={customer.phone || customer.landline}
                            customerName={customer.firstName}
                            callPurpose="follow_up"
                            onCallInitiated={handleCallInitiated}
                            onCallCompleted={handleCallCompleted}
                            size="small"
                            disabled={false} // Will be disabled automatically if there's an active call
                          />
                        )}
                      </div>

                      {/* Current Sale Information - Always show */}
                      <div className="bg-white rounded-lg p-3 border">
                        <h4 className="text-sm font-medium text-gray-800 mb-2">📊 Current Sale Information</h4>
                        <div className="space-y-1 text-xs">
                          <div><strong>Sale ID:</strong> {saleForm.id}</div>
                          <div><strong>Status:</strong> <span className="capitalize">{getStatusDisplayName(saleForm.status)}</span></div>
                          <div><strong>Date:</strong> {new Date(saleForm.created_at).toLocaleDateString()}</div>
                          <div><strong>Time:</strong> {new Date(saleForm.created_at).toLocaleTimeString()}</div>
                          <div><strong>Period:</strong> <span className="text-blue-600 font-medium">{getTimeAgo(saleForm.created_at)}</span></div>
                          {/* Show agent name only if sale belongs to current user */}
                          {(() => {
                            const isCurrentUser = user && saleForm.agent && 
                              (user.id === saleForm.agent.id || 
                               (user.firstName === saleForm.agent.firstName && user.lastName === saleForm.agent.lastName));
                            return isCurrentUser && (
                              <div><strong>Agent:</strong> {saleForm.agent.firstName} {saleForm.agent.lastName}</div>
                            );
                          })()}
                          {saleForm.notes && (
                            <div><strong>Notes:</strong> {saleForm.notes}</div>
                          )}
                        </div>
                      </div>

                    </div>
                  )}


                  {/* Call Button and Last Sale Info - Show after checking number */}
                  {checkedCustomer && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      {/* Ready to Call Section - Always show */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-medium text-blue-800">Ready to Call</h3>
                        {user?.twilio_enabled !== false && (
                          <CallButton
                            ref={(el) => {
                              if (el && !callButtonRefs.current.find(ref => ref?.current === el)) {
                                callButtonRefs.current.push({ current: el });
                              }
                            }}
                            customerId={checkedCustomer.customerId}
                            saleId={null} // No sale created yet
                            phoneNumber={customer.phone || customer.landline}
                            customerName={customer.firstName}
                            callPurpose="follow_up"
                            onCallInitiated={handleCallInitiated}
                            onCallCompleted={handleCallCompleted}
                            size="small"
                          />
                        )}
                      </div>
                      
                      {/* Last Sale Information - Always show */}
                      {lastSaleInfo && (
                        <div className="bg-white rounded-lg p-3 border">
                          <h4 className="text-sm font-medium text-gray-800 mb-2">📊 Last Sale Information</h4>
                          {lastSaleInfo.lastSale ? (
                            <div className="space-y-1 text-xs">
                              <div><strong>Sale ID:</strong> {lastSaleInfo.lastSale.id}</div>
                              <div><strong>Status:</strong> <span className="capitalize">{lastSaleInfo.lastSale.status}</span></div>
                                  <div><strong>Date:</strong> {new Date(lastSaleInfo.lastSale.created_at).toLocaleDateString()}</div>
                                  <div><strong>Time:</strong> {new Date(lastSaleInfo.lastSale.created_at).toLocaleTimeString()}</div>
                                  <div><strong>Period:</strong> <span className="text-blue-600 font-medium">{getTimeAgo(lastSaleInfo.lastSale.created_at)}</span></div>
                              {/* Show agent name only if sale belongs to current user */}
                              {(() => {
                                const isCurrentUser = user && lastSaleInfo.lastSale?.agent && 
                                  (user.id === lastSaleInfo.lastSale.agent.id || 
                                   (user.firstName === lastSaleInfo.lastSale.agent.firstName && user.lastName === lastSaleInfo.lastSale.agent.lastName));
                                return isCurrentUser && (
                                  <div><strong>Agent:</strong> {lastSaleInfo.lastSale.agent.firstName} {lastSaleInfo.lastSale.agent.lastName}</div>
                                );
                              })()}
                              {lastSaleInfo.lastSale.notes && (
                                <div><strong>Notes:</strong> {lastSaleInfo.lastSale.notes}</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-600 text-xs italic">
                              <div>No previous sales found.</div>
                              <div>This is a new customer or first interaction.</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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

                {/* Select Receiver and Receiver Details - Side by Side */}
                <div className="md:col-span-2">
                  <div className="grid gap-6 md:grid-cols-2">
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
                          ) : (
                            <>
                              {receivers.length > 0 && (
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
                              
                              {/* Other option */}
                              <div className="border-t border-gray-200 pt-2 mt-2">
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={showOtherReceiverInput}
                                    onChange={(e) => {
                                      setShowOtherReceiverInput(e.target.checked);
                                      if (!e.target.checked) {
                                        setOtherReceiverName('');
                                      }
                                    }}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="ml-2 text-sm text-gray-900 font-medium">Other</span>
                                </label>
                                
                                {showOtherReceiverInput && (
                                  <div className="mt-2 ml-6 space-y-2">
                                    <input
                                      type="text"
                                      value={otherReceiverName}
                                      onChange={(e) => setOtherReceiverName(e.target.value)}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleCreateOtherReceiver();
                                        }
                                      }}
                                      placeholder="Enter receiver name"
                                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                                      disabled={savingOtherReceiver}
                                    />
                                    <button
                                      type="button"
                                      onClick={handleCreateOtherReceiver}
                                      disabled={savingOtherReceiver || !otherReceiverName.trim()}
                                      className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                      {savingOtherReceiver ? 'Adding...' : 'Add Receiver'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Receiver Details with Collapsible Textarea Template */}
                    {selectedReceiver.length > 0 && (
                      <div>
                        <label className="block mb-2 text-sm font-medium text-gray-900">
                          Receiver Details
                        </label>
                        <div className="space-y-3">
                          {Object.keys(saleForm.receivers).map((receiver) => {
                            const isExpanded = expandedReceivers[receiver] || false;
                            const count = saleForm.receivers[receiver] || 0;
                            
                            return (
                              <div key={receiver} className="border border-gray-200 rounded-lg bg-gray-50">
                                {/* Collapsible Header */}
                                <div 
                                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                  onClick={() => toggleReceiverExpansion(receiver)}
                                >
                                  <div className="flex items-center gap-3">
                                    <svg 
                                      className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                      fill="none" 
                                      stroke="currentColor" 
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <h4 className="text-sm font-medium text-gray-900">{receiver}</h4>
                                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                      Count: {count}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        decrementReceiver(receiver);
                                      }}
                                      className="bg-gray-200 hover:bg-gray-300 border border-gray-300 rounded-s-lg p-2 h-8 focus:ring-gray-100 focus:ring-2 focus:outline-none"
                                    >
                                      <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                      </svg>
                                    </button>
                                    <span className="bg-white border-t border-b border-gray-300 px-3 py-1 h-8 text-center text-gray-900 text-sm font-medium min-w-[2rem] flex items-center justify-center">
                                      {count}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        incrementReceiver(receiver);
                                      }}
                                      className="bg-gray-200 hover:bg-gray-300 border border-gray-300 rounded-e-lg p-2 h-8 focus:ring-gray-100 focus:ring-2 focus:outline-none"
                                    >
                                      <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                
                                {/* Collapsible Content */}
                                {isExpanded && (
                                  <div className="px-4 pb-4 border-t border-gray-200 bg-white">
                                    <div className="pt-4 space-y-3">
                                      {Array.from({ length: count }, (_, index) => (
                                        <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium text-gray-700">
                                              System Information {index + 1}
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() => removeSystemInformation(receiver, index)}
                                              className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1 rounded transition-colors"
                                              title="Remove this system information"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                          <textarea
                                            value={getReceiverTemplate(`${receiver}_${index + 1}`)}
                                            onChange={(e) => updateReceiverTemplate(`${receiver}_${index + 1}`, e.target.value)}
                                            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                            placeholder="Enter system information..."
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

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

                {/* SSN Number and SSN Number Status - Side by Side */}
                <div className="md:col-span-2">
                  <div className="grid gap-6 md:grid-cols-2">
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
                        placeholder="Enter SSN Number"
                      />
                    </div>

                    {/* SSN Number Status */}
                    <div>
                      <label className="block mb-2 text-sm font-medium text-gray-900">
                        SSN Number Status
                      </label>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="ssnMatched"
                            name="ssnNumberStatus"
                            value="matched"
                            checked={saleForm.ssn_number_status === 'matched'}
                            onChange={(e) => handleSaleFormChange('ssn_number_status', e.target.value)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="ssnMatched" className="ml-2 text-sm font-medium text-gray-900">
                            Matched
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="ssnNotMatched"
                            name="ssnNumberStatus"
                            value="not_matched"
                            checked={saleForm.ssn_number_status === 'not_matched'}
                            onChange={(e) => handleSaleFormChange('ssn_number_status', e.target.value)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="ssnNotMatched" className="ml-2 text-sm font-medium text-gray-900">
                            Not Matched
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Basic Package, Package Status, and New Package (conditional) in one row */}
                <div className="md:col-span-2">
                  <div className={`grid gap-6 ${saleForm.basicPackageStatus !== 'same' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
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

                    {/* New Package - Only show when status is NOT "same" */}
                    {saleForm.basicPackageStatus !== 'same' && (
                      <div>
                        <label htmlFor="newPackage" className="block mb-2 text-sm font-medium text-gray-900">
                          New Package
                        </label>
                        <input
                          type="text"
                          id="newPackage"
                          value={saleForm.newPackage}
                          onChange={(e) => handleSaleFormChange('newPackage', e.target.value)}
                          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                          placeholder="Enter New Package"
                        />
                      </div>
                    )}
                  </div>
                </div>

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

              {/* Additional Info */}
              <div>
                <label htmlFor="additionalInfo" className="block mb-2 text-sm font-medium text-gray-900">
                  Additional Info
                </label>
                <textarea
                  id="additionalInfo"
                  rows={8}
                  value={saleForm.additionalInfo}
                  onChange={(e) => handleSaleFormChange('additionalInfo', e.target.value)}
                  className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Additional information here"
                />
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-900">
                    Notes
                  </label>
                  <button
                    type="button"
                    onClick={openNoteModal}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-yellow-500 border border-transparent rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Note
                  </button>
                </div>
                <div 
                  ref={notesContainerRef}
                  className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 min-h-[200px] max-h-[400px] overflow-y-auto"
                >
                  {parseNotes(saleForm.notes).length === 0 ? (
                    <div className="text-gray-500 italic">No notes yet. Click 'Add Note' to add your first note.</div>
                  ) : (
                    <div className="space-y-3">
                      {parseNotes(saleForm.notes).map((note, index) => {
                        const isLastNote = index === 0; // First note is newest (descending order)
                        const canEdit = note.userId === user?.id && isLastNote; // Only show edit button for current user's latest note
                        return (
                        <div 
                          key={note.id} 
                          ref={isLastNote ? lastNoteRef : null}
                          className="border-l-4 border-blue-500 pl-3 py-2 bg-white rounded-r-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs text-gray-500 font-medium">
                                  {note.timestamp}
                                </div>
                                <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                                  {note.userName || 'Unknown User'}
                                </div>
                              </div>
                              <div className="text-gray-900 mb-1">
                                {note.note}
                              </div>
                              {note.appointment && (
                                <div className="text-xs text-green-600 font-medium">
                                  📅 Appointment: {note.appointment}
                                </div>
                              )}
                              
                              {/* Comments Section */}
                              {note.comments && note.comments.length > 0 && (
                                <div className="mt-2 ml-4 border-l-2 border-gray-200 pl-3">
                                  <div className="text-xs text-gray-500 mb-1">💬 Comments:</div>
                                  {note.comments.map((comment, commentIndex) => (
                                    <div key={comment.id} className="mb-3 p-3 bg-gray-50 rounded-lg text-xs border border-gray-200">
                                      <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-500 font-medium">{comment.timestamp}</span>
                                        <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded-full">{comment.userName}</span>
                                      </div>
                                      <div className="text-gray-700 leading-relaxed">{comment.comment}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Action Buttons */}
                              <div className="flex gap-2 mt-3">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openNoteEditModal(note);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs px-3 py-1.5 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors duration-200 font-medium"
                                  >
                                    ✏️ Edit
                                  </button>
                                )}
                                {isLastNote && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openCommentModal(note);
                                    }}
                                    className="text-green-600 hover:text-green-800 text-xs px-3 py-1.5 border border-green-300 rounded-md hover:bg-green-50 transition-colors duration-200 font-medium"
                                  >
                                    💬 Comment
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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

      {/* Note Modal */}
      {isNoteModalOpen && (
        <NoteModal
          title="Add Note"
          onClose={() => setIsNoteModalOpen(false)}
          onNoteAdd={handleNoteAdd}
          initialDate=""
          initialTime=""
          initialNote=""
          customerState={customer.state}
          showState={true}
        />
      )}

      {/* Note Edit Modal */}
      {isNoteEditModalOpen && editingNote && (
        <NoteModal
          title="Edit Note"
          onClose={() => {
            setIsNoteEditModalOpen(false);
            setEditingNote(null);
          }}
          onNoteAdd={handleNoteEditSave}
          initialDate={editingNote.appointment ? editingNote.appointment.split(' ')[0] : ''}
          initialTime={editingNote.appointment ? editingNote.appointment.split(' ')[1] : ''}
          initialNote={editingNote.note}
          customerState={customer.state}
          showState={true}
        />
      )}

      {/* Receiver Modal - Removed, using textarea template instead */}




      {/* Customer Existence Dialog */}
      {showCustomerDialog && customerWarning && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
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
                      <strong>✓ Exact match found:</strong> {customerWarning.exactMatchCustomer?.firstName}
                    </p>
                    <p className="text-sm text-green-600 mb-3 font-medium">
                      This customer has the same name and landline. You can select them (highlighted in green) or choose a different customer below.
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
                  </>
                )}
                
                {/* Customer list - shown for both exact and landline matches */}
                <div className="max-h-64 overflow-y-auto mb-3">
                  {customerWarning.landlineCustomers
                    .sort((a, b) => {
                      // Sort exact matches to the top
                      if (a.isExactMatch && !b.isExactMatch) return -1;
                      if (!a.isExactMatch && b.isExactMatch) return 1;
                      return 0; // Keep original order for non-exact matches
                    })
                    .map((customer, index) => (
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
                            : customer.isExactMatch
                              ? 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100 hover:border-green-400'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {customer.firstName} {customer.lastName || ''}
                              {customer.isExactMatch && (
                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  ✓ Exact Match
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              ID: {customer.id} • Created: {new Date(customer.created_at).toLocaleDateString()}
                            </div>
                            {customer.lastSale && (
                              <div className="text-xs text-gray-600 mt-1 space-y-1">
                                <div><strong>Last Sale:</strong> ID {customer.lastSale.id} • {new Date(customer.lastSale.created_at).toLocaleDateString()} <span className="text-blue-600 font-medium">({getTimeAgo(customer.lastSale.created_at)})</span></div>
                                <div><strong>Status:</strong> 
                                  <span className={`ml-1 px-1 py-0.5 text-xs rounded ${getStatusBadgeClasses(customer.lastSale.status || '')}`}>
                                    {getStatusDisplayName(customer.lastSale.status) || customer.lastSale.status}
                                  </span>
                                </div>
                                {customer.lastSale.agent && user && 
                                 (user.id === customer.lastSale.agent.id || 
                                  (user.firstName === customer.lastSale.agent.firstName && user.lastName === customer.lastSale.agent.lastName)) && (
                                  <div><strong>Agent:</strong> {customer.lastSale.agent.firstName} {customer.lastSale.agent.lastName}</div>
                                )}
                              </div>
                            )}
                            {!customer.lastSale && (
                              <div className="text-xs text-gray-500 mt-1">
                                No previous sales
                              </div>
                            )}
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
                
                {/* Only show "Create New Customer" button if there's no exact match */}
                {!customerWarning.hasExactMatch && (
                  <div className="border-t pt-3">
                    <button
                      onClick={() => {
                        // Update the warning state to indicate "Create New Customer" is selected
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
                )}
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    // Reset the customer form to its original state before dialog was opened
                    if (customerWarning?.newCustomerName) {
                      setCustomer(prev => ({
                        ...prev,
                        firstName: customerWarning.newCustomerName,
                        lastName: '',
                        email: '',
                        phone: prev.phone || '',
                        landline: prev.landline,
                        address: '',
                        state: prev.state || '',
                        city: prev.city || '',
                        id: undefined
                      }));
                    }
                    
                    setShowCustomerDialog(false);
                    setCustomerWarning(null);
                    setSaving(false);
                    setIsCheckNumberMode(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => isCheckNumberMode ? handleCheckNumberCustomerDialogClose() : handleCustomerDialogClose(saleStatus)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {isCheckNumberMode ? (
                    customerWarning.selectedCustomerId 
                      ? `Use ${customerWarning.selectedCustomerName} & Show Info`
                      : customerWarning.selectedCustomerId === null
                        ? `Create New Customer: ${customerWarning.newCustomerName}`
                        : customerWarning.hasExactMatch
                          ? `Use ${customerWarning.exactMatchCustomer?.firstName} (Exact Match) & Show Info`
                          : `Use ${customerWarning.landlineCustomers[0]?.firstName || 'Customer'} & Show Info`
                  ) : (
                    customerWarning.selectedCustomerId 
                      ? `Add Sale to ${customerWarning.selectedCustomerName}`
                      : 'Create New Customer'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {isCommentModalOpen && commentingNote && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Add Comment
                </h3>
                <button
                  onClick={() => {
                    setIsCommentModalOpen(false);
                    setCommentingNote(null);
                    setCommentText('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">
                  <strong>Original Note:</strong>
                </div>
                <div className="text-sm text-gray-800">
                  {commentingNote.note}
                </div>
                {commentingNote.appointment && (
                  <div className="text-xs text-green-600 mt-1">
                    📅 Appointment: {commentingNote.appointment}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Comment
                </label>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add your comment here..."
                  rows="3"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsCommentModalOpen(false);
                    setCommentingNote(null);
                    setCommentText('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommentSubmit}
                  disabled={!commentText.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Information Popup Modal */}
      {showCustomerInfoModal && checkedCustomer && checkedCustomer.id && checkedCustomer.customerId && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() => setShowCustomerInfoModal(false)}
        >
          <div 
            className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">📋 Customer History & Call Information</h3>
                <button
                  onClick={() => setShowCustomerInfoModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-6">
                <p className="text-sm text-gray-600">
                  Review customer information and previous sale history before making the call.
                </p>
                
                {/* Information Grid */}
                <div className="grid grid-cols-1 gap-6">
                  
                  {/* Customer Information */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="text-lg font-semibold text-green-800 mb-3">👤 Customer Information</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium">Name:</span> {customer.firstName} {customer.lastName}</p>
                      <p><span className="font-medium">Phone:</span> {customer.phone || 'N/A'}</p>
                      <p><span className="font-medium">Landline:</span> {customer.landline || 'N/A'}</p>
                      <p><span className="font-medium">Email:</span> {customer.email || 'N/A'}</p>
                      <p><span className="font-medium">Address:</span> {customer.address || 'N/A'}</p>
                      <p><span className="font-medium">Customer ID:</span> {checkedCustomer.customerId}</p>
                    </div>
                  </div>
                </div>
                
                {/* Ready for Call Reference */}
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <h4 className="text-lg font-semibold text-yellow-800 mb-3">📞 Ready for Call</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Customer ID:</span> {checkedCustomer.id}</p>
                    <p><span className="font-medium">Status:</span> Customer checked - ready to call</p>
                    <p><span className="font-medium">Agent:</span> {user?.firstName} {user?.lastName}</p>
                    <p><span className="font-medium">Next Step:</span> Make call, then create sale based on result</p>
                  </div>
                </div>
                
                {/* Call Button */}
                {user?.twilio_enabled !== false && (
                  <div className="flex justify-center pt-4">
                    <CallButton
                      ref={(el) => {
                        if (el && !callButtonRefs.current.find(ref => ref?.current === el)) {
                          callButtonRefs.current.push({ current: el });
                        }
                      }}
                      customerId={checkedCustomer.customerId}
                      saleId={null} // No sale created yet
                      phoneNumber={customer.phone || customer.landline}
                      customerName={customer.firstName}
                      callPurpose="follow_up"
                      onCallInitiated={handleCallInitiated}
                      onCallCompleted={handleCallCompleted}
                      size="large"
                    />
                  </div>
                )}

                {/* Last Sale Information */}
                {lastSaleInfo && (
                  <div className="mt-6 bg-gray-50 rounded-lg p-4 border">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">📊 Last Sale Information</h4>
                    {lastSaleInfo.lastSale ? (
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium">Sale ID:</span> {lastSaleInfo.lastSale.id}</p>
                        <p><span className="font-medium">Status:</span> <span className="capitalize">{lastSaleInfo.lastSale.status}</span></p>
                        <p><span className="font-medium">Date & Time:</span> {new Date(lastSaleInfo.lastSale.created_at).toLocaleString()}</p>
                        <p><span className="font-medium">Agent:</span> {lastSaleInfo.lastSale.agent ? `${lastSaleInfo.lastSale.agent.firstName} ${lastSaleInfo.lastSale.agent.lastName}` : 'Unknown'}</p>
                        {lastSaleInfo.lastSale.notes && (
                          <p><span className="font-medium">Notes:</span> {lastSaleInfo.lastSale.notes}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-sm">No previous sales found for this customer.</p>
                    )}
                    
                    {/* View All Sales Button */}
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowCallHistory(true)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        📋 View All Sales
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Close Button */}
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setShowCustomerInfoModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
                  >
                    Close Without Calling
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

