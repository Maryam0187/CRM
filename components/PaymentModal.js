'use client';

import { useState } from 'react';
import AddCardForm from './AddCardForm';
import AddBankForm from './AddBankForm';

const MODE_ENUM = {
  create: 'create',
  update: 'update'
};

export default function PaymentModal({ isVisible, mode = MODE_ENUM.create, saleId, onClose, onSuccess }) {
  const [selectedType, setSelectedType] = useState('card');

  if (!isVisible) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSuccess = (type, data) => {
    onSuccess(type, data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-screen-xl bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === MODE_ENUM.create 
              ? `ADD ${selectedType.toUpperCase()}` 
              : `UPDATE ${selectedType.toUpperCase()}`
            }
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setSelectedType('card')}
            className={`flex-1 px-6 py-4 text-lg font-medium transition-colors ${
              selectedType === 'card'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-blue-600 hover:bg-blue-50'
            }`}
          >
            Add Card Detail
          </button>
          <button
            onClick={() => setSelectedType('bank')}
            className={`flex-1 px-6 py-4 text-lg font-medium transition-colors ${
              selectedType === 'bank'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-blue-600 hover:bg-blue-50'
            }`}
          >
            Add Bank Detail
          </button>
        </div>

        {/* Form Content */}
        <div className="p-10">
          {selectedType === 'card' && (
            <AddCardForm mode={mode} saleId={saleId} onSuccess={(data) => handleSuccess('card', data)} />
          )}
          {selectedType === 'bank' && (
            <AddBankForm mode={mode} saleId={saleId} onSuccess={(data) => handleSuccess('bank', data)} />
          )}
        </div>
      </div>
    </div>
  );
}
