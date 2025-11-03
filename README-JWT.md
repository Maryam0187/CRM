# JWT Authentication System

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token System](#token-system)
4. [JWT Validation](#jwt-validation)
5. [Automatic Token Refresh](#automatic-token-refresh)
6. [Route Protection](#route-protection)
7. [Setup Script](#setup-script)
8. [Security](#security)
9. [Usage Examples](#usage-examples)
10. [Troubleshooting](#troubleshooting)
11. [Best Practices](#best-practices)

---

## Overview

The CRM system uses **JSON Web Tokens (JWT)** for secure authentication and authorization. This system provides:

- ✅ **Secure Authentication**: JWT tokens for user identification
- ✅ **Automatic Token Refresh**: Seamless user experience with auto-refresh
- ✅ **Request-Level Security**: Every protected route validates JWT tokens
- ✅ **Role-Based Access Control**: Admin, supervisor, and agent permissions
- ✅ **User State Validation**: Checks if user account is active

---

## Architecture

### Components

```
┌─────────────────┐
│   Frontend      │
│  (React/Next)   │
└────────┬────────┘
         │ JWT Token
         ▼
┌─────────────────┐
│   API Client    │
│  (apiClient.js) │
└────────┬────────┘
         │ Automatic Refresh
         ▼
┌─────────────────┐
│  API Routes     │
│  (JWT Auth)     │
└────────┬────────┘
         │ Verify Token
         ▼
┌─────────────────┐
│   Database      │
│   (User Check)  │
└─────────────────┘
```

### Key Files

- **`lib/apiClient.js`**: Handles API calls with automatic token refresh
- **`lib/jwtAuth.js`**: JWT validation middleware functions
- **`contexts/AuthContext.js`**: React context for authentication state
- **`app/api/auth/signin/route.js`**: Login endpoint that generates tokens
- **`app/api/auth/refresh/route.js`**: Token refresh endpoint
- **`scripts/add-jwt-validation.js`**: Automated script to add JWT validation

---

## Token System

### Token Types

#### 1. Access Token
- **Purpose**: API authentication for every request
- **Lifetime**: 15 minutes
- **Storage**: localStorage
- **Format**: `Bearer <token>` in Authorization header
- **Validation**: On every protected route request

#### 2. Refresh Token
- **Purpose**: Generate new access tokens
- **Lifetime**: 1 day (24 hours)
- **Storage**: localStorage
- **Usage**: Automatic background refresh
- **Validation**: Only during token refresh

### Token Structure

```javascript
// Access Token Payload
{
  userId: 123,
  email: "user@example.com",
  role: "agent",
  name: "John Doe",
  type: "access"
}

// Refresh Token Payload
{
  userId: 123,
  email: "user@example.com",
  type: "refresh"
}
```

### Token Lifecycle

```
User Login
    │
    ├─► Generate Access Token (15 min)
    │
    ├─► Generate Refresh Token (1 day)
    │
    └─► Store in localStorage
         │
         │ API Request
         │
         ├─► Access Token Valid
         │    └─► Process Request ✅
         │
         └─► Access Token Expired (401)
              │
              ├─► Refresh Token Valid
              │   ├─► Generate New Access Token
              │   └─► Retry Request ✅
              │
              └─► Refresh Token Expired
                  └─► Logout User ❌
```

---

## JWT Validation

### Validation Process

Every protected route validates JWT tokens using this process:

#### 1. Token Extraction
```javascript
const authHeader = request.headers.get('authorization');
const token = authHeader?.replace('Bearer ', '');
```

#### 2. Token Verification
```javascript
const decoded = jwt.verify(token, JWT_SECRET);
if (decoded.type !== 'access') {
  return { error: 'Invalid token type' };
}
```

#### 3. User Validation
```javascript
const user = await User.findByPk(decoded.userId);
if (!user || !user.isActive) {
  return { error: 'User not found or inactive' };
}
```

#### 4. Response
- **Valid Token**: Continue with request processing
- **Invalid Token**: Return 401 Unauthorized
- **Expired Token**: Trigger automatic refresh (if refresh token valid)

### Validation Pattern

Every protected route follows this pattern:

```javascript
import { requireJWTAuth } from '../../../lib/jwtAuth.js';

export async function GET(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Route logic here...
    const { user } = authResult;
    // Process request with authenticated user
  } catch (error) {
    // Error handling
  }
}
```

---

## Automatic Token Refresh

### How It Works

When an API call receives a 401 Unauthorized response:

1. **Detect Expired Token**
   - Error message contains "Invalid or missing JWT token"
   - Not already a retry attempt

2. **Attempt Token Refresh**
   - Call `/api/auth/refresh` with refresh token
   - Generate new access token (15 minutes)
   - Update localStorage with new token

3. **Retry Original Request**
   - Automatically retry failed API call
   - User sees no interruption

4. **Handle Refresh Failure**
   - If refresh token expired/invalid
   - Logout user and redirect to signin
   - Clear all stored tokens

### Implementation

```javascript
// lib/apiClient.js
if (response.status === 401) {
  if (!isRetry) {
    try {
      const newAccessToken = await refreshAccessToken();
      return authenticatedFetch(url, options, true); // Retry
    } catch (error) {
      handleTokenExpiration(); // Logout
    }
  }
}
```

### Benefits

- ✅ **Seamless User Experience**: No interruption when token expires
- ✅ **Extended Sessions**: Users stay logged in up to 1 day
- ✅ **Security**: Short-lived access tokens (15 minutes)
- ✅ **Automatic**: No manual refresh needed

---

## Route Protection

### Protected Routes (JWT Required)

All business logic routes require valid JWT tokens:

- **Dashboard & Analytics**: `/api/dashboard`, `/api/sales-logs/stats`
- **Customer Management**: `/api/customers/*`, `/api/customers/check-existing`
- **Sales Management**: `/api/sales/*`, `/api/sales-logs/*`
- **Payment Processing**: `/api/payments`, `/api/banks`, `/api/cards`
- **Call Management**: `/api/calls/initiate`, `/api/calls/status/*`, `/api/calls/notes`
- **Data Management**: `/api/carriers/*`, `/api/receivers/*`
- **User Management**: `/api/users/*`, `/api/roles`, `/api/supervisors`
- **Notifications**: `/api/notifications`
- **System Management**: `/api/supervisor-agents`, `/api/role-assignments`

### Public Routes (No JWT Required)

Authentication and system routes remain public:

- **Authentication**: `/api/auth/signin`, `/api/auth/refresh`
- **Testing**: `/api/test-*` routes
- **System**: `/api/deployment-info`, `/api/socket/health`
- **Webhooks**: `/api/twilio/*` callback routes

### Role-Based Access Control

#### Admin-Only Routes
```javascript
import { requireJWTAdmin } from '../../../lib/jwtAuth.js';

// Only admin users can access
const authResult = await requireJWTAdmin(request);
```

#### Supervisor+ Routes
```javascript
import { requireJWTSupervisor } from '../../../lib/jwtAuth.js';

// Supervisor or admin users can access
const authResult = await requireJWTSupervisor(request);
```

#### General Authenticated Routes
```javascript
import { requireJWTAuth } from '../../../lib/jwtAuth.js';

// Any authenticated user can access
const authResult = await requireJWTAuth(request);
```

---

## Setup Script

### Overview

The `add-jwt-validation.js` script automatically adds JWT authentication to all protected API routes.

### Usage

#### Run Locally
```bash
# Method 1: Using npm (recommended)
npm run add-jwt-validation

# Method 2: Direct Node command
node scripts/add-jwt-validation.js

# Method 3: Make executable
chmod +x scripts/add-jwt-validation.js
./scripts/add-jwt-validation.js
```

#### Run in Production

**Option 1: Pre-Deployment (Recommended)**
```bash
# Run locally before deploying
npm run add-jwt-validation

# Commit and push
git add .
git commit -m "Add JWT validation to routes"
git push
```

**Option 2: During Build**
```bash
# Add to deployment script
npm run add-jwt-validation
npm run build
# Deploy...
```

### When to Run

#### ✅ Run When:
- Initial setup of JWT validation
- Adding new protected API routes
- Accidentally removed JWT validation code
- After major code refactoring

#### ❌ Don't Run When:
- All routes already have JWT validation
- Working with public routes
- During peak traffic (though it's safe)

### Script Features

- **Idempotent**: Safe to run multiple times
- **Smart Detection**: Skips routes with existing validation
- **Automatic**: Adds imports and validation code
- **Consistent**: Same pattern across all routes

### Expected Output

```
🔒 Adding JWT validation to protected API routes...

✅ JWT validation already present: app/api/dashboard/route.js
✅ Added JWT validation to: app/api/new-route/route.js

📋 Summary:
✅ Processed 19 protected routes
🔓 13 routes remain public (no JWT validation)

✨ JWT validation setup complete!
```

---

## Security

### Security Features

1. **Request-Level Security**
   - Every API call validates user identity
   - Prevents unauthorized access
   - Ensures user is still active

2. **Token Expiration**
   - Short-lived access tokens (15 minutes)
   - Automatic refresh prevents interruption
   - Failed refresh triggers logout

3. **Role-Based Access**
   - Different permission levels
   - Admin routes only for admins
   - Supervisor routes for supervisors and admins

4. **User State Validation**
   - Checks if user account is active
   - Prevents access by deactivated users
   - Validates user exists in database

### Environment Variables

```bash
# Required for JWT system
JWT_SECRET=your_jwt_secret_key_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here
JWT_EXPIRES_IN=24h
```

### Security Best Practices

1. **Token Storage**
   - Store tokens in httpOnly cookies (recommended)
   - Current: localStorage (acceptable for SPA)
   - Never store tokens in plain text

2. **Token Transmission**
   - Always use HTTPS in production
   - Include tokens in Authorization header
   - Never expose tokens in URLs

3. **Error Messages**
   - Don't reveal specific validation failures
   - Use generic "Unauthorized" messages
   - Log detailed errors server-side only

---

## Usage Examples

### Frontend Usage

```javascript
// apiClient automatically handles token refresh
import { apiClient } from '../lib/apiClient';

// Make authenticated API call
const response = await apiClient.get('/api/dashboard');
const data = await response.json();

// POST request with data
const response = await apiClient.post('/api/customers', {
  firstName: 'John',
  lastName: 'Doe'
});
```

### Backend Usage

```javascript
// Basic authentication
import { requireJWTAuth } from '../../../lib/jwtAuth.js';

export async function GET(request) {
  const authResult = await requireJWTAuth(request);
  if (authResult.error) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }
  
  const { user } = authResult;
  // Use user.id, user.role, etc.
}

// Admin-only route
import { requireJWTAdmin } from '../../../lib/jwtAuth.js';

export async function DELETE(request) {
  const authResult = await requireJWTAdmin(request);
  if (authResult.error) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }
  // Admin-only logic
}
```

### Testing

```bash
# Test without token (should return 401)
curl http://localhost:3000/api/dashboard

# Test with invalid token (should return 401)
curl -H "Authorization: Bearer invalid-token" http://localhost:3000/api/dashboard

# Test with valid token (should return 200)
curl -H "Authorization: Bearer <valid-token>" http://localhost:3000/api/dashboard
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid or missing JWT token"
**Causes:**
- Missing Authorization header
- Token expired
- Token format incorrect

**Solutions:**
- Check Authorization header format: `Bearer <token>`
- Verify token is not expired
- Ensure token is properly formatted

#### 2. "User not found or inactive"
**Causes:**
- User account deactivated
- User deleted from database
- Database connection issue

**Solutions:**
- Check user status in database
- Verify database connection
- Check user account is active

#### 3. Token Refresh Fails
**Causes:**
- Refresh token expired (1 day)
- Refresh token invalid
- User account deactivated

**Solutions:**
- User needs to login again
- Check refresh token expiry
- Verify user is still active

### Debug Steps

1. **Check Browser Storage**
   ```javascript
   // In browser console
   console.log('Access Token:', localStorage.getItem('accessToken'));
   console.log('Refresh Token:', localStorage.getItem('refreshToken'));
   ```

2. **Monitor Network Tab**
   - Watch for `/api/auth/refresh` calls
   - Check 401 responses
   - Verify token refresh flow

3. **Check Server Logs**
   - Look for JWT validation errors
   - Check token refresh attempts
   - Monitor authentication failures

4. **Verify Environment Variables**
   ```bash
   # Check JWT secrets are set
   echo $JWT_SECRET
   echo $JWT_REFRESH_SECRET
   ```

5. **Test Refresh Endpoint**
   ```bash
   curl -X POST http://localhost:3000/api/auth/refresh \
     -H "Content-Type: application/json" \
     -d '{"refreshToken":"your-refresh-token"}'
   ```

### Console Logs

Monitor these logs for debugging:

- `🔒 JWT token expired, attempting to refresh...`
- `✅ Access token refreshed successfully`
- `❌ Token refresh failed: [error]`
- `🔒 Refresh token expired or invalid, logging out user`

---

## Best Practices

### Development

1. **Always Use apiClient**
   - Use `apiClient` instead of raw `fetch`
   - Automatic token refresh handling
   - Consistent error handling

2. **Test Token Expiration**
   - Test with expired tokens
   - Verify automatic refresh works
   - Check logout on refresh failure

3. **Use Role-Based Access**
   - Check user roles before operations
   - Validate permissions server-side
   - Never trust client-side validation

### Production

1. **Environment Variables**
   - Use strong, unique secrets
   - Never commit secrets to git
   - Use environment-specific secrets

2. **HTTPS Only**
   - Always use HTTPS in production
   - Never transmit tokens over HTTP
   - Use secure cookies if possible

3. **Monitoring**
   - Log authentication failures
   - Track token refresh events
   - Monitor unauthorized access attempts

4. **Error Handling**
   - Generic error messages to users
   - Detailed logs server-side
   - Don't expose validation details

### Maintenance

1. **Regular Audits**
   - Review protected routes
   - Check token lifetimes
   - Verify user permission logic

2. **Update Scripts**
   - Run `add-jwt-validation.js` when adding routes
   - Keep validation patterns consistent
   - Test after updates

3. **Security Updates**
   - Keep JWT library updated
   - Monitor security advisories
   - Update token rotation strategy

---

## Summary

### Key Features

- ✅ **Secure Authentication**: JWT tokens for all requests
- ✅ **Automatic Refresh**: Seamless token refresh on expiration
- ✅ **Request-Level Security**: Every protected route validates tokens
- ✅ **Role-Based Access**: Admin, supervisor, and agent permissions
- ✅ **User State Validation**: Checks account status

### Quick Reference

```bash
# Setup JWT validation
npm run add-jwt-validation

# Test protected route
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/dashboard

# Environment variables
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

### Files to Know

- `lib/apiClient.js` - API client with auto-refresh
- `lib/jwtAuth.js` - JWT validation middleware
- `contexts/AuthContext.js` - React auth context
- `app/api/auth/refresh/route.js` - Token refresh endpoint
- `scripts/add-jwt-validation.js` - Setup script

---

**The JWT authentication system provides enterprise-level security with automatic token refresh, ensuring users stay logged in while maintaining tight security controls.**
