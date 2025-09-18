/**
 * Shared validation functions for both frontend and backend
 * This ensures consistent validation rules across the application
 */

// Card validation functions
export const validateCardNumber = (cardNumber) => {
  if (!cardNumber) return 'Card number is required';
  const cleaned = cardNumber.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(cleaned)) return 'Card number must be 13-19 digits';
  return null;
};

export const validateCVV = (cvv) => {
  if (!cvv) return 'CVV is required';
  if (!/^\d{3,4}$/.test(cvv)) return 'CVV must be 3-4 digits';
  return null;
};

export const validateExpiryDate = (expiryDate) => {
  if (!expiryDate) return 'Expiry date is required';
  const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!regex.test(expiryDate)) return 'Expiry date must be in MM/YY format';
  
  const [month, year] = expiryDate.split('/');
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear() % 100;
  const currentMonth = currentDate.getMonth() + 1;
  
  if (parseInt(year) < currentYear || (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
    return 'Card has expired';
  }
  return null;
};

export const validateCustomerName = (name) => {
  if (!name) return 'Customer name is required';
  if (name.length < 2) return 'Customer name must be at least 2 characters';
  if (!/^[a-zA-Z\s]+$/.test(name)) return 'Customer name can only contain letters and spaces';
  return null;
};

export const validateCardType = (cardType) => {
  const validTypes = ['credit', 'debit', 'prepaid', 'gift-card'];
  if (!validTypes.includes(cardType)) return 'Invalid card type';
  return null;
};

export const validateProvider = (provider) => {
  const validProviders = ['visa', 'mastercard', 'discover', 'amex'];
  if (!validProviders.includes(provider)) return 'Invalid provider';
  return null;
};

// Phone number validation functions
export const validatePhoneNumber = (phone) => {
  if (!phone) return null; // Phone is often optional
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return 'Phone number must be 10 digits';
  return null;
};

export const validateCellNumber = (cell) => {
  return validatePhoneNumber(cell);
};

export const validateLandline = (landline) => {
  return validatePhoneNumber(landline);
};

// SSN validation
export const validateSSN = (ssn) => {
  if (!ssn) return null; // SSN might be optional in some forms
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) return 'SSN must be 9 digits';
  return null;
};

// ZIP code validation
export const validateZipCode = (zip) => {
  if (!zip) return null; // ZIP might be optional
  const digits = zip.replace(/\D/g, '');
  if (digits.length !== 5 && digits.length !== 9) return 'ZIP code must be 5 or 9 digits';
  return null;
};

// Email validation
export const validateEmail = (email) => {
  if (!email) return 'Email is required';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return 'Please enter a valid email address';
  return null;
};

// Currency validation
export const validateCurrency = (amount) => {
  if (!amount) return null; // Amount might be optional
  const cleanAmount = amount.replace(/[^\d.]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleanAmount)) return 'Please enter a valid amount';
  return null;
};

// Date validation
export const validateDate = (date) => {
  if (!date) return null; // Date might be optional
  const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  if (!dateRegex.test(date)) return 'Date must be in MM/DD/YYYY format';
  return null;
};

// Time validation
export const validateTime = (time) => {
  if (!time) return null; // Time might be optional
  const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(time)) return 'Time must be in HH:MM format';
  return null;
};

// Bank validation functions
export const validateAccountNumber = (accountNumber) => {
  if (!accountNumber) return 'Account number is required';
  const cleaned = accountNumber.replace(/\s/g, '');
  if (!/^\d{8,17}$/.test(cleaned)) return 'Account number must be 8-17 digits';
  return null;
};

export const validateRoutingNumber = (routingNumber) => {
  if (!routingNumber) return 'Routing number is required';
  if (!/^\d{9}$/.test(routingNumber)) return 'Routing number must be exactly 9 digits';
  return null;
};

export const validateDriverLicense = (driverLicense) => {
  if (!driverLicense) return 'Driver license is required';
  if (driverLicense.length < 5 || driverLicense.length > 20) return 'Driver license must be 5-20 characters';
  return null;
};

export const validateName = (name, fieldName) => {
  if (!name) return `${fieldName} is required`;
  if (name.length < 2) return `${fieldName} must be at least 2 characters`;
  if (!/^[a-zA-Z\s]+$/.test(name)) return `${fieldName} can only contain letters and spaces`;
  return null;
};

export const validateCheckNumber = (checkNumber) => {
  if (!checkNumber) return 'Check number is required';
  if (!/^\d+$/.test(checkNumber)) return 'Check number must contain only digits';
  if (checkNumber.length < 3 || checkNumber.length > 10) return 'Check number must be 3-10 digits';
  return null;
};

// Input formatting functions
export const formatCardNumber = (value) => {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
};

export const formatExpiryDate = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 2) {
    return digits.substring(0, 2) + '/' + digits.substring(2, 4);
  }
  return digits;
};

export const formatNumericOnly = (value) => {
  return value.replace(/\D/g, '');
};

export const formatRoutingNumber = (value) => {
  return value.replace(/\D/g, '').substring(0, 9);
};

// Phone number formatting functions
export const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
};

export const formatCellNumber = (value) => {
  return formatPhoneNumber(value);
};

export const formatLandline = (value) => {
  return formatPhoneNumber(value);
};

// SSN formatting
export const formatSSN = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
  }
};

// ZIP code formatting
export const formatZipCode = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) {
    return digits;
  } else {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }
};

// Currency formatting
export const formatCurrency = (value) => {
  const digits = value.replace(/[^\d.]/g, '');
  const parts = digits.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  if (parts[1] && parts[1].length > 2) {
    parts[1] = parts[1].substring(0, 2);
  }
  return parts.join('.');
};

// Date formatting (MM/DD/YYYY)
export const formatDate = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
};

// Time formatting (HH:MM)
export const formatTime = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) {
    return digits;
  } else {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
};

// Card expiration utilities
export const isCardExpired = (expiryDate) => {
  if (!expiryDate) return false;
  
  try {
    const [month, year] = expiryDate.split('/');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100;
    const currentMonth = currentDate.getMonth() + 1;
    
    const cardYear = parseInt(year);
    const cardMonth = parseInt(month);
    
    // Convert 2-digit year to 4-digit (assuming 20xx)
    const fullCardYear = cardYear < 50 ? 2000 + cardYear : 1900 + cardYear;
    const currentFullYear = currentDate.getFullYear();
    
    if (fullCardYear < currentFullYear) return true;
    if (fullCardYear === currentFullYear && cardMonth < currentMonth) return true;
    
    return false;
  } catch (error) {
    return false;
  }
};

export const isCardExpiringSoon = (expiryDate, monthsAhead = 3) => {
  if (!expiryDate || isCardExpired(expiryDate)) return false;
  
  try {
    const [month, year] = expiryDate.split('/');
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setMonth(currentDate.getMonth() + monthsAhead);
    
    const cardYear = parseInt(year);
    const cardMonth = parseInt(month);
    
    const fullCardYear = cardYear < 50 ? 2000 + cardYear : 1900 + cardYear;
    const cardExpiryDate = new Date(fullCardYear, cardMonth - 1);
    
    return cardExpiryDate <= futureDate;
  } catch (error) {
    return false;
  }
};

export const getCardExpirationStatus = (expiryDate) => {
  if (isCardExpired(expiryDate)) {
    return { status: 'expired', message: 'Card has expired', color: 'red' };
  } else if (isCardExpiringSoon(expiryDate)) {
    return { status: 'expiring_soon', message: 'Expires within 3 months', color: 'yellow' };
  } else {
    return { status: 'valid', message: 'Card is valid', color: 'green' };
  }
};

// Date formatting for display
export const formatDisplayDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
};

// Validation schemas for complete forms
export const validateCardForm = (formData) => {
  const errors = {};
  
  const cardTypeError = validateCardType(formData.cardType);
  if (cardTypeError) errors.cardType = cardTypeError;
  
  const providerError = validateProvider(formData.provider);
  if (providerError) errors.provider = providerError;
  
  const customerNameError = validateCustomerName(formData.customerName);
  if (customerNameError) errors.customerName = customerNameError;
  
  const cardNumberError = validateCardNumber(formData.cardNumber);
  if (cardNumberError) errors.cardNumber = cardNumberError;
  
  const cvvError = validateCVV(formData.cvv);
  if (cvvError) errors.cvv = cvvError;
  
  const expiryDateError = validateExpiryDate(formData.expiryDate);
  if (expiryDateError) errors.expiryDate = expiryDateError;

  return errors;
};

export const validateBankForm = (formData) => {
  const errors = {};
  
  const bankNameError = validateName(formData.bankName, 'Bank name');
  if (bankNameError) errors.bankName = bankNameError;
  
  const accountHolderError = validateName(formData.accountHolder, 'Account holder');
  if (accountHolderError) errors.accountHolder = accountHolderError;
  
  const accountNumberError = validateAccountNumber(formData.accountNumber);
  if (accountNumberError) errors.accountNumber = accountNumberError;
  
  const routingNumberError = validateRoutingNumber(formData.routingNumber);
  if (routingNumberError) errors.routingNumber = routingNumberError;
  
  const checkNumberError = validateCheckNumber(formData.checkNumber);
  if (checkNumberError) errors.checkNumber = checkNumberError;
  
  const driverLicenseError = validateDriverLicense(formData.driverLicense);
  if (driverLicenseError) errors.driverLicense = driverLicenseError;
  
  const nameOnLicenseError = validateName(formData.nameOnLicense, 'Name on license');
  if (nameOnLicenseError) errors.nameOnLicense = nameOnLicenseError;
  
  if (!formData.stateId) errors.stateId = 'State ID is required';

  return errors;
};

// Data cleaning functions
export const cleanCardData = (cardData) => {
  return {
    ...cardData,
    cardNumber: cardData.cardNumber?.replace(/\s/g, '') || cardData.cardNumber
  };
};

export const cleanBankData = (bankData) => {
  return {
    ...bankData,
    accountNumber: bankData.accountNumber?.replace(/\s/g, '') || bankData.accountNumber,
    routingNumber: bankData.routingNumber?.replace(/\s/g, '') || bankData.routingNumber,
    checkNumber: bankData.checkNumber?.replace(/\s/g, '') || bankData.checkNumber
  };
};
