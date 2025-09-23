'use client';

import { useState, useRef, useEffect } from 'react';

export default function DateFilter({ onFilterChange, className = "", value = 'today' }) {
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
    <div className={`relative bg-white shadow-md flex justify-center flex-wrap flex-row gap-4 z-50 px-8 py-3 rounded-lg mx-auto w-fit ${className}`}>
      {/* Date Range Picker */}
      {openDateRange && (
        <div ref={dateRangeRef} className="absolute top-[-85px]">
          <div 
            className="px-10 py-5 shadow-md z-50 bg-white rounded-lg gap-3 flex"
            style={{
              boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -2px rgba(0, 0, 0, 0.1)'
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
                    className={`w-40 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white ${
                      dateError ? 'border-red-300' : 'border-gray-300'
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
                    className={`w-40 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white ${
                      dateError ? 'border-red-300' : 'border-gray-300'
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
              className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors duration-200"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Month Picker */}
      {openMonthRange && (
        <div ref={monthRangeRef} className="absolute top-[-85px]">
          <div 
            className="px-10 py-5 shadow-md z-50 bg-white rounded-lg gap-3 flex"
            style={{
              boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -2px rgba(0, 0, 0, 0.1)'
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
                className="w-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
            <button
              onClick={() => setOpenMonthRange(false)}
              className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors duration-200"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      {buttons.map((button, index) => (
        <button
          key={index}
          onClick={() => filterChange(button)}
          disabled={button.value === 'since launch'}
          className={`px-6 py-2 rounded-full font-medium transition-all duration-200 ${
            selectedFilter === button.label
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
          } ${
            button.value === 'since launch' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
