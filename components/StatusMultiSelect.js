'use client';

import { useState, useRef, useEffect } from 'react';
import { SALES_STATUS_ARRAY, SALES_STATUSES, getStatusDisplayName, getStatusBadgeClasses } from '../lib/salesStatuses';

// Filter out 'sale-done' as it's an active status, not a filter option
const FILTERABLE_STATUSES = SALES_STATUS_ARRAY.filter(status => status !== SALES_STATUSES.SALE_DONE);

export default function StatusMultiSelect({
  selectedStatuses = [],
  onChange,
  disabled = false,
  placeholder = "All Statuses"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatus = (status) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    onChange(newStatuses);
  };

  const selectAll = () => {
    onChange([...FILTERABLE_STATUSES]);
  };

  const clearAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (selectedStatuses.length === 0) {
      return placeholder;
    }
    if (selectedStatuses.length === 1) {
      return getStatusDisplayName(selectedStatuses[0]);
    }
    if (selectedStatuses.length === FILTERABLE_STATUSES.length) {
      return "All Statuses";
    }
    return `${selectedStatuses.length} statuses selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 text-left flex items-center justify-between ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'
        }`}
      >
        <span className={selectedStatuses.length === 0 ? 'text-gray-500' : ''}>
          {getDisplayText()}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[220px]">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-2 flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-600 hover:text-gray-800 font-medium"
            >
              Clear All
            </button>
          </div>
          
          <div className="p-2">
            {FILTERABLE_STATUSES.map((status) => {
              const isSelected = selectedStatuses.includes(status);
              return (
                <label
                  key={status}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleStatus(status)}
                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClasses(status)}`}>
                    {getStatusDisplayName(status)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
