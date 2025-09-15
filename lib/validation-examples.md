# Validation Helper Usage Examples

This document shows how to use the shared validation functions in different parts of the application.

## Frontend Usage

### React Component Example
```javascript
import { validateCardForm, formatCardNumber } from '../lib/validation.js';

// In your component
const handleSubmit = (formData) => {
  const errors = validateCardForm(formData);
  if (Object.keys(errors).length > 0) {
    setValidationErrors(errors);
    return;
  }
  // Proceed with submission
};

// Format input
const handleCardNumberChange = (value) => {
  const formatted = formatCardNumber(value);
  setFormData(prev => ({ ...prev, cardNumber: formatted }));
};
```

## Backend Usage

### API Route Example
```javascript
import { validateCardForm, cleanCardData } from '../../../lib/validation.js';

export async function POST(request) {
  const data = await request.json();
  
  // Validate
  const errors = validateCardForm(data);
  if (Object.keys(errors).length > 0) {
    return Response.json({ success: false, errors }, { status: 400 });
  }
  
  // Clean data
  const cleanData = cleanCardData(data);
  
  // Save to database
  const result = await Model.create(cleanData);
  return Response.json({ success: true, data: result });
}
```

## Available Functions

### Card Validation
- `validateCardNumber(cardNumber)`
- `validateCVV(cvv)`
- `validateExpiryDate(expiryDate)`
- `validateCustomerName(name)`
- `validateCardType(cardType)`
- `validateProvider(provider)`
- `validateCardForm(formData)` - Validates entire form

### Bank Validation
- `validateAccountNumber(accountNumber)`
- `validateRoutingNumber(routingNumber)`
- `validateDriverLicense(driverLicense)`
- `validateName(name, fieldName)`
- `validateCheckNumber(checkNumber)`
- `validateBankForm(formData)` - Validates entire form

### Formatting Functions
- `formatCardNumber(value)`
- `formatExpiryDate(value)`
- `formatNumericOnly(value)`
- `formatRoutingNumber(value)`

### Data Cleaning Functions
- `cleanCardData(cardData)`
- `cleanBankData(bankData)`

## Benefits

1. **Consistency**: Same validation rules across frontend and backend
2. **Maintainability**: Update validation logic in one place
3. **Reusability**: Use validation functions in multiple components
4. **Type Safety**: Consistent error messages and return types
5. **Testing**: Easy to unit test validation logic separately
