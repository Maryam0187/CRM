import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { CallLog, Customer, Sale, Sequelize } from '../../../../../models';
import { SupervisorAgentService } from '../../../../../lib/sequelize-db';

const { Op } = Sequelize;

/**
 * Get user call logs.
 * Admin: any user's call logs. Supervisor: supervised agents' call logs. Agent: only their own.
 * GET /api/users/[id]/call-logs?limit=50&offset=0&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
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
    const userId = parseInt(params.id);

    // Admin can view any user's call logs; agent only their own; supervisor only supervised agents'
    if (currentUser.role !== 'admin' && currentUser.id !== userId) {
      if (currentUser.role === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(currentUser.id);
        const agentIds = supervisedAgents.map((a) => a.id);
        if (!agentIds.includes(userId)) {
          return NextResponse.json(
            { error: 'You can only view your own or your supervised agents\' call logs' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'You can only view your own call logs' },
          { status: 403 }
        );
      }
    }
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where = { agentId: userId };
    
    // Add date filter if provided
    if (startDate && endDate) {
      where['created_at'] = {
        [Op.between]: [
          new Date(startDate + 'T00:00:00.000Z'),
          new Date(endDate + 'T23:59:59.999Z')
        ]
      };
    }

    // Get total count
    const totalCallLogs = await CallLog.count({ where });

    // Get call logs with pagination
    const callLogs = await CallLog.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          required: false
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    // Format call logs: include recording metadata; for non-admin omit raw Twilio URLs (use proxy in UI)
    const isAdmin = currentUser.role === 'admin';
    const formattedCallLogs = callLogs.map(callLog => {
      const rawRecordings = callLog.recordings || (callLog.recordingUrl ? [{ recordingSid: callLog.recordingSid, recordingUrl: callLog.recordingUrl, recordingDuration: callLog.recordingDuration, createdAt: (callLog.updatedAt || callLog.updated_at)?.toISOString?.() || new Date().toISOString() }] : []);
      const recordings = isAdmin
        ? rawRecordings
        : rawRecordings.map((r) => ({ recordingSid: r.recordingSid, recordingDuration: r.recordingDuration, createdAt: r.createdAt }));
      return {
        id: callLog.id,
        callSid: callLog.callSid,
        direction: callLog.direction,
        fromNumber: callLog.fromNumber,
        toNumber: callLog.toNumber,
        status: callLog.status,
        duration: callLog.duration,
        callPurpose: callLog.callPurpose,
        callNotes: callLog.callNotes,
        recordingUrl: isAdmin ? callLog.recordingUrl : undefined,
        recordings,
        transcriptionText: callLog.transcriptionText,
        createdAt: callLog.created_at,
        updatedAt: callLog.updated_at,
        customer: callLog.customer ? {
          id: callLog.customer.id,
          firstName: callLog.customer.firstName,
          lastName: callLog.customer.lastName,
          phone: callLog.customer.phone,
          email: callLog.customer.email
        } : null,
        sale: callLog.sale ? {
          id: callLog.sale.id,
          status: callLog.sale.status,
          customerName: callLog.sale.customerName
        } : null
      };
    });

    return NextResponse.json({
      success: true,
      userId,
      callLogs: formattedCallLogs,
      pagination: {
        total: totalCallLogs,
        limit,
        offset,
        hasMore: offset + limit < totalCallLogs
      }
    });

  } catch (error) {
    console.error('Get user call logs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

