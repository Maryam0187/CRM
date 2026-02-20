'use client';

import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient.js';

export default function AddPaymentEmailForm({ mode, saleId, customerId, onSuccess, initialData, onDataChange }) {
  const [formData, setFormData] = useState(initialData || {
    emailAddress: '',
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
    
    const newFormData = {
      ...formData,
      [name]: value
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

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!saleId) {
        throw new Error('Sale ID is required');
      }

      if (!formData.emailAddress) {
        setValidationErrors({ emailAddress: 'Email address is required' });
        setIsSubmitting(false);
        return;
      }

      if (!validateEmail(formData.emailAddress)) {
        setValidationErrors({ emailAddress: 'Please enter a valid email address' });
        setIsSubmitting(false);
        return;
      }

      setValidationErrors({});

      const emailData = {
        saleId: parseInt(saleId),
        ...(customerId != null && { customerId: parseInt(customerId) }),
        emailAddress: formData.emailAddress,
        notes: formData.notes
      };

      const response = await apiClient.post('/api/payment-emails', emailData);
      const result = await response.json();

      if (!result.success) {
        if (result.errors) {
          setValidationErrors(result.errors);
          throw new Error('Please fix the validation errors below');
        }
        throw new Error(result.message || 'Failed to save email details');
      }

      onSuccess({
        type: 'payment_email',
        data: result.data,
        status: 'payment_email_added',
        message: 'Payment email added successfully'
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
        <div className="w-full sm:col-span-2">
          <label htmlFor="emailAddress" className="block mb-2 text-sm font-medium text-gray-900">
            Email Address
          </label>
          <input
            type="email"
            id="emailAddress"
            name="emailAddress"
            value={formData.emailAddress}
            onChange={handleInputChange}
            className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5 ${
              validationErrors.emailAddress ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="customer@example.com"
            required
          />
          {validationErrors.emailAddress && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.emailAddress}</p>
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
        {isSubmitting ? 'Adding...' : 'Add Payment Email'}
      </button>
    </form>
  );
}


