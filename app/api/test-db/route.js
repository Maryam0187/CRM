import { testConnection, getDashboardStats } from '../../../lib/db';

export async function GET() {
  try {
    // Test database connection
    const isConnected = await testConnection();
    
    if (!isConnected) {
      return Response.json(
        { success: false, message: 'Database connection failed' },
        { status: 500 }
      );
    }

    // Get dashboard stats
    const stats = await getDashboardStats();

    return Response.json({
      success: true,
      message: 'Database connected successfully',
      stats: stats
    });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}
