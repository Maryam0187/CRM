'use client';

import { useState, useEffect } from 'react';
import { formatNumericOnly, formatRoutingNumber } from '../lib/validation.js';
import apiClient from '../lib/apiClient.js';

export default function AddChequeElectronicForm({ mode, saleId, customerId, onSuccess, initialData, onDataChange }) {
  const [formData, setFormData] = useState(initialData || {
    routingNumber: '',
    accountNumber: '',
    chequeNumber: '',
    nameOnCheque: '',
    bankName: '',
    state: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    let formattedValue = value;
    if (name === 'accountNumber' || name === 'chequeNumber') {
      formattedValue = formatNumericOnly(value);
    } else if (name === 'routingNumber') {
      formattedValue = formatRoutingNumber(value);
    }
    
    const newFormData = {
      ...formData,
      [name]: formattedValue
    };
    
    setFormData(newFormData);
    
    if (onDataChange) {
      onDataChange(newFormData);
    }

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
      if (!saleId) {
        throw new Error('Sale ID is required');
      }

      // Basic validation
      if (!formData.routingNumber || !formData.accountNumber || !formData.chequeNumber || 
          !formData.nameOnCheque || !formData.bankName || !formData.state) {
        setValidationErrors({ general: 'All fields are required' });
        setIsSubmitting(false);
        return;
      }

      setValidationErrors({});

      const chequeData = {
        saleId: parseInt(saleId),
        ...(customerId != null && { customerId: parseInt(customerId) }),
        routingNumber: formData.routingNumber,
        accountNumber: formData.accountNumber,
        chequeNumber: formData.chequeNumber,
        nameOnCheque: formData.nameOnCheque,
        bankName: formData.bankName,
        state: formData.state,
        notes: formData.notes
      };

      const response = await apiClient.post('/api/cheques-electronic', chequeData);
      const result = await response.json();

      if (!result.success) {
        if (result.errors) {
          setValidationErrors(result.errors);
          throw new Error('Please fix the validation errors below');
        }
        throw new Error(result.message || 'Failed to save cheque details');
      }

      onSuccess({
        type: 'cheque_electronic',
        data: result.data,
        status: 'cheque_electronic_added',
        message: 'Electronic cheque details added successfully'
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
        <div className="w-full">
          <label htmlFor="routingNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Routing Number
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

        <div className="w-full">
          <label htmlFor="accountNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Account Number
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
            placeholder="Account Number"
            required
          />
          {validationErrors.accountNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.accountNumber}</p>
          )}
        </div>

        <div className="w-full">
          <label htmlFor="chequeNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Cheque Number
          </label>
          <input
            type="text"
            id="chequeNumber"
            name="chequeNumber"
            value={formData.chequeNumber}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.chequeNumber ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Cheque Number"
            required
          />
          {validationErrors.chequeNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.chequeNumber}</p>
          )}
        </div>

        <div className="w-full">
          <label htmlFor="nameOnCheque" className="block mb-2 text-sm font-medium text-gray-900">
            Name on Cheque
          </label>
          <input
            type="text"
            id="nameOnCheque"
            name="nameOnCheque"
            value={formData.nameOnCheque}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.nameOnCheque ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Name on Cheque"
            required
          />
          {validationErrors.nameOnCheque && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.nameOnCheque}</p>
          )}
        </div>

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

        <div className="w-full">
          <label htmlFor="state" className="block mb-2 text-sm font-medium text-gray-900">
            State
          </label>
          <input
            type="text"
            id="state"
            name="state"
            value={formData.state}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.state ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="State"
            required
          />
          {validationErrors.state && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.state}</p>
          )}
        </div>

        <div className="sm:col-span-2">
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

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
      >
        {isSubmitting ? 'Adding...' : 'Add Electronic Cheque'}
      </button>
    </form>
  );
}


