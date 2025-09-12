import { NextResponse } from 'next/server';
import { User } from '../../../models';

export async function GET() {
  try {
    // Test database connection by fetching users
    const users = await User.findAll({
      attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'is_active'],
      limit: 5
    });

    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      users: users,
      count: users.length
    });

  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Database connection failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
