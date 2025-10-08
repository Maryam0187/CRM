'use client';

import { useState } from 'react';
import StateSelector, { getStateTimezone, convertToTimezone, getTimezoneInfo } from './StateSelector';

export default function DateModal({ title, onClose, onDateSelect, showTime = false, initialDate = '', initialTime = '', showState = false, initialState = '', onStateChange, initialNote = '' }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [selectedState, setSelectedState] = useState(initialState);
  const [noteText, setNoteText] = useState(initialNote);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleTimeChange = (e) => {
    setSelectedTime(e.target.value);
  };

  const handleStateChange = (e) => {
    const newState = e.target.value;
    setSelectedState(newState);
    if (onStateChange) {
      onStateChange(newState);
    }
  };


  const handleAdd = () => {
    if (selectedDate) {
      const result = showTime ? { 
        date: selectedDate, 
        time: selectedTime,
        ...(showState && { state: selectedState }),
        ...(noteText.trim() && { note: noteText.trim() })
      } : selectedDate;
      onDateSelect(result);
    }
  };

  const handleCancel = () => {
    setSelectedDate('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
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
        <div className="p-6">
          <div className="mb-4">
            {showState && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <span className="font-medium">Instructions:</span> Enter the appointment time in the customer's local timezone. 
                  The system will show you the equivalent Pakistan time and save the appointment in UTC format.
                </p>
              </div>
            )}
            <p className="text-sm text-gray-600 mb-4">
              {selectedDate && `Selected: ${new Date(selectedDate).toLocaleDateString()}${selectedTime ? ` at ${selectedTime}` : ''}`}
            </p>
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              {showTime && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer's Local Time
                    {selectedState && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({getTimezoneInfo(selectedState)?.abbreviation || ''})
                      </span>
                    )}
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={handleTimeChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                  {selectedDate && selectedTime && selectedState && (
                    <div className="mt-2">
                      <div className="p-2 bg-blue-50 rounded-md">
                        <p className="text-sm text-blue-700">
                          <span className="font-medium">Pakistan Time (Your Time):</span> {convertToTimezone(selectedDate, selectedTime, selectedState, 'Asia/Karachi')}
                          <span className="ml-2 text-xs opacity-75">(PKT)</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {showState && (
                <StateSelector
                  value={selectedState}
                  onChange={handleStateChange}
                  label="State"
                  showTimezone={true}
                  required={true}
                />
              )}
              
              {/* Notes Textarea */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add any notes about this appointment..."
                  rows="3"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none"
                />
                <p className="mt-1 text-xs text-gray-500">Optional - Add any additional details about this appointment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={handleAdd}
            disabled={!selectedDate || (showState && !selectedState)}
            className="bg-blue-600 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
          >
            Add
          </button>
          <button
            onClick={handleCancel}
            className="bg-gray-500 text-white font-medium rounded-lg text-sm px-5 py-2.5 hover:bg-gray-600 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
