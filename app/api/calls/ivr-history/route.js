import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { Op } from 'sequelize';

/**
 * IVR Call History API - Get IVR call logs for the authenticated user
 * 
 * This endpoint returns a list of IVR calls (calls with callPurpose='ivr_dialer')
 * for the authenticated user. Supports pagination and filtering.
 */
export async function GET(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const { searchParams } = new URL(request.url);
    
    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;
    
    // Filter parameters
    const status = searchParams.get('status'); // Filter by status
    const startDate = searchParams.get('startDate'); // Filter by start date
    const endDate = searchParams.get('endDate'); // Filter by end date
    const phoneNumber = searchParams.get('phoneNumber'); // Filter by phone number
    
    // Build where clause
    const where = {
      agentId: user.id,
      callPurpose: 'ivr_dialer'
    };
    
    if (status) {
      where.status = status;
    }
    
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) {
        where.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.created_at[Op.lte] = new Date(endDate);
      }
    }
    
    if (phoneNumber) {
      where[Op.or] = [
        { fromNumber: { [Op.like]: `%${phoneNumber}%` } },
        { toNumber: { [Op.like]: `%${phoneNumber}%` } }
      ];
    }
    
    // Get total count for pagination
    const totalCount = await sequelizeDb.CallLog.count({ where });
    
    // Get call logs
    // Don't specify attributes - let Sequelize return all columns (including timestamps)
    const callLogs = await sequelizeDb.CallLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
    
    // Format response data
    // Use toJSON() to ensure we get the properly mapped values (created_at -> createdAt)
    const calls = callLogs.map(callLog => {
      const callData = callLog.toJSON ? callLog.toJSON() : callLog;
      return {
        id: callData.id,
        callSid: callData.callSid,
        customerCallSid: callData.customerCallSid,
        agentCallSid: callData.agentCallSid,
        conferenceName: callData.conferenceName,
        agentId: callData.agentId,
        direction: callData.direction,
        fromNumber: callData.fromNumber,
        toNumber: callData.toNumber,
        status: callData.status,
        uiStatus: callData.status, // For IVR, status and uiStatus are the same
        callPurpose: callData.callPurpose,
        duration: callData.duration,
        isIvrCall: true,
        createdAt: callData.createdAt || callData.created_at,
        updatedAt: callData.updatedAt || callData.updated_at,
        twilioData: callData.twilioData || {}
      };
    });
    
    return NextResponse.json({
      success: true,
      data: {
        calls,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      },
      message: 'IVR call history retrieved successfully'
    });

  } catch (error) {
    console.error('❌ [IVR HISTORY] Error getting IVR call history:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get IVR call history',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
