const crypto = require('crypto');

// Configuration for AES encryption (two-way - for bank/card data)
const ALGORITHM = 'aes-256-cbc';

/**
 * AES Encryption for sensitive data that admins need to see in full
 * (Bank accounts, card numbers, SSNs, etc.)
 */

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  return crypto.scryptSync(key, 'salt', 32);
}

/**
 * Encrypt sensitive data (two-way)
 * @param {string} text - The text to encrypt
 * @returns {string} - Encrypted data
 */
function encryptSensitiveData(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data
 * @returns {string} - Decrypted text
 */
function decryptSensitiveData(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    return encryptedData;
  }

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    const iv = combined.subarray(0, 16);
    const encrypted = combined.subarray(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedData; // Return original if decryption fails
  }
}

/**
 * Role-based data access control
 * @param {string} data - The sensitive data (decrypted)
 * @param {string} userRole - The role of the user requesting data
 * @param {string} fieldType - Type of field (account, card, ssn, etc.)
 * @returns {string} - Either full data or masked data based on role
 */
function getDataBasedOnRole(data, userRole, fieldType = 'default') {
  if (!data || typeof data !== 'string') {
    return data;
  }

  // Admin can see everything
  if (userRole === 'admin') {
    return data;
  }

  // Different masking rules for different field types
  switch (fieldType) {
    case 'account':
      // Show last 4 digits for account numbers (****1234)
      return maskSensitiveData(data, 4);
      
    case 'card':
      // Show last 4 digits for card numbers (****1234)
      return maskSensitiveData(data, 4);
    
    case 'ssn':
      // Show last 4 digits for SSN (XXX-XX-1234)
      if (data.length === 11 && data.includes('-')) {
        return 'XXX-XX-' + data.slice(-4);
      }
      return maskSensitiveData(data, 4);
    
    case 'phone':
      // Show last 4 digits for phone numbers
      return maskSensitiveData(data, 4);
    
    case 'license':
      // Show last 3 digits for driver license
      return maskSensitiveData(data, 3);
      
    case 'state_id':
      // Show last 2 digits for state ID
      return maskSensitiveData(data, 2);
    
    case 'routing':
      // Completely hide routing numbers for non-admin
      return '*'.repeat(9);
    
    case 'cvv':
      // Completely hide CVV
      return '***';
      
    case 'check':
    case 'default':
      // Show last 4 characters for check numbers and other fields
      return maskSensitiveData(data, 4);
  }
}

/**
 * Utility functions
 */


function isEncrypted(data) {
  if (!data || typeof data !== 'string') return false;
  try {
    const decoded = Buffer.from(data, 'base64');
    return decoded.length >= 17; // At least IV (16 bytes) + 1 byte of data
  } catch {
    return false;
  }
}

function maskSensitiveData(data, visibleChars = 4) {
  if (!data || typeof data !== 'string') {
    return data;
  }
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }
  return '*'.repeat(data.length - visibleChars) + data.slice(-visibleChars);
}

module.exports = {
  // AES encryption for sensitive data (two-way)
  encryptSensitiveData,
  decryptSensitiveData,
  isEncrypted,
  
  // Role-based access control
  getDataBasedOnRole,
  
  // Utilities
  maskSensitiveData
};
