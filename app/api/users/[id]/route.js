import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireAdmin } from '../../../../lib/serverAuth';
import { getRoleDisplayName } from '../../../../lib/roleUtils';

// GET /api/users/[id] - Get specific user (admin only)
export async function GET(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = (await params).id;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'cnic', 'phone', 'address', 'created_at', 'updated_at'],
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
    const authResult = await requireAdmin(request);
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
      superiorId
    } = await request.json();

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['admin', 'supervisor', 'agent', 'processor', 'verification'];
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
    if (role) updateData.role = role;
    if (typeof is_active === 'boolean') updateData.isActive = is_active;
    if (phone !== undefined) updateData.phone = phone;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (address !== undefined) updateData.address = address;

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
    const authResult = await requireAdmin(request);
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
