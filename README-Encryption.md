# 🔐 CRM Sensitive Data Encryption & Role-Based Access

This document explains the encryption and role-based access control system implemented for sensitive customer data in the CRM application.

## 📋 Overview

The system provides:
- **Automatic encryption** of sensitive data before storing in database
- **Role-based access control** where admins see full data, others see masked data
- **Transparent operation** - no changes needed to existing API calls
- **Secure storage** using AES-256 encryption with unique IVs and auth tags

## 🛡️ Protected Fields

### Bank Details (`banks` table)
- ✅ `account_number` - Bank account numbers
- ✅ `routing_number` - Bank routing numbers  
- ✅ `check_number` - Check numbers
- ✅ `driver_license` - Driver's license numbers
- ✅ `state_id` - State ID numbers

### Card Details (`cards` table)
- ✅ `card_number` - Credit/debit card numbers
- ✅ `cvv` - Card verification values
- ✅ `expiry_date` - Card expiry dates

### Sale Details (`sales` table)
- ✅ `ssn_number` - Social Security Numbers
- ✅ `account_number` - Account numbers in sales
- ✅ `security_answer` - Security question answers

## 👥 Role-Based Access Control

### Admin Users (`role: 'admin'`)
- See **full unmasked data** for all fields
- Can access complete account numbers, SSNs, etc.
- Intended for managers and authorized personnel

### Other Users (`agent`, `supervisor`, `processor`, `verification`)
- See **masked data** with different rules per field type:

| Field Type | Example Input | What Non-Admin Sees |
|------------|---------------|-------------------|
| Account Numbers | `1234567890123456` | `************3456` |
| Card Numbers | `4532123456789012` | `************9012` |
| SSN | `123-45-6789` | `XXX-XX-6789` |
| Phone Numbers | `555-123-4567` | `*******4567` |
| Driver License | `DL123456789` | `*******789` |
| State ID | `ST987654321` | `*******321` |
| Routing Numbers | `021000021` | `*********` |
| CVV | `123` | `***` |

## 🚀 Implementation Steps

### 1. Environment Setup
Add encryption key to your `.env` file:
```bash
ENCRYPTION_KEY=your-super-secret-encryption-key-change-this-in-production-32-chars
```

### 2. Run Database Migration
```bash
npx sequelize-cli db:migrate
```

### 3. Database Reset (if you have dummy data)
```bash
# Reset database and run fresh migrations
npx sequelize-cli db:drop
npx sequelize-cli db:create
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all  # If you have seeders
```

**Note**: No existing data encryption script needed since you're starting fresh!

## 💻 Usage Examples

### Basic Usage (Automatic)
```javascript
// Create new bank record - encryption happens automatically
const bank = await Bank.create({
  accountNumber: '1234567890123456', // Automatically encrypted
  routingNumber: '021000021',        // Automatically encrypted
  // ... other fields
});

// Fetch bank record - role-based masking happens automatically
const banks = await Bank.findAll({}, { userRole: 'agent' });
console.log(banks[0].accountNumber); // Shows: ************3456
```

### API Integration
```javascript
// In your API route handlers
app.get('/api/banks', async (req, res) => {
  const userRole = req.user?.role || 'agent';
  
  const banks = await Bank.findAll({}, { userRole });
  // Data is automatically masked based on user role
  
  res.json({ success: true, data: banks });
});
```

### Manual Role-Based Access
```javascript
// Get data for specific role
const bank = await Bank.findOne({ where: { id: 1 } });
const adminView = bank.getDataForRole('admin');     // Full data
const agentView = bank.getDataForRole('agent');     // Masked data
```

## 🔧 Technical Details

### Encryption Method
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with salt
- **IV**: Unique 16-byte IV per encryption
- **Authentication**: Built-in auth tag prevents tampering

### Database Changes
- Sensitive fields changed from `VARCHAR` to `TEXT` to accommodate encrypted data
- Original data structure preserved for non-sensitive fields
- Backward compatible with existing queries

### Security Features
- **Salt-based key derivation** prevents rainbow table attacks
- **Unique IVs** prevent identical plaintext from producing identical ciphertext
- **Authentication tags** detect data tampering
- **Role-based access** limits data exposure
- **Automatic encryption/decryption** reduces developer errors

## 📁 File Structure

```
lib/
├── sensitive-data.js           # Core encryption and role-based access functions
└── encryption-usage-examples.js # Usage examples and patterns

migrations/
└── 20250917000000-add-encryption-support.js # Database schema updates

models/
├── Bank.js                     # ✅ Updated with encryption hooks
├── Card.js                     # ✅ Updated with encryption hooks
└── Sale.js                     # ✅ Updated with encryption hooks
```

## ⚠️ Important Security Notes

### Production Deployment
1. **Generate a strong encryption key** (32+ characters, random)
2. **Store encryption key securely** (environment variable, not in code)
3. **Backup your database** before running encryption scripts
4. **Test role-based access** with different user roles
5. **Monitor encryption performance** on large datasets

### Key Management
- Never commit encryption keys to version control
- Use different keys for development/staging/production
- Consider key rotation policies for high-security environments
- Store keys in secure key management systems (AWS KMS, HashiCorp Vault, etc.)

### Compliance
This implementation helps meet:
- **PCI DSS** requirements for payment card data
- **GDPR/CCPA** requirements for personal data protection
- **SOX** requirements for financial data security
- **HIPAA** requirements if handling health data

## 🐛 Troubleshooting

### Common Issues

**Error: "ENCRYPTION_KEY environment variable is required"**
- Solution: Add `ENCRYPTION_KEY` to your `.env` file

**Error: "Decryption failed"**
- Solution: Check if encryption key changed between encrypt/decrypt operations

**Data appears as random characters**
- Solution: Ensure `afterFind` hook is running and user role is passed correctly

**Performance issues**
- Solution: Consider indexing strategies and query optimization for large datasets

### Debug Mode
Enable debug logging:
```javascript
process.env.DEBUG_ENCRYPTION = 'true';
```

## 📞 Support

For questions or issues:
1. Check the usage examples in `lib/encryption-usage-examples.js`
2. Review the migration and encryption scripts
3. Test with different user roles to verify masking
4. Check server logs for encryption/decryption errors

## 🔄 Future Enhancements

Potential improvements:
- Key rotation mechanism
- Audit logging for data access
- Field-level permissions (beyond role-based)
- Integration with external key management systems
- Bulk encryption/decryption utilities
- Performance optimization for large datasets
