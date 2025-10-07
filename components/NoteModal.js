'use client';

import { useState } from 'react';
import StateSelector, { getStateTimezone, convertToTimezone, getTimezoneInfo } from './StateSelector';

export default function NoteModal({ title, onClose, onNoteAdd, initialDate = '', initialTime = '', initialNote = '', customerState = '', showState = false }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [noteText, setNoteText] = useState(initialNote);
  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleTimeChange = (e) => {
    setSelectedTime(e.target.value);
  };

  const handleNoteChange = (e) => {
    setNoteText(e.target.value);
  };

  const handleAdd = () => {
    if (noteText.trim()) {
      const noteData = {
        date: selectedDate,
        time: selectedTime,
        note: noteText.trim(),
        ...(showState && customerState && { state: customerState })
      };
      onNoteAdd(noteData);
    }
  };

  const handleCancel = () => {
    setSelectedDate('');
    setSelectedTime('');
    setNoteText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {showState && customerState && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Customer's State:</span> {customerState}
                {customerState && (
                  <span className="ml-2 text-xs text-blue-600">
                    ({getTimezoneInfo(customerState)?.abbreviation || ''})
                  </span>
                )}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Enter appointment time in customer's local timezone. Pakistan time will be shown below.
              </p>
            </div>
          )}

          {/* Date Input */}
          <div>
            <label htmlFor="note-date" className="block text-sm font-medium text-gray-700 mb-2">
              Appointment Date (Optional)
            </label>
            <input
              type="date"
              id="note-date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Leave empty if no appointment needed</p>
          </div>

          {/* Time Input */}
          <div>
            <label htmlFor="note-time" className="block text-sm font-medium text-gray-700 mb-2">
              Customer's Local Time
              {customerState && (
                <span className="ml-2 text-xs text-gray-500">
                  ({getTimezoneInfo(customerState)?.abbreviation || ''})
                </span>
              )}
            </label>
            <input
              type="time"
              id="note-time"
              value={selectedTime}
              onChange={handleTimeChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Required if appointment date is set</p>
            
            {/* Pakistan Time Display */}
            {selectedDate && selectedTime && customerState && (
              <div className="mt-2">
                <div className="p-2 bg-blue-50 rounded-md">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Pakistan Time (Your Time):</span> {convertToTimezone(selectedDate, selectedTime, customerState, 'Asia/Karachi')}
                    <span className="ml-2 text-xs opacity-75">(PKT)</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Note Text Input */}
          <div>
            <label htmlFor="note-text" className="block text-sm font-medium text-gray-700 mb-2">
              Note <span className="text-red-500">*</span>
            </label>
            <textarea
              id="note-text"
              rows={4}
              value={noteText}
              onChange={handleNoteChange}
              placeholder="Enter your note here... Current date and time will be automatically added."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              {noteText.length}/500 characters
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Note format: "YYYY-MM-DD HH:MM - [your note] [Appointment: YYYY-MM-DD HH:MM]"
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!noteText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}
