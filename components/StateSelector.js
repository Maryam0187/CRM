'use client';

import { useState } from 'react';

// Export utility functions for use in other components
export const getStateTimezone = (stateCode) => {
  const stateTimezones = {
    // Eastern Time (ET)
    'CT': 'America/New_York',
    'DE': 'America/New_York', 
    'FL': 'America/New_York', // Most of Florida
    'GA': 'America/New_York',
    'IN': 'America/New_York', // Most of Indiana
    'KY': 'America/New_York', // Eastern part
    'ME': 'America/New_York',
    'MD': 'America/New_York',
    'MA': 'America/New_York',
    'MI': 'America/New_York', // Eastern part
    'NH': 'America/New_York',
    'NJ': 'America/New_York',
    'NY': 'America/New_York',
    'NC': 'America/New_York',
    'OH': 'America/New_York',
    'PA': 'America/New_York',
    'RI': 'America/New_York',
    'SC': 'America/New_York',
    'TN': 'America/New_York', // Eastern part
    'VT': 'America/New_York',
    'VA': 'America/New_York',
    'WV': 'America/New_York',
    'DC': 'America/New_York',

    // Central Time (CT)
    'AL': 'America/Chicago',
    'AR': 'America/Chicago',
    'IL': 'America/Chicago',
    'IA': 'America/Chicago',
    'KS': 'America/Chicago', // Most of Kansas
    'KY': 'America/Chicago', // Western part
    'LA': 'America/Chicago',
    'MN': 'America/Chicago',
    'MS': 'America/Chicago',
    'MO': 'America/Chicago',
    'NE': 'America/Chicago', // Eastern part
    'ND': 'America/Chicago',
    'OK': 'America/Chicago',
    'SD': 'America/Chicago', // Eastern part
    'TN': 'America/Chicago', // Western part
    'TX': 'America/Chicago', // Most of Texas
    'WI': 'America/Chicago',

    // Mountain Time (MT)
    'AZ': 'America/Phoenix', // Arizona doesn't observe DST
    'CO': 'America/Denver',
    'ID': 'America/Denver', // Southern part
    'MT': 'America/Denver',
    'NE': 'America/Denver', // Western part
    'NM': 'America/Denver',
    'ND': 'America/Denver', // Western part
    'SD': 'America/Denver', // Western part
    'TX': 'America/Denver', // Western part
    'UT': 'America/Denver',
    'WY': 'America/Denver',

    // Pacific Time (PT)
    'CA': 'America/Los_Angeles',
    'ID': 'America/Los_Angeles', // Northern part
    'NV': 'America/Los_Angeles', // Most of Nevada
    'OR': 'America/Los_Angeles',
    'WA': 'America/Los_Angeles',

    // Alaska Time (AKT)
    'AK': 'America/Anchorage',

    // Hawaii Time (HST)
    'HI': 'Pacific/Honolulu',

    // Territories
    'AS': 'Pacific/Pago_Pago',
    'GU': 'Pacific/Guam',
    'MP': 'Pacific/Saipan',
    'PR': 'America/Puerto_Rico',
    'VI': 'America/St_Thomas'
  };
  
  return stateTimezones[stateCode] || 'America/New_York'; // Default to Eastern Time
};

export const convertToUTC = (dateString, timeString, stateCode) => {
  if (!dateString || !timeString || !stateCode) {
    return null;
  }

  try {
    const timezone = getStateTimezone(stateCode);
    
    // Create a date string that represents the local time in the state's timezone
    const stateDateTime = `${dateString}T${timeString}:00`;
    
    // Use a different approach: Create a temporary date and use timezone conversion
    // First, create a date assuming it's in UTC
    const tempDate = new Date(`${stateDateTime}Z`);
    
    // Get what this UTC time would look like in the state's timezone
    const stateTimeStr = tempDate.toLocaleString('sv-SE', { timeZone: timezone });
    const utcTimeStr = tempDate.toLocaleString('sv-SE', { timeZone: 'UTC' });
    
    // Parse these back to dates to calculate the difference
    const stateTime = new Date(stateTimeStr);
    const utcTime = new Date(utcTimeStr);
    
    // Calculate the offset difference
    const offsetMs = stateTime.getTime() - utcTime.getTime();
    
    // Now create the actual state time and convert to UTC
    const actualStateTime = new Date(`${stateDateTime}Z`); // Treat as UTC temporarily
    const utcDateTime = new Date(actualStateTime.getTime() - offsetMs);
    
    return utcDateTime.toISOString();
  } catch (error) {
    console.error('Error converting time to UTC:', error);
    // Fallback to original behavior
    return new Date(`${dateString}T${timeString}`).toISOString();
  }
};

// Convert UTC time back to local timezone for edit mode
export const convertFromUTC = (utcDateTimeString, stateCode) => {
  if (!utcDateTimeString || !stateCode) {
    return { date: '', time: '' };
  }

  try {
    const timezone = getStateTimezone(stateCode);
    
    // Simple approach: Use the same logic as convertToUTC but in reverse
    // Get timezone offset information for the specific date
    const testDate = new Date(`${utcDateTimeString.split('T')[0]}T12:00:00`); // Use noon to avoid DST transition issues
    
    // Get the timezone offset for the state's timezone on this specific date
    const stateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    });
    
    // Parse the offset strings to get the actual offset values
    const stateOffsetStr = stateFormatter.formatToParts(testDate).find(part => part.type === 'timeZoneName')?.value;
    const stateOffset = parseOffset(stateOffsetStr);
    
    // Create the UTC date
    const utcDate = new Date(utcDateTimeString);
    
    // Convert from UTC to local time
    // For example: Chicago CDT is UTC-5, so to convert from UTC to local we subtract 5 hours
    // stateOffset is -5, so we need to subtract the absolute value
    // UTC 16:00 becomes local 11:00 (16:00 - 5 = 11:00)
    const localDate = new Date(utcDate.getTime() + (stateOffset * 60 * 60 * 1000));
    
    // Format the date and time
    const date = localDate.toISOString().split('T')[0];
    const time = localDate.toISOString().split('T')[1].substring(0, 5);
    
    return { date, time };
  } catch (error) {
    console.error('Error converting from UTC:', error);
    // Fallback to UTC time
    const date = new Date(utcDateTimeString);
    return {
      date: date.toISOString().split('T')[0],
      time: date.toTimeString().split(' ')[0].substring(0, 5)
    };
  }
};

// Convert time to specific timezone for display
export const convertToTimezone = (dateString, timeString, stateCode, targetTimezone) => {
  if (!dateString || !timeString || !stateCode) return null;
  
  try {
    // Get timezone offset information for the specific date
    const stateTimezone = getStateTimezone(stateCode);
    
    // Create a date object for the specific date to get accurate DST info
    const testDate = new Date(`${dateString}T12:00:00`); // Use noon to avoid DST transition issues
    
    // Get the timezone offset for the state's timezone on this specific date
    const stateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: stateTimezone,
      timeZoneName: 'longOffset'
    });
    
    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimezone,
      timeZoneName: 'longOffset'
    });
    
    // Parse the offset strings to get the actual offset values
    const stateOffsetStr = stateFormatter.formatToParts(testDate).find(part => part.type === 'timeZoneName')?.value;
    const targetOffsetStr = targetFormatter.formatToParts(testDate).find(part => part.type === 'timeZoneName')?.value;
    
    // Extract offset values (e.g., "GMT-05:00" -> -5)
    const stateOffset = parseOffset(stateOffsetStr);
    const targetOffset = parseOffset(targetOffsetStr);
    
    // Calculate the difference in hours
    const offsetDifference = targetOffset - stateOffset;
    
    // Apply the offset to convert from state time to target time
    const stateTime = new Date(`${dateString}T${timeString}:00`);
    const targetTime = new Date(stateTime.getTime() + (offsetDifference * 60 * 60 * 1000));
    
    return targetTime.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error converting timezone:', error);
    return timeString;
  }
};

// Helper function to parse timezone offset strings
const parseOffset = (offsetStr) => {
  if (!offsetStr) return 0;
  
  // Handle formats like "GMT-05:00", "GMT+05:00"
  const match = offsetStr.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (match) {
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2]);
    const minutes = parseInt(match[3]);
    return sign * (hours + minutes / 60);
  }
  
  return 0;
};

// Get timezone abbreviation and offset info
export const getTimezoneInfo = (stateCode, date = new Date()) => {
  if (!stateCode) return null;
  
  try {
    const timezone = getStateTimezone(stateCode);
    const dateStr = date.toISOString();
    
    // Get timezone abbreviation and offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;
    
    return {
      timezone,
      abbreviation: timeZoneName,
      offset: date.toLocaleString("en-US", {timeZone: timezone, timeZoneName: 'longOffset'})
    };
  } catch (error) {
    console.error('Error getting timezone info:', error);
    return null;
  }
};

export default function StateSelector({ 
  value, 
  onChange, 
  label = "State", 
  showTimezone = true, 
  required = false,
  className = "",
  disabled = false 
}) {
  // US State to Timezone mapping
  const getStateTimezone = (stateCode) => {
    const stateTimezones = {
      // Eastern Time (ET)
      'CT': 'America/New_York',
      'DE': 'America/New_York', 
      'FL': 'America/New_York', // Most of Florida
      'GA': 'America/New_York',
      'IN': 'America/New_York', // Most of Indiana
      'KY': 'America/New_York', // Eastern part
      'ME': 'America/New_York',
      'MD': 'America/New_York',
      'MA': 'America/New_York',
      'MI': 'America/New_York', // Eastern part
      'NH': 'America/New_York',
      'NJ': 'America/New_York',
      'NY': 'America/New_York',
      'NC': 'America/New_York',
      'OH': 'America/New_York',
      'PA': 'America/New_York',
      'RI': 'America/New_York',
      'SC': 'America/New_York',
      'TN': 'America/New_York', // Eastern part
      'VT': 'America/New_York',
      'VA': 'America/New_York',
      'WV': 'America/New_York',
      'DC': 'America/New_York',

      // Central Time (CT)
      'AL': 'America/Chicago',
      'AR': 'America/Chicago',
      'IL': 'America/Chicago',
      'IA': 'America/Chicago',
      'KS': 'America/Chicago', // Most of Kansas
      'KY': 'America/Chicago', // Western part
      'LA': 'America/Chicago',
      'MN': 'America/Chicago',
      'MS': 'America/Chicago',
      'MO': 'America/Chicago',
      'NE': 'America/Chicago', // Eastern part
      'ND': 'America/Chicago',
      'OK': 'America/Chicago',
      'SD': 'America/Chicago', // Eastern part
      'TN': 'America/Chicago', // Western part
      'TX': 'America/Chicago', // Most of Texas
      'WI': 'America/Chicago',

      // Mountain Time (MT)
      'AZ': 'America/Phoenix', // Arizona doesn't observe DST
      'CO': 'America/Denver',
      'ID': 'America/Denver', // Southern part
      'MT': 'America/Denver',
      'NE': 'America/Denver', // Western part
      'NM': 'America/Denver',
      'ND': 'America/Denver', // Western part
      'SD': 'America/Denver', // Western part
      'TX': 'America/Denver', // Western part
      'UT': 'America/Denver',
      'WY': 'America/Denver',

      // Pacific Time (PT)
      'CA': 'America/Los_Angeles',
      'ID': 'America/Los_Angeles', // Northern part
      'NV': 'America/Los_Angeles', // Most of Nevada
      'OR': 'America/Los_Angeles',
      'WA': 'America/Los_Angeles',

      // Alaska Time (AKT)
      'AK': 'America/Anchorage',

      // Hawaii Time (HST)
      'HI': 'Pacific/Honolulu',

      // Territories
      'AS': 'Pacific/Pago_Pago',
      'GU': 'Pacific/Guam',
      'MP': 'Pacific/Saipan',
      'PR': 'America/Puerto_Rico',
      'VI': 'America/St_Thomas'
    };
    
    return stateTimezones[stateCode] || 'America/New_York'; // Default to Eastern Time
  };

  const formatTimezoneDisplay = (timezone) => {
    return timezone
      .replace('America/', '')
      .replace('Pacific/', '')
      .replace('_', ' ');
  };

  return (
    <div className={className}>
      <label className="block mb-2 text-sm font-medium text-gray-900">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {showTimezone && value && (
          <span className="ml-2 text-xs text-blue-600 font-normal">
            (Timezone: {formatTimezoneDisplay(getStateTimezone(value))})
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">Select State</option>
        <option value="AL">Alabama (AL)</option>
        <option value="AK">Alaska (AK)</option>
        <option value="AZ">Arizona (AZ)</option>
        <option value="AR">Arkansas (AR)</option>
        <option value="CA">California (CA)</option>
        <option value="CO">Colorado (CO)</option>
        <option value="CT">Connecticut (CT)</option>
        <option value="DE">Delaware (DE)</option>
        <option value="FL">Florida (FL)</option>
        <option value="GA">Georgia (GA)</option>
        <option value="HI">Hawaii (HI)</option>
        <option value="ID">Idaho (ID)</option>
        <option value="IL">Illinois (IL)</option>
        <option value="IN">Indiana (IN)</option>
        <option value="IA">Iowa (IA)</option>
        <option value="KS">Kansas (KS)</option>
        <option value="KY">Kentucky (KY)</option>
        <option value="LA">Louisiana (LA)</option>
        <option value="ME">Maine (ME)</option>
        <option value="MD">Maryland (MD)</option>
        <option value="MA">Massachusetts (MA)</option>
        <option value="MI">Michigan (MI)</option>
        <option value="MN">Minnesota (MN)</option>
        <option value="MS">Mississippi (MS)</option>
        <option value="MO">Missouri (MO)</option>
        <option value="MT">Montana (MT)</option>
        <option value="NE">Nebraska (NE)</option>
        <option value="NV">Nevada (NV)</option>
        <option value="NH">New Hampshire (NH)</option>
        <option value="NJ">New Jersey (NJ)</option>
        <option value="NM">New Mexico (NM)</option>
        <option value="NY">New York (NY)</option>
        <option value="NC">North Carolina (NC)</option>
        <option value="ND">North Dakota (ND)</option>
        <option value="OH">Ohio (OH)</option>
        <option value="OK">Oklahoma (OK)</option>
        <option value="OR">Oregon (OR)</option>
        <option value="PA">Pennsylvania (PA)</option>
        <option value="RI">Rhode Island (RI)</option>
        <option value="SC">South Carolina (SC)</option>
        <option value="SD">South Dakota (SD)</option>
        <option value="TN">Tennessee (TN)</option>
        <option value="TX">Texas (TX)</option>
        <option value="UT">Utah (UT)</option>
        <option value="VT">Vermont (VT)</option>
        <option value="VA">Virginia (VA)</option>
        <option value="WA">Washington (WA)</option>
        <option value="WV">West Virginia (WV)</option>
        <option value="WI">Wisconsin (WI)</option>
        <option value="WY">Wyoming (WY)</option>
        <option value="DC">District of Columbia (DC)</option>
        <option value="AS">American Samoa (AS)</option>
        <option value="GU">Guam (GU)</option>
        <option value="MP">Northern Mariana Islands (MP)</option>
        <option value="PR">Puerto Rico (PR)</option>
        <option value="VI">U.S. Virgin Islands (VI)</option>
      </select>
    </div>
  );
}
