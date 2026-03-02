import { NextResponse } from 'next/server';
import { requireJWTAdmin } from '../../../../../lib/jwtAuth';
import { CallLog, Customer, Sale, Sequelize } from '../../../../../models';

const { Op } = Sequelize;

/**
 * Get user call logs (Admin only)
 * GET /api/users/[id]/call-logs?limit=50&offset=0&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
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

    const userId = parseInt(params.id);
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

    // Format call logs data
    const formattedCallLogs = callLogs.map(callLog => ({
      id: callLog.id,
      callSid: callLog.callSid,
      direction: callLog.direction,
      fromNumber: callLog.fromNumber,
      toNumber: callLog.toNumber,
      status: callLog.status,
      duration: callLog.duration,
      callPurpose: callLog.callPurpose,
      callNotes: callLog.callNotes,
      recordingUrl: callLog.recordingUrl,
      recordings: callLog.recordings || (callLog.recordingUrl ? [{ recordingSid: callLog.recordingSid, recordingUrl: callLog.recordingUrl, recordingDuration: callLog.recordingDuration, createdAt: (callLog.updatedAt || callLog.updated_at)?.toISOString?.() || new Date().toISOString() }] : []),
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
    }));

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

