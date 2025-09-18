'use client';

import { useState } from 'react';
import { 
  validateBankForm, 
  formatNumericOnly, 
  formatRoutingNumber 
} from '../lib/validation.js';
import apiClient from '../lib/apiClient.js';

export default function AddBankForm({ mode, saleId, onSuccess }) {
  const [formData, setFormData] = useState({
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Format input based on field type
    let formattedValue = value;
    if (name === 'accountNumber' || name === 'checkNumber') {
      formattedValue = formatNumericOnly(value);
    } else if (name === 'routingNumber') {
      formattedValue = formatRoutingNumber(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));

    // Clear validation error for this field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate all fields using shared validation
      const errors = validateBankForm(formData);

      if (!saleId) {
        throw new Error('Sale ID is required');
      }

      // If there are validation errors, show them and stop submission
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        setIsSubmitting(false);
        return;
      }

      // Clear any previous validation errors
      setValidationErrors({});

      // Prepare data for API
      const bankData = {
        saleId: parseInt(saleId),
        bankName: formData.bankName,
        accountHolder: formData.accountHolder,
        accountNumber: formData.accountNumber,
        routingNumber: formData.routingNumber,
        checkNumber: formData.checkNumber,
        driverLicense: formData.driverLicense,
        nameOnLicense: formData.nameOnLicense,
        stateId: formData.stateId,
        notes: formData.notes
      };

      // Save to API
      const response = await apiClient.post('/api/banks', bankData);

      const result = await response.json();

      if (!result.success) {
        // Handle validation errors from backend
        if (result.errors) {
          setValidationErrors(result.errors);
          throw new Error('Please fix the validation errors below');
        }
        throw new Error(result.message || 'Failed to save bank details');
      }

      // Call success callback with bank data
      onSuccess({
        type: 'bank',
        data: result.data,
        status: 'bank_added',
        message: 'Bank details added successfully'
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        {/* Bank Name */}
        <div className="w-full">
          <label htmlFor="bankName" className="block mb-2 text-sm font-medium text-gray-900">
            Bank Name
          </label>
          <input
            type="text"
            id="bankName"
            name="bankName"
            value={formData.bankName}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.bankName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Bank Name"
            required
          />
          {validationErrors.bankName && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.bankName}</p>
          )}
        </div>

        {/* Account Holder */}
        <div className="w-full">
          <label htmlFor="accountHolder" className="block mb-2 text-sm font-medium text-gray-900">
            Account Holder
          </label>
          <input
            type="text"
            id="accountHolder"
            name="accountHolder"
            value={formData.accountHolder}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.accountHolder ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Account Holder"
            required
          />
          {validationErrors.accountHolder && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.accountHolder}</p>
          )}
        </div>

        {/* Account Number */}
        <div className="w-full">
          <label htmlFor="accountNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Account #
          </label>
          <input
            type="text"
            id="accountNumber"
            name="accountNumber"
            value={formData.accountNumber}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.accountNumber ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Account Number (8-17 digits)"
            required
          />
          {validationErrors.accountNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.accountNumber}</p>
          )}
        </div>

        {/* Routing Number */}
        <div className="w-full">
          <label htmlFor="routingNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Routing #
          </label>
          <input
            type="text"
            id="routingNumber"
            name="routingNumber"
            value={formData.routingNumber}
            onChange={handleInputChange}
            maxLength="9"
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.routingNumber ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Routing Number (9 digits)"
            required
          />
          {validationErrors.routingNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.routingNumber}</p>
          )}
        </div>

        {/* Check Number */}
        <div className="w-full">
          <label htmlFor="checkNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Check #
          </label>
          <input
            type="text"
            id="checkNumber"
            name="checkNumber"
            value={formData.checkNumber}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.checkNumber ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Check Number (3-10 digits)"
            required
          />
          {validationErrors.checkNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.checkNumber}</p>
          )}
        </div>

        {/* Driver License */}
        <div className="w-full">
          <label htmlFor="driverLicense" className="block mb-2 text-sm font-medium text-gray-900">
            Driver License
          </label>
          <input
            type="text"
            id="driverLicense"
            name="driverLicense"
            value={formData.driverLicense}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.driverLicense ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Driver License (5-20 characters)"
            required
          />
          {validationErrors.driverLicense && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.driverLicense}</p>
          )}
        </div>

        {/* Name on License */}
        <div className="w-full">
          <label htmlFor="nameOnLicense" className="block mb-2 text-sm font-medium text-gray-900">
            Name on License
          </label>
          <input
            type="text"
            id="nameOnLicense"
            name="nameOnLicense"
            value={formData.nameOnLicense}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.nameOnLicense ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Name on License"
            required
          />
          {validationErrors.nameOnLicense && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.nameOnLicense}</p>
          )}
        </div>

        {/* State ID */}
        <div className="w-full">
          <label htmlFor="stateId" className="block mb-2 text-sm font-medium text-gray-900">
            State ID
          </label>
          <input
            type="text"
            id="stateId"
            name="stateId"
            value={formData.stateId}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.stateId ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="State ID"
            required
          />
          {validationErrors.stateId && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.stateId}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block mb-2 text-sm font-medium text-gray-900">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows="4"
            value={formData.notes}
            onChange={handleInputChange}
            className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Your description here"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
      >
        {isSubmitting ? 'Adding...' : 'Add Bank Detail'}
      </button>
    </form>
  );
}
