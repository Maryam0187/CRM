# User Management System

This document describes the new user management system that has been converted from Vue.js to Next.js.

## Features

### Admin User Management
- **Access Control**: Only users with admin role can access user management features
- **User List**: View all users with their details (name, email, role, status, creation date)
- **Add Users**: Create new users with role assignment
- **Edit Users**: Update existing user information
- **User Status**: Activate/deactivate users
- **Delete Users**: Soft delete users (deactivation)

### User Registration Form
- **Form Fields**: First name, last name, email, phone, CNIC, address, role, password
- **Role Selection**: Admin, Supervisor, Agent, Processor, Verification
- **Supervisor Assignment**: For agents, can assign a supervisor
- **Validation**: Email format, password confirmation, required fields
- **Edit Mode**: Supports both create and update operations

## API Endpoints

### Users API (`/api/users`)
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create new user (admin only)

### User API (`/api/users/[id]`)
- `GET /api/users/[id]` - Get specific user (admin only)
- `PUT /api/users/[id]` - Update user (admin only)
- `DELETE /api/users/[id]` - Deactivate user (admin only)

### Roles API (`/api/roles`)
- `GET /api/roles` - Get available roles (admin only)

### Supervisors API (`/api/supervisors`)
- `GET /api/supervisors` - Get all supervisors (admin only)

## Pages

### Admin Users Page (`/admin/users`)
- **Route**: `/admin/users`
- **Access**: Admin only
- **Features**:
  - User list with search and filtering
  - Add new user button
  - Edit/delete user actions
  - User status management

## Components

### UserForm Component
- **Location**: `components/UserForm.js`
- **Props**:
  - `user`: User object for edit mode (optional)
  - `onClose`: Function to close the form
  - `onSuccess`: Function called on successful submission
- **Features**:
  - Modal form for user creation/editing
  - Role-based field visibility
  - Form validation
  - Loading states

### AdminRoute Component
- **Location**: `components/AdminRoute.js`
- **Purpose**: Route protection for admin-only pages
- **Features**:
  - Authentication check
  - Admin role verification
  - Automatic redirect for unauthorized users

## Security Features

1. **Authentication Required**: All API endpoints require user authentication
2. **Admin Role Check**: Only admin users can access user management
3. **Input Validation**: Server-side validation for all user inputs
4. **Email Uniqueness**: Prevents duplicate email addresses
5. **Self-Protection**: Admins cannot delete their own accounts

## Navigation

The user management system is accessible through:
- **Desktop**: "User Management" link in the main navigation (admin only)
- **Mobile**: "User Management" link in the mobile menu (admin only)

## Usage

1. **Access**: Login as an admin user
2. **Navigate**: Click "User Management" in the navigation
3. **Add User**: Click "Add New User" button
4. **Edit User**: Click "Edit" button next to any user
5. **Manage Status**: Use "Activate/Deactivate" buttons
6. **Delete User**: Use "Delete" button (soft delete)

## Database Schema

The system uses the existing User model with the following fields:
- `id`: Primary key
- `email`: Unique email address
- `password`: User password (plain text - should be hashed in production)
- `firstName`: User's first name
- `lastName`: User's last name
- `role`: User role (admin, supervisor, agent, processor, verification)
- `isActive`: User status (active/inactive)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

## Future Enhancements

1. **Password Hashing**: Implement bcrypt for password security
2. **Email Notifications**: Send welcome emails to new users
3. **Bulk Operations**: Add/update multiple users at once
4. **Advanced Filtering**: Search and filter users by various criteria
5. **Audit Log**: Track user management activities
6. **Role Permissions**: More granular permission system
