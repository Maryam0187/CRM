import { DashboardService } from '../../../lib/sequelize-db.js';
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

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    
    const stats = await DashboardService.getStats(agentId ? parseInt(agentId) : null);
    
    return Response.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch dashboard stats', error: error.message },
      { status: 500 }
    );
  }
}
