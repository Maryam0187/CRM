import { DashboardService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
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
