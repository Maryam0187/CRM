import { NextResponse } from 'next/server';
import { SalesLogService } from '../../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let dateRange = null;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate),
        end: new Date(endDate)
      };
    }

    const stats = await SalesLogService.getSalesFlowStats(
      agentId || null,
      dateRange
    );

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching sales flow stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales flow statistics' },
      { status: 500 }
    );
  }
}
