import { NextResponse } from 'next/server';
import { User } from '../../../../models';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await User.findOne({
      where: { email: email.toLowerCase() }
    });

    const userDataValues = user?.dataValues ? user.dataValues : user;
  
    if (!userDataValues) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!userDataValues.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact your manager.' },
        { status: 401 }
      );
    }

    // For now, we'll do a simple password comparison
    // In production, you should use bcrypt or similar for password hashing
    if (userDataValues.password !== password) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Return user data (excluding password)
    const userData = {
      id: userDataValues.id,
      email: userDataValues.email,
      first_name: userDataValues.firstName,
      last_name: userDataValues.lastName,
      role: userDataValues.role,
      is_active: userDataValues.isActive,
      created_at: userDataValues.created_at
    };

    return NextResponse.json({
      success: true,
      user: userData,
      message: 'Sign in successful'
    });

  } catch (error) {
    console.error('Sign in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
