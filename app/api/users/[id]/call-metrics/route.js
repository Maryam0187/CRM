import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { CallLog, Sequelize } from '../../../../../models';
import { SupervisorAgentService } from '../../../../../lib/sequelize-db';
import { getUtcBoundsForLocalDateRange, parseTimezoneOffsetMinutes } from '../../../../../lib/dateFilterTimezone';

const { Op } = Sequelize;

/**
 * Aggregated call metrics for a user in an optional date range (UTC day bounds, same as call-logs).
 * GET /api/users/[id]/call-metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function GET(request, { params }) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    const currentUser = authResult.user;
    const userId = parseInt(params.id, 10);

    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (currentUser.role !== 'admin' && currentUser.id !== userId) {
      if (currentUser.role === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(currentUser.id);
        const agentIds = supervisedAgents.map((a) => a.id);
        if (!agentIds.includes(userId)) {
          return NextResponse.json(
            { error: 'You can only view your own or your supervised agents\' call metrics' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'You can only view your own call metrics' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(searchParams.get('tzOffset'));

    const where = { agentId: userId };
    if (startDate && endDate) {
      const bounds = getUtcBoundsForLocalDateRange(startDate, endDate, tzOffsetMinutes);
      where.created_at = {
        [Op.between]: [bounds.startDate, bounds.endDate]
      };
    }

    const [
      totalCalls,
      completedCalls,
      failedCalls,
      busyCalls,
      noAnswerCalls,
      sumRow
    ] = await Promise.all([
      CallLog.count({ where }),
      CallLog.count({ where: { ...where, status: 'completed' } }),
      CallLog.count({ where: { ...where, status: 'failed' } }),
      CallLog.count({ where: { ...where, status: 'busy' } }),
      CallLog.count({ where: { ...where, status: 'no-answer' } }),
      CallLog.findOne({
        where,
        attributes: [[Sequelize.fn('SUM', Sequelize.col('duration')), 'totalDurationSeconds']],
        raw: true
      })
    ]);

    const rawSum = sumRow?.totalDurationSeconds;
    const totalDurationSeconds =
      rawSum === null || rawSum === undefined ? 0 : Math.round(Number(rawSum));

    return NextResponse.json({
      success: true,
      userId,
      startDate: startDate || null,
      endDate: endDate || null,
      metrics: {
        totalCalls,
        completedCalls,
        failedCalls,
        busyCalls,
        noAnswerCalls,
        totalDurationSeconds
      }
    });
  } catch (error) {
    console.error('Get user call metrics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
