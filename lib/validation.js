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
