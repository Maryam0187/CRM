'use client';

export default function ReceiverModal({ title, modalId, systemInfo, setSystemInfo, onClose, onSave }) {
  const handleInputChange = (field, value) => {
    setSystemInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Modal ID */}
          <div>
            <label htmlFor="modalId" className="block mb-2 text-sm font-medium text-gray-900">
              Modal ID
            </label>
            <input
              type="text"
              id="modalId"
              value={modalId}
              disabled
              className="bg-gray-200 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 cursor-not-allowed"
              placeholder="Modal ID"
            />
          </div>

          {/* Receiver ID */}
          <div>
            <label htmlFor="receiverId" className="block mb-2 text-sm font-medium text-gray-900">
              Receiver ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <span className="text-gray-500">R</span>
              </div>
              <input
                type="text"
                id="receiverId"
                value={systemInfo.receiverId}
                onChange={(e) => handleInputChange('receiverId', e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                placeholder="Receiver ID"
              />
            </div>
          </div>

          {/* Smart Card ID */}
          <div>
            <label htmlFor="smartCardId" className="block mb-2 text-sm font-medium text-gray-900">
              Smart Card ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <span className="text-gray-500">S</span>
              </div>
              <input
                type="text"
                id="smartCardId"
                value={systemInfo.smartCardId}
                onChange={(e) => handleInputChange('smartCardId', e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                placeholder="Smart Card ID"
              />
            </div>
          </div>

          {/* Secure ID */}
          <div>
            <label htmlFor="secureId" className="block mb-2 text-sm font-medium text-gray-900">
              Secure ID
            </label>
            <input
              type="text"
              id="secureId"
              value={systemInfo.secureId}
              onChange={(e) => handleInputChange('secureId', e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              placeholder="Enter Secure ID"
            />
          </div>

          {/* Location ID */}
          <div>
            <label htmlFor="locationId" className="block mb-2 text-sm font-medium text-gray-900">
              Location ID
            </label>
            <input
              type="text"
              id="locationId"
              value={systemInfo.locationId}
              onChange={(e) => handleInputChange('locationId', e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              placeholder="Enter Location ID"
            />
          </div>

          {/* Room */}
          <div>
            <label htmlFor="room" className="block mb-2 text-sm font-medium text-gray-900">
              Room
            </label>
            <input
              type="text"
              id="room"
              value={systemInfo.room}
              onChange={(e) => handleInputChange('room', e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              placeholder="Enter Room"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 transition-colors duration-200"
          >
            Add
          </button>
          <button
            onClick={onClose}
            className="bg-gray-500 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-gray-600 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
