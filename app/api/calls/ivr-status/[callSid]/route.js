import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../../lib/jwtAuth.js';

/**
 * IVR Status API - Get current status of an IVR call
 * 
 * This endpoint returns the current status of an IVR call by callSid.
 * It only returns IVR calls (calls with callPurpose='ivr_dialer').
 */
export async function GET(request, { params }) {
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
    const { callSid } = params;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    // Find the call log - only IVR calls
    const callLog = await sequelizeDb.CallLog.findOne({
      where: {
        callSid: callSid,
        callPurpose: 'ivr_dialer'
      },
      attributes: [
        'id',
        'callSid',
        'customerCallSid',
        'agentCallSid',
        'conferenceName',
        'agentId',
        'customerId',
        'saleId',
        'direction',
        'fromNumber',
        'toNumber',
        'status',
        'callPurpose',
        'duration',
        'twilioData',
        'createdAt',
        'updatedAt'
      ]
    });

    if (!callLog) {
      return NextResponse.json(
        { success: false, message: 'IVR call not found' },
        { status: 404 }
      );
    }

    // Verify the call belongs to the authenticated user (if agentId is set)
    if (callLog.agentId && callLog.agentId !== user.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized - call does not belong to you' },
        { status: 403 }
      );
    }

    // Build response
    const statusData = {
      callSid: callLog.callSid,
      customerCallSid: callLog.customerCallSid,
      agentCallSid: callLog.agentCallSid,
      conferenceName: callLog.conferenceName,
      agentId: callLog.agentId,
      direction: callLog.direction,
      fromNumber: callLog.fromNumber,
      toNumber: callLog.toNumber,
      status: callLog.status,
      uiStatus: callLog.status, // For IVR, status and uiStatus are the same
      callPurpose: callLog.callPurpose,
      duration: callLog.duration,
      isIvrCall: true,
      createdAt: callLog.createdAt,
      updatedAt: callLog.updatedAt,
      twilioData: callLog.twilioData || {}
    };

    return NextResponse.json({
      success: true,
      data: statusData,
      message: 'IVR call status retrieved successfully'
    });

  } catch (error) {
    console.error('❌ [IVR STATUS] Error getting IVR call status:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to get IVR call status',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
