# Fix: Sales Logs for Non-Prospect Customers

## Problem
Sales logs were failing when trying to log "Not a Customer" (non-prospect) events because:
1. The `sales_logs` API required `saleId` to be present
2. The `SalesLog` model had `saleId` with `allowNull: false`
3. Frontend was sending `notes` but API expected `note`

## Solution

### 1. Updated SalesLog Model
**File:** `models/SalesLog.js`

Changed `saleId` to allow null values:
```javascript
saleId: {
  type: DataTypes.INTEGER,
  allowNull: true, // Allow null for non-prospect customers without sales
  references: {
    model: 'sales',
    key: 'id'
  }
}
```

### 2. Updated Sales Logs API
**File:** `app/api/sales-logs/route.js`

Removed `saleId` from required fields validation:
```javascript
// Before
if (!saleId || !customerId || !action || !status) {
  return NextResponse.json(
    { error: 'Missing required fields: saleId, customerId, action, status' },
    { status: 400 }
  );
}

// After
if (!customerId || !action || !status) {
  return NextResponse.json(
    { error: 'Missing required fields: customerId, action, status' },
    { status: 400 }
  );
}
```

### 3. Fixed Field Name in Frontend
**File:** `components/AddSale.js`

Changed `notes` to `note` (singular) in API calls:
```javascript
// Before
await apiClient.post('/api/sales-logs', {
  saleId: null,
  customerId: customerId,
  agentId: user?.id,
  action: 'customer_marked_non_prospect',
  status: 'non_prospect',
  notes: 'Customer marked as non-prospect...',  // Wrong field name
  spokeTo: customer.firstName || null,
  appointment_datetime: null
});

// After
await apiClient.post('/api/sales-logs', {
  saleId: null,
  customerId: customerId,
  agentId: user?.id,
  action: 'customer_marked_non_prospect',
  status: 'non_prospect',
  note: 'Customer marked as non-prospect...',  // Correct field name
  spokeTo: customer.firstName || null,
  appointment_datetime: null
});
```

### 4. Created Database Migration
**File:** `migrations/20251010000000-allow-null-saleid-in-sales-logs.js`

Migration to update the database schema to allow null saleId:
```javascript
await queryInterface.changeColumn('sales_logs', 'sale_id', {
  type: Sequelize.INTEGER,
  allowNull: true,
  references: {
    model: 'sales',
    key: 'id'
  }
});
```

## Migration Steps

To apply the database changes, run:
```bash
npm run migrate
# or
npx sequelize-cli db:migrate
```

## Testing

### Test Case 1: New "Not a Customer"
1. Go to Add Sale page
2. Enter customer details
3. Click "Not a Customer" button
4. Check database:
   ```sql
   SELECT * FROM sales_logs WHERE action = 'customer_marked_non_prospect' ORDER BY created_at DESC LIMIT 1;
   ```
5. Verify:
   - `sale_id` is NULL
   - `customer_id` has the new customer ID
   - `action` is 'customer_marked_non_prospect'
   - `status` is 'non_prospect'
   - `note` contains the message

### Test Case 2: Existing Sale → Not a Customer
1. Open an existing sale with status: appointment/hang-up/no_response/voicemail
2. Click "Not a Customer" button
3. Confirm deletion
4. Check database:
   ```sql
   SELECT * FROM sales_logs WHERE action = 'customer_marked_non_prospect' ORDER BY created_at DESC LIMIT 1;
   ```
5. Verify:
   - `sale_id` is NULL (was the deleted sale ID)
   - `customer_id` has the customer ID
   - `note` includes previous status information
   - Sale no longer exists in `sales` table
   - Customer status is 'non_prospect' in `customers` table

## Files Changed

1. **`models/SalesLog.js`** - Allow null saleId
2. **`app/api/sales-logs/route.js`** - Remove saleId from required validation
3. **`components/AddSale.js`** - Fix field name from `notes` to `note`
4. **`migrations/20251010000000-allow-null-saleid-in-sales-logs.js`** - Database migration

## Benefits

✅ **Complete Audit Trail** - All non-prospect events are now logged properly

✅ **No Sale Required** - Can log events even when there's no sale

✅ **Data Integrity** - Customer tracking is maintained even without sales

✅ **Backward Compatible** - Existing logs with saleId still work

## Status

✅ **Complete** - Ready to test after running migration

**Implementation Date:** October 10, 2025

