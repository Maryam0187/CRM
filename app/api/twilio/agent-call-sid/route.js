import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { agentCallSidMap, customerCallSidMap } from '../../../../lib/twilio/conferenceState.js';

// Frontend reports the agent (browser) leg CallSid once it becomes available on the Voice SDK Call object.
// This lets the backend reliably identify the agent participant in conference callbacks even when `From` is missing.
export async function POST(request) {
  const auth = await requireJWTAuth(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const conferenceName = body?.conferenceName ? String(body.conferenceName).trim() : '';
  const agentCallSid = body?.agentCallSid ? String(body.agentCallSid).trim() : '';

  if (!conferenceName || !agentCallSid) {
    return NextResponse.json(
      { success: false, error: 'conferenceName and agentCallSid are required' },
      { status: 400 }
    );
  }

  // Twilio CallSids are `CA...`
  if (!agentCallSid.startsWith('CA')) {
    return NextResponse.json({ success: false, error: 'Invalid agentCallSid' }, { status: 400 });
  }

  const previousAgentSid = agentCallSidMap.get(conferenceName);
  const trackedCustomerSid = customerCallSidMap.get(conferenceName);
  
  agentCallSidMap.set(conferenceName, agentCallSid);

  console.log('🔑 [AGENT SID STORED] Agent CallSid tracked on backend:', {
    conferenceName,
    agentCallSid,
    previousAgentSid: previousAgentSid || 'NONE',
    trackedCustomerSid: trackedCustomerSid || 'NOT_YET_TRACKED',
    agentUserId: auth.user?.id
  });

  return NextResponse.json({ success: true });
}


