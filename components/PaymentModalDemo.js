'use client';

import { useState } from 'react';
import PaymentModal from './PaymentModal';

export default function PaymentModalDemo() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [successMessage, setSuccessMessage] = useState('');

  const handleOpenModal = (mode) => {
    setModalMode(mode);
    setIsModalVisible(true);
    setSuccessMessage('');
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
  };

  const handleSuccess = (type, data) => {
    setSuccessMessage(`${type} details added successfully! Status: ${data.status}`);
    console.log('Payment data:', data);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Payment Modal Demo</h1>
      
      <div className="space-x-4 mb-6">
        <button
          onClick={() => handleOpenModal('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Add Payment Method
        </button>
        <button
          onClick={() => handleOpenModal('update')}
          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Update Payment Method
        </button>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {successMessage}
        </div>
      )}

      <PaymentModal
        isVisible={isModalVisible}
        mode={modalMode}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
