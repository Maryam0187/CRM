'use client';

import { useState } from 'react';

export default function AddCardForm({ mode, saleId, onSuccess }) {
  const [formData, setFormData] = useState({
    cardType: '',
    provider: '',
    customerName: '',
    cardNumber: '',
    cvv: '',
    expiryDate: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.cardType || !formData.provider || !formData.customerName || 
          !formData.cardNumber || !formData.cvv || !formData.expiryDate) {
        throw new Error('Please fill in all required fields');
      }

      if (!saleId) {
        throw new Error('Sale ID is required');
      }

      // Prepare data for API
      const cardData = {
        saleId: parseInt(saleId),
        cardType: formData.cardType,
        provider: formData.provider,
        customerName: formData.customerName,
        cardNumber: formData.cardNumber,
        cvv: formData.cvv,
        expiryDate: formData.expiryDate,
        notes: formData.notes
      };

      // Save to API
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardData)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to save card details');
      }

      // Call success callback with card data
      onSuccess({
        type: 'card',
        data: result.data,
        status: 'card_added',
        message: 'Card details added successfully'
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
        {/* Card Type */}
        <div>
          <label htmlFor="cardType" className="block mb-2 text-sm font-medium text-gray-900">
            Card Type
          </label>
          <select
            id="cardType"
            name="cardType"
            value={formData.cardType}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            required
          >
            <option value="">Select card Type</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
            <option value="prepaid">Prepaid</option>
            <option value="gift-card">Gift Card</option>
          </select>
        </div>

        {/* Provider */}
        <div>
          <label htmlFor="provider" className="block mb-2 text-sm font-medium text-gray-900">
            Provider
          </label>
          <select
            id="provider"
            name="provider"
            value={formData.provider}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            required
          >
            <option value="">Select Provider</option>
            <option value="visa">Visa</option>
            <option value="mastercard">Mastercard</option>
            <option value="discover">Discover</option>
            <option value="amex">American Express</option>
          </select>
        </div>

        {/* Customer Name */}
        <div className="sm:col-span-2">
          <label htmlFor="customerName" className="block mb-2 text-sm font-medium text-gray-900">
            Customer Name
          </label>
          <input
            type="text"
            id="customerName"
            name="customerName"
            value={formData.customerName}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5"
            placeholder="Type customer name"
            required
          />
        </div>

        {/* Card Number */}
        <div className="w-full">
          <label htmlFor="cardNumber" className="block mb-2 text-sm font-medium text-gray-900">
            Card Number
          </label>
          <input
            type="text"
            id="cardNumber"
            name="cardNumber"
            value={formData.cardNumber}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5"
            placeholder="Card Number"
            required
          />
        </div>

        {/* CVV */}
        <div className="w-full">
          <label htmlFor="cvv" className="block mb-2 text-sm font-medium text-gray-900">
            CVV
          </label>
          <input
            type="number"
            id="cvv"
            name="cvv"
            value={formData.cvv}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5"
            placeholder="XXX"
            required
          />
        </div>

        {/* Expiry Date */}
        <div>
          <label htmlFor="expiryDate" className="block mb-2 text-sm font-medium text-gray-900">
            Card Expiry Date
          </label>
          <input
            type="text"
            id="expiryDate"
            name="expiryDate"
            value={formData.expiryDate}
            onChange={handleInputChange}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-600 focus:border-blue-600 block w-full p-2.5"
            placeholder="MM/YY"
            required
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block mb-2 text-sm font-medium text-gray-900">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows="6"
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
        {isSubmitting ? 'Adding...' : 'Add Card Detail'}
      </button>
    </form>
  );
}
