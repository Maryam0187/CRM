'use client';

import { useState, useRef, useEffect } from 'react';

export default function DateFilter({ onFilterChange, onDateFieldChange, className = "", value = 'today', dateField = 'created_at' }) {
  const [selectedFilter, setSelectedFilter] = useState('Today');
  const [openDateRange, setOpenDateRange] = useState(false);
  const [openMonthRange, setOpenMonthRange] = useState(false);
  const [dates, setDates] = useState([]);
  const [dates2, setDates2] = useState('');
  const [rangeDate, setRangeDate] = useState([]);
  const [dateError, setDateError] = useState('');
  
  const dateRangeRef = useRef(null);
  const monthRangeRef = useRef(null);

  const buttons = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: null, label: 'By month' },
    { value: null, label: 'Custom' },
  ];

  // Sync internal state with value prop
  useEffect(() => {
    // Map the value to the correct button label
    let mappedValue = value;
    if (value === 'today') {
      mappedValue = 'Today';
    } else if (value === 'yesterday') {
      mappedValue = 'Yesterday';
    } else if (value && value.includes('|')) {
      mappedValue = 'Custom';
    } else if (value && value.includes(' ')) {
      mappedValue = 'By month';
    }
    setSelectedFilter(mappedValue);
  }, [value]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateRangeRef.current && !dateRangeRef.current.contains(event.target)) {
        setOpenDateRange(false);
      }
      if (monthRangeRef.current && !monthRangeRef.current.contains(event.target)) {
        setOpenMonthRange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const formatDefaultDate = (date) => {
    const options = { month: '2-digit', day: '2-digit', year: '2-digit' };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  const filterChange = (button) => {
    const currentButton = buttons.find(b => b.label === button.label);
    
    if (selectedFilter === button.label && button.label === 'Custom') {
      setOpenDateRange(true);
      return;
    }
    
    if (selectedFilter === button.label && button.label === 'By month') {
      setOpenMonthRange(true);
      return;
    }
    
    if (selectedFilter === button.label) return;
    
    setSelectedFilter(button.label);
    
    if (button.label === 'Custom') {
      setOpenMonthRange(false);
      setOpenDateRange(true);
      setDateError(''); // Clear any previous errors
      const currentDate = new Date();
      const pastDate = new Date(new Date().setDate(currentDate.getDate() - 30));
      currentDate.setHours(0, 0, 0, 0);
      pastDate.setHours(0, 0, 0, 0);
      setDates([pastDate, currentDate]);
      setRangeDate([formatDefaultDate(pastDate), formatDefaultDate(currentDate)]);
      onFilterChange(`${pastDate.toISOString()}|${currentDate.toISOString()}`);
    } else if (button.label === 'By month') {
      setOpenDateRange(false);
      setOpenMonthRange(true);
      // Use UTC to avoid timezone issues
      const now = new Date();
      const currentMonth = now.toLocaleString('en-US', { 
        month: 'long', 
        year: 'numeric',
        timeZone: 'UTC'
      });
      setDates2(currentMonth);
      onFilterChange(currentMonth);
    } else {
      setOpenDateRange(false);
      setOpenMonthRange(false);
      onFilterChange(currentButton.value);
    }
  };

  const validateDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return true;
    
    // Check if start date is before end date
    if (startDate >= endDate) {
      setDateError('Start date must be before end date');
      return false;
    }
    
    // Check if dates are the same
    if (startDate.toDateString() === endDate.toDateString()) {
      setDateError('Start date and end date cannot be the same');
      return false;
    }
    
    setDateError('');
    return true;
  };

  const handleDateRangeChange = (startDate, endDate) => {
    if (startDate && endDate) {
      if (validateDateRange(startDate, endDate)) {
        setDates([startDate, endDate]);
        onFilterChange(`${startDate.toISOString()}|${endDate.toISOString()}`);
      }
    } else {
      setDateError('');
      // Update dates even if one is missing (for partial input)
      setDates([startDate || null, endDate || null]);
    }
  };

  const handleMonthChange = (month) => {
    if (month) {
      setDates2(month);
      onFilterChange(month);
    }
  };

  return (
    <div className={`relative bg-white shadow-lg border border-gray-200 flex justify-center flex-wrap flex-row gap-6 z-1 px-8 py-4 rounded-xl mx-auto w-fit ${className}`}>
      {/* Date Range Picker */}
      {openDateRange && (
        <div ref={dateRangeRef} className="absolute top-[-95px]">
          <div 
            className="px-8 py-6 shadow-xl z-50 bg-white rounded-xl gap-4 flex border border-gray-200"
            style={{
              boxShadow: '0 -10px 25px -5px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={dates[0] && dates[0] instanceof Date ? dates[0].toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const startDate = e.target.value ? new Date(e.target.value) : null;
                      if (dates[1]) {
                        handleDateRangeChange(startDate, dates[1]);
                      } else {
                        setDates([startDate, null]);
                        setDateError('');
                      }
                    }}
                    className={`w-44 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-all duration-200 ${
                      dateError ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={dates[1] && dates[1] instanceof Date ? dates[1].toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const endDate = e.target.value ? new Date(e.target.value) : null;
                      if (dates[0]) {
                        handleDateRangeChange(dates[0], endDate);
                      } else {
                        setDates([null, endDate]);
                        setDateError('');
                      }
                    }}
                    className={`w-44 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-all duration-200 ${
                      dateError ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  />
                </div>
              </div>
              {dateError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {dateError}
                </div>
              )}
            </div>
            <button
              onClick={() => setOpenDateRange(false)}
              className="flex items-center justify-center w-10 h-10 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Month Picker */}
      {openMonthRange && (
        <div ref={monthRangeRef} className="absolute top-[-95px]">
          <div 
            className="px-8 py-6 shadow-xl z-50 bg-white rounded-xl gap-4 flex border border-gray-200"
            style={{
              boxShadow: '0 -10px 25px -5px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
              <input
                type="month"
                value={dates2 ? (() => {
                  const [month, year] = dates2.split(' ');
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                     'July', 'August', 'September', 'October', 'November', 'December'];
                  const monthIndex = monthNames.indexOf(month);
                  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                })() : ''}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-');
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                     'July', 'August', 'September', 'October', 'November', 'December'];
                  const monthString = `${monthNames[parseInt(month) - 1]} ${year}`;
                  handleMonthChange(monthString);
                }}
                className="w-44 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-all duration-200 hover:border-gray-400"
              />
            </div>
            <button
              onClick={() => setOpenMonthRange(false)}
              className="flex items-center justify-center w-10 h-10 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Date Field Toggle */}
      <div className="flex items-center gap-3 mr-6">
        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">Filter by:</span>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onDateFieldChange && onDateFieldChange('created_at')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              dateField === 'created_at'
                ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Created
          </button>
          <button
            onClick={() => onDateFieldChange && onDateFieldChange('updated_at')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              dateField === 'updated_at'
                ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Updated
          </button>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        {buttons.map((button, index) => (
          <button
            key={index}
            onClick={() => filterChange(button)}
            disabled={button.value === 'since launch'}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              selectedFilter === button.label
                ? 'bg-blue-600 text-white shadow-md transform scale-105'
                : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:shadow-sm'
            } ${
              button.value === 'since launch' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {button.label === 'Today' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
            {button.label === 'Yesterday' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
            {button.label === 'By month' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            )}
            {button.label === 'Custom' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
