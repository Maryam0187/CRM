import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { setAiControlAction, getAiControlState } from '../../../../../lib/aiMediaBridge';
import sequelizeDb from '../../../../../lib/sequelize-db';

export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { callSid, action } = body;
    if (!callSid || !action) {
      return NextResponse.json(
        { success: false, message: 'callSid and action are required' },
        { status: 400 }
      );
    }

    let state = getAiControlState(String(callSid));
    if (!state.ownerAgentId) {
      const callLog = await sequelizeDb.CallLog.findOne({
        where: { callSid: String(callSid) },
        attributes: ['agentId']
      });
      if (callLog && parseInt(callLog.agentId, 10) !== parseInt(authResult.user.id, 10)) {
        return NextResponse.json(
          { success: false, message: 'Only call initiator can control AI for this call' },
          { status: 403 }
        );
      }
    }

    const result = setAiControlAction(String(callSid), String(action), authResult.user.id);
    if (!result.ok) {
      const forbidden = String(result.message || '').toLowerCase().includes('only call initiator');
      return NextResponse.json(
        { success: false, message: result.message || 'Invalid control action' },
        { status: forbidden ? 403 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        callSid: String(callSid),
        state: result.state
      }
    });
  } catch (error) {
    console.error('AI control error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to apply AI control action', error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { searchParams } = new URL(request.url);
    const callSid = searchParams.get('callSid');
    if (!callSid) {
      return NextResponse.json({ success: false, message: 'callSid is required' }, { status: 400 });
    }

    state = getAiControlState(callSid);
    return NextResponse.json({
      success: true,
      data: {
        callSid,
        state,
        canControl: !state.ownerAgentId || parseInt(state.ownerAgentId, 10) === parseInt(authResult.user.id, 10)
      }
    });
  } catch (error) {
    console.error('AI control state error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get AI control state', error: error.message },
      { status: 500 }
    );
  }
}

