import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';

// Get SIP status for agents
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
    const agentId = searchParams.get('agentId');

    // If specific agentId requested, return that agent's status
    if (agentId) {
      const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
        attributes: [
          'id', 
          'firstName', 
          'lastName', 
          'extension', 
          'sipUsername', 
          'sipDomain', 
          'callStatus',
          'lastCallTime',
          'totalCalls',
          'totalCallTime'
        ]
      });

      if (!agent) {
        return NextResponse.json(
          { error: 'Agent not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          agentId: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          extension: agent.extension,
          sipUsername: agent.sipUsername,
          sipDomain: agent.sipDomain,
          callStatus: agent.callStatus || 'offline',
          lastCallTime: agent.lastCallTime,
          totalCalls: agent.totalCalls || 0,
          totalCallTime: agent.totalCallTime || 0
        }
      });
    }

    // If no agentId, return all agents with SIP status
    // Only admins/supervisors can see all agents
    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json(
        { error: 'Unauthorized - only admins and supervisors can view all agents' },
        { status: 403 }
      );
    }

    const agents = await sequelizeDb.User.findAll({
      where: {
        extension: { [sequelizeDb.Sequelize.Op.ne]: null }
      },
      attributes: [
        'id', 
        'firstName', 
        'lastName', 
        'extension', 
        'sipUsername', 
        'sipDomain', 
        'callStatus',
        'lastCallTime',
        'totalCalls',
        'totalCallTime'
      ],
      order: [['extension', 'ASC']]
    });

    // Get summary statistics
    const available = agents.filter(a => a.callStatus === 'available').length;
    const busy = agents.filter(a => a.callStatus === 'busy').length;
    const away = agents.filter(a => a.callStatus === 'away').length;
    const offline = agents.filter(a => a.callStatus === 'offline' || !a.callStatus).length;

    return NextResponse.json({
      success: true,
      data: {
        agents: agents.map(agent => ({
          agentId: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          extension: agent.extension,
          sipUsername: agent.sipUsername,
          sipDomain: agent.sipDomain,
          callStatus: agent.callStatus || 'offline',
          lastCallTime: agent.lastCallTime,
          totalCalls: agent.totalCalls || 0,
          totalCallTime: agent.totalCallTime || 0
        })),
        summary: {
          total: agents.length,
          available,
          busy,
          away,
          offline
        }
      }
    });

  } catch (error) {
    console.error('Error fetching SIP status:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch SIP status',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// Update agent SIP status
export async function POST(request) {
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
    const body = await request.json();
    const { agentId, callStatus } = body;

    // Agent can only update their own status, unless admin/supervisor
    const targetAgentId = agentId || user.id;
    if (targetAgentId !== user.id && user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json(
        { error: 'Unauthorized - can only update your own status' },
        { status: 403 }
      );
    }

    // Validate call status
    const validStatuses = ['available', 'busy', 'away', 'offline'];
    if (callStatus && !validStatuses.includes(callStatus)) {
      return NextResponse.json(
        { error: `Invalid call status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const agent = await sequelizeDb.User.findByPk(parseInt(targetAgentId));
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Update status
    const updateData = {};
    if (callStatus) {
      updateData.callStatus = callStatus;
    }

    await agent.update(updateData);

    return NextResponse.json({
      success: true,
      data: {
        agentId: agent.id,
        callStatus: agent.callStatus,
        message: 'Status updated successfully'
      }
    });

  } catch (error) {
    console.error('Error updating SIP status:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to update SIP status',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

