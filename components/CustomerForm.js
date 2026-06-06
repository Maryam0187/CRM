'use client';

import { useState } from 'react';
import StateSelector from './StateSelector';
import { formatLandline, formatCellNumber } from '../lib/validation';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  landline: '',
  phone: '',
  email: '',
  address: '',
  state: '',
  city: '',
  zipcode: '',
  country: 'USA',
  mailingAddress: '',
  customerFeedback: ''
};

function validateName(name) {
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
    return { isValid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }
  return { isValid: true, message: '' };
}

function validateLandlineField(landline) {
  if (!landline || landline.trim() === '') {
    return { isValid: false, message: 'Landline number is required' };
  }
  const clean = landline.replace(/[^\d]/g, '');
  if (clean.length < 10) {
    return { isValid: false, message: 'Landline number must be at least 10 digits' };
  }
  if (clean.length > 15) {
    return { isValid: false, message: 'Landline number must be less than 15 digits' };
  }
  return { isValid: true, message: '' };
}

function customerToForm(customer) {
  if (!customer) return { ...INITIAL_FORM };
  return {
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    landline: customer.landline || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    state: customer.state || '',
    city: customer.city || '',
    zipcode: customer.zipcode || '',
    country: customer.country || 'USA',
    mailingAddress: customer.mailingAddress || '',
    customerFeedback: customer.customerFeedback || ''
  };
}

export default function CustomerForm({
  initialCustomer = null,
  onSubmit,
  onCancel,
  submitLabel = 'Save Customer',
  saving = false,
  lockLandline = false
}) {
  const [form, setForm] = useState(() => customerToForm(initialCustomer));
  const [validation, setValidation] = useState({
    firstName: { isValid: true, message: '' },
    landline: { isValid: true, message: '' }
  });

  const handleChange = (field, value) => {
    let formatted = value;
    if (field === 'landline') formatted = formatLandline(value);
    else if (field === 'phone') formatted = formatCellNumber(value);
    else if (field === 'zipcode') formatted = value.replace(/\D/g, '').slice(0, 10);

    setForm((prev) => ({ ...prev, [field]: formatted }));

    if (field === 'firstName') {
      setValidation((prev) => ({ ...prev, firstName: validateName(formatted) }));
    } else if (field === 'landline') {
      setValidation((prev) => ({ ...prev, landline: validateLandlineField(formatted) }));
    }
  };

  const handleStateChange = (e) => {
    setForm((prev) => ({ ...prev, state: e.target.value, city: '', zipcode: '' }));
  };

  const validateAll = () => {
    const firstName = validateName(form.firstName);
    const landline = validateLandlineField(form.landline);
    setValidation({ firstName, landline });
    return firstName.isValid && landline.isValid;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateAll()) return;
    onSubmit({
      firstName: form.firstName.trim(),
      lastName: form.lastName?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      landline: form.landline?.trim() || null,
      address: form.address?.trim() || null,
      state: form.state || null,
      city: form.city?.trim() || null,
      zipcode: form.zipcode?.trim() || null,
      country: form.country || 'USA',
      mailingAddress: form.mailingAddress?.trim() || null,
      customerFeedback: form.customerFeedback?.trim() || null
    });
  };

  const inputClass =
    'w-full px-4 py-2.5 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const errorClass = 'border-red-500 bg-red-50/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            placeholder="First name"
            className={`${inputClass} ${!validation.firstName.isValid ? errorClass : ''}`}
          />
          {!validation.firstName.isValid && (
            <p className="mt-1 text-xs text-red-600">{validation.firstName.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            placeholder="Last name"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Landline <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={form.landline}
            onChange={(e) => handleChange('landline', e.target.value)}
            placeholder="Landline number"
            readOnly={lockLandline}
            disabled={lockLandline}
            className={`${inputClass} ${!validation.landline.isValid ? errorClass : ''} ${lockLandline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />
          {!validation.landline.isValid && (
            <p className="mt-1 text-xs text-red-600">{validation.landline.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cell Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="Cell phone"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="Email address"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="Street address"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
        <StateSelector
          value={form.state}
          onChange={handleStateChange}
          label=""
          showTimezone={false}
          className="w-full max-w-xs"
        />
      </div>

      {form.state && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => handleChange('city', e.target.value)}
              placeholder="City"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zipcode</label>
            <input
              type="text"
              value={form.zipcode}
              onChange={(e) => handleChange('zipcode', e.target.value)}
              placeholder="Zipcode"
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mailing Address</label>
        <input
          type="text"
          value={form.mailingAddress}
          onChange={(e) => handleChange('mailingAddress', e.target.value)}
          placeholder="Mailing address (if different)"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Customer Feedback</label>
        <textarea
          value={form.customerFeedback}
          onChange={(e) => handleChange('customerFeedback', e.target.value)}
          placeholder="Notes about this customer"
          rows={3}
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
