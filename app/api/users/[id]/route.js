import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireJWTAdmin } from '../../../../lib/jwtAuth';
import { getRoleDisplayName } from '../../../../lib/roleUtils';

// GET /api/users/[id] - Get specific user (admin only)
export async function GET(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = (await params).id;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'cnic', 'phone', 'address', 'status', 'lastLoginTime', 'lastLogoutTime', 'latitude', 'longitude', 'locationAccuracy', 'locationTimestamp', 'locationPermission', 'extension', 'sipUsername', 'sipDomain', 'callStatus', 'created_at', 'updated_at'],
      include: [
        {
          model: require('../../../../models').SupervisorAgent,
          as: 'supervisorRelationships',
          include: [
            {
              model: User,
              as: 'supervisor',
              attributes: ['id', 'firstName', 'lastName']
            }
          ],
          required: false
        }
      ]
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Format user data
    const supervisorRelationship = user.supervisorRelationships && user.supervisorRelationships.length > 0 
      ? user.supervisorRelationships[0] 
      : null;
    
    const formattedUser = {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      role_display: getRoleDisplayName(user.role),
      is_active: user.isActive,
      cnic: user.cnic,
      phone: user.phone,
      address: user.address,
      status: user.status || 'offline',
      last_login_time: user.lastLoginTime,
      last_logout_time: user.lastLogoutTime,
      latitude: user.latitude,
      longitude: user.longitude,
      location_accuracy: user.locationAccuracy,
      location_timestamp: user.locationTimestamp,
      location_permission: user.locationPermission,
      extension: user.extension,
      sip_username: user.sipUsername,
      sip_domain: user.sipDomain,
      call_status: user.callStatus || 'offline',
      superiorId: supervisorRelationship ? supervisorRelationship.supervisor.id : null,
      supervisor_name: supervisorRelationship ? `${supervisorRelationship.supervisor.firstName} ${supervisorRelationship.supervisor.lastName}` : null,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return NextResponse.json({
      success: true,
      data: formattedUser
    });

  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update user (admin only)
export async function PUT(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = (await params).id;
    const {
      first_name,
      last_name,
      email,
      role,
      is_active,
      phone,
      cnic,
      address,
      superiorId,
      extension,
      sip_username,
      sip_password,
      sip_domain
    } = await request.json();

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Validate role if provided - prevent setting admin role
    if (role) {
      // Prevent changing role to admin
      if (role === 'admin') {
        return NextResponse.json(
          { error: 'Cannot set user role to admin. Admin role cannot be assigned through the UI.' },
          { status: 400 }
        );
      }
      
      const validRoles = ['supervisor', 'agent', 'processor', 'verification'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // Check if email already exists (excluding current user)
      const existingUser = await User.findOne({
        where: { 
          email: email.toLowerCase(),
          id: { [require('sequelize').Op.ne]: userId }
        }
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 400 }
        );
      }
    }

    // Update user
    const updateData = {};
    if (first_name) updateData.firstName = first_name;
    if (last_name) updateData.lastName = last_name;
    if (email) updateData.email = email.toLowerCase();
    
    // Prevent changing admin role - if user is admin, don't allow role change
    if (role && user.role !== 'admin') {
      updateData.role = role;
    } else if (role && user.role === 'admin' && role !== 'admin') {
      // User is trying to change admin role - reject it
      return NextResponse.json(
        { error: 'Cannot change admin role. Admin role cannot be modified.' },
        { status: 400 }
      );
    }
    
    if (typeof is_active === 'boolean') updateData.isActive = is_active;
    
    // Handle optional phone field - clean and convert empty string to null
    if (phone !== undefined) {
      if (phone === '' || phone === null) {
        updateData.phone = null;
      } else {
        // Remove dashes, spaces, and other non-numeric characters for validation
        const cleanedPhone = phone.replace(/\D/g, '');
        updateData.phone = cleanedPhone || null;
      }
    }
    
    // Handle optional CNIC field - clean and convert empty string to null
    if (cnic !== undefined) {
      if (cnic === '' || cnic === null) {
        updateData.cnic = null;
      } else {
        // Remove dashes, spaces, and other non-numeric characters for validation
        const cleanedCNIC = cnic.replace(/\D/g, '');
        updateData.cnic = cleanedCNIC || null;
      }
    }
    
    // Handle optional address field - convert empty string to null
    if (address !== undefined) {
      updateData.address = address === '' ? null : address;
    }

    // Handle SIP extension fields
    if (extension !== undefined) {
      // Validate extension uniqueness if changing
      if (extension && extension !== user.extension) {
        const existingExtension = await User.findOne({
          where: { 
            extension: extension,
            id: { [require('sequelize').Op.ne]: userId }
          }
        });
        if (existingExtension) {
          return NextResponse.json(
            { error: `Extension ${extension} is already assigned to another user` },
            { status: 400 }
          );
        }
      }
      updateData.extension = extension === '' ? null : extension;
    }

    if (sip_username !== undefined) {
      // Validate sip_username uniqueness if changing
      if (sip_username && sip_username !== user.sipUsername) {
        const existingSipUsername = await User.findOne({
          where: { 
            sipUsername: sip_username,
            id: { [require('sequelize').Op.ne]: userId }
          }
        });
        if (existingSipUsername) {
          return NextResponse.json(
            { error: `SIP username ${sip_username} is already assigned to another user` },
            { status: 400 }
          );
        }
      }
      updateData.sipUsername = sip_username === '' ? null : sip_username;
    }

    // Encrypt SIP password if provided
    if (sip_password !== undefined && sip_password !== '') {
      const crypto = require('crypto');
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-chars-long!!', 'utf8');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(sip_password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      updateData.sipPassword = iv.toString('hex') + ':' + encrypted;
    } else if (sip_password === '') {
      // Allow clearing password by setting to empty string
      updateData.sipPassword = null;
    }

    if (sip_domain !== undefined) {
      updateData.sipDomain = sip_domain === '' ? null : sip_domain;
    }

    // Auto-set sipUsername to extension if extension is set and sip_username is not provided
    if (updateData.extension && !updateData.sipUsername && !sip_username) {
      updateData.sipUsername = updateData.extension;
    }

    // Auto-set sipDomain if not provided
    if (updateData.extension && !updateData.sipDomain && !sip_domain) {
      updateData.sipDomain = process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN || null;
    }

    try {
      await user.update(updateData);
    } catch (validationError) {
      // Handle validation errors with user-friendly messages
      if (validationError.name === 'SequelizeValidationError') {
        const errors = validationError.errors.map(err => {
          if (err.path === 'phone' && err.validatorKey === 'isNumeric') {
            return 'Phone number must contain only numbers (no spaces, dashes, or special characters)';
          } else if (err.path === 'cnic' && err.validatorKey === 'isNumeric') {
            return 'CNIC format is invalid. Please use only numbers';
          } else if (err.path === 'cnic' && err.validatorKey === 'len') {
            return 'CNIC must be exactly 13 digits';
          } else {
            return `${err.path}: ${err.message}`;
          }
        });
        
        return NextResponse.json({ 
          success: false, 
          message: 'Validation failed', 
          errors: errors 
        }, { status: 400 });
      }
      throw validationError; // Re-throw if not a validation error
    }

    // Handle supervisor relationship for agents
    if (role === 'agent' && superiorId !== undefined) {
      const { SupervisorAgent } = require('../../../../models');
      
      // Remove existing supervisor relationships
      await SupervisorAgent.destroy({
        where: { agentId: userId }
      });
      
      // Add new supervisor relationship if superiorId is provided
      if (superiorId) {
        await SupervisorAgent.create({
          supervisorId: superiorId,
          agentId: userId
        });
      }
    }

    // Return updated user data
    const userData = {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      role_display: getRoleDisplayName(user.role),
      is_active: user.isActive,
      cnic: user.cnic,
      phone: user.phone,
      address: user.address,
      extension: user.extension,
      sip_username: user.sipUsername,
      sip_domain: user.sipDomain,
      call_status: user.callStatus || 'offline',
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return NextResponse.json({
      success: true,
      data: userData,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Delete user (admin only)
export async function DELETE(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = (await params).id;

    // Prevent admin from deleting themselves
    if (parseInt(userId) === authResult.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Soft delete by deactivating user
    await user.update({ isActive: false });

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
