'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DateModal from './DateModal';
import ReceiverModal from './ReceiverModal';

export default function AddSale() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check if we're in edit mode
  const editId = searchParams.get('id');
  const isEditMode = !!editId;
  
  // Customer form state
  const [customer, setCustomer] = useState({
    firstName: '',
    landlineNo: '',
    cellNo: '',
    address: ''
  });

  // Sale form state
  const [saleForm, setSaleForm] = useState({
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

  // System info for receiver modal
  const [systemInfo, setSystemInfo] = useState({
    receiverId: '',
    smartCardId: '',
    secureId: '',
    locationId: '',
    room: ''
  });

  // Options for dropdowns
  const packageStatusOptions = [
    { text: 'Same', value: 'same' },
    { text: 'Upgrade', value: 'upgrade' },
    { text: 'Downgrade', value: 'downgrade' }
  ];

  const carrierOptions = [
    'Dish', 'DirecTV', 'Comcast', 'Spectrum', 'AT&T U-verse', 
    'Metrocast', 'EGO Cable', 'Cable'
  ];

  const serviceOptions = [
    'Tech Visit', 'Receiver Shipment', 'Remotely Upgrade', 'Remote Shipment'
  ];

  const receiverOptions = ['311', '322', '211k', '211z', '222'];

  const timeOptions = ['8am - 12pm', '12pm - 4pm', '12pm - 5pm'];

  const companyOptions = ['Frontier', 'CenturyLink', 'Windstream'];

  // Fetch sale data for edit mode
  const fetchSaleData = async () => {
    if (!isEditMode) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/${editId}`);
      const result = await response.json();
      
      if (result.success) {
        const sale = result.data;
        
        // Populate customer data
        if (sale.customer) {
          setCustomer({
            firstName: sale.customer.firstName || '',
            landlineNo: sale.landlineNo || sale.customer.phone || '',
            cellNo: sale.cellNo || '',
            address: sale.address || ''
          });
        }
        
        // Populate sale form data
        setSaleForm({
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

  // Load data on component mount if in edit mode
  useEffect(() => {
    fetchSaleData();
  }, [editId]);

  // Handle customer form changes
  const handleCustomerChange = (field, value) => {
    setCustomer(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle sale form changes
  const handleSaleFormChange = (field, value) => {
    setSaleForm(prev => ({
      ...prev,
      [field]: value
    }));
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

  // Add or update sale with status
  const addSale = async (status) => {
    setSaving(true);
    setError(null);
    setSaleStatus(status);
    
    try {
      let customerId;
      
      if (isEditMode) {
        // For edit mode, get customer ID from existing sale
        const saleResponse = await fetch(`/api/sales/${editId}`);
        const saleResult = await saleResponse.json();
        if (saleResult.success) {
          customerId = saleResult.data.customerId;
          
          // Update customer information if it has changed
          if (customer.firstName && customer.firstName.trim() !== '') {
            const customerUpdateData = {
              firstName: customer.firstName.trim(),
              lastName: null, // Use null instead of empty string
              email: null, // Use null instead of empty string
              phone: customer.landlineNo || customer.cellNo, // Use landline or cell as phone
              landline: customer.landlineNo,
              address: customer.address,
              status: 'prospect'
            };
            
            const customerUpdateResponse = await fetch(`/api/customers/${customerId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(customerUpdateData)
            });
            
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
        
        // For new sale, create customer first
        const customerData = {
          firstName: customer.firstName.trim(),
          lastName: null, // Use null instead of empty string
          email: null, // Use null instead of empty string
          phone: customer.landlineNo || customer.cellNo, // Use landline or cell as phone
          landline: customer.landlineNo,
          address: customer.address,
          status: 'prospect'
        };
        
        const customerResponse = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(customerData)
        });
        
        const customerResult = await customerResponse.json();
        if (!customerResult.success) {
          throw new Error(customerResult.message || 'Failed to create customer');
        }
        customerId = customerResult.data.id;
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
        agentId: 2, // You might want to get this from auth context
        status: status,
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
        techVisitTime: sanitizeValue(saleForm.techVisitTime)
      };
      
      // Save or update sale
      if (isEditMode) {
        const response = await fetch(`/api/sales/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saleData)
        });
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to update sale');
        }
      } else {
        const response = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saleData)
        });
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to create sale');
        }
      }
      
      // Navigate back to home
      router.push('/');
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

      {/* Action Buttons */}
      <div className="sticky top-16 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => addSale('active')}
              disabled={saving || loading}
              className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Active'}
            </button>
            <button
              onClick={() => addSale('pending')}
              disabled={saving || loading}
              className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Pending'}
            </button>
            <button
              onClick={() => addSale('completed')}
              disabled={saving || loading}
              className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Completed'}
            </button>
            <button
              onClick={() => addSale('cancelled')}
              disabled={saving || loading}
              className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Cancelled'}
            </button>
            <button
              onClick={() => openDateModal('Appointment')}
              disabled={saving || loading}
              className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Appointment
            </button>
          </div>
        </div>
      </div>

      {/* Customer Information Form */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Customer Information</h2>
            
            <form className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block mb-2 text-sm font-medium text-gray-900">
                    Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={customer.firstName}
                    onChange={(e) => handleCustomerChange('firstName', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Name"
                  />
                </div>
                <div>
                  <label htmlFor="spokeTo" className="block mb-2 text-sm font-medium text-gray-900">
                    I spoke to
                  </label>
                  <input
                    type="text"
                    id="spokeTo"
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="Enter Attendee Name"
                  />
                </div>
                <div>
                  <label htmlFor="landline" className="block mb-2 text-sm font-medium text-gray-900">
                    LandLine Number
                  </label>
                  <input
                    type="tel"
                    id="landline"
                    value={customer.landlineNo}
                    onChange={(e) => handleCustomerChange('landlineNo', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="(555) 555-1234"
                  />
                </div>
                <div>
                  <label htmlFor="cell" className="block mb-2 text-sm font-medium text-gray-900">
                    Cell Number
                  </label>
                  <input
                    type="tel"
                    id="cell"
                    value={customer.cellNo}
                    onChange={(e) => handleCustomerChange('cellNo', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder="212-456-7890"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="address" className="block mb-2 text-sm font-medium text-gray-900">
                  Address
                </label>
                <input
                  type="text"
                  id="address"
                  value={customer.address}
                  onChange={(e) => handleCustomerChange('address', e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  placeholder="Street Address, City, State Zipcode"
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
                    placeholder="Enter SSN Number"
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
                  >
                    <option value="">Select Carrier</option>
                    {carrierOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
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
                  <div className="space-y-2">
                    {receiverOptions.map((receiver) => (
                      <label key={receiver} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedReceiver.includes(receiver)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleReceiverChange([...selectedReceiver, receiver]);
                            } else {
                              handleReceiverChange(selectedReceiver.filter(r => r !== receiver));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-900">{receiver}</span>
                      </label>
                    ))}
                  </div>
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
                      placeholder="Enter Regular Bill"
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
                      placeholder="Enter Promotional Bill"
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
                      placeholder="Enter Last Payment"
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
                      placeholder="Balance"
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
          title="Select Date"
          onClose={() => setIsDateModalOpen(false)}
          onDateSelect={handleDateSelect}
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
    </div>
  );
}
