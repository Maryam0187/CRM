import { NextResponse } from 'next/server';
import { SalesLogService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const agentId = searchParams.get('agentId');
    const action = searchParams.get('action');
    const saleId = searchParams.get('saleId');

    let result;

    if (saleId) {
      result = await SalesLogService.findBySaleId(saleId, { page, limit });
    } else if (agentId) {
      result = await SalesLogService.findByAgentId(agentId, { page, limit });
    } else if (action) {
      result = await SalesLogService.findByAction(action, { page, limit });
    } else {
      result = await SalesLogService.getRecentActions(limit);
    }

    return NextResponse.json({
      success: true,
      data: result.data || result,
      pagination: result.pagination || null
    });

  } catch (error) {
    console.error('Error fetching sales logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales logs' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    const {
      saleId,
      customerId,
      agentId,
      bankId,
      cardId,
      action,
      status,
      currentSaleData,
      previousSaleData,
      breakdown,
      note,
      appointmentDate,
      appointmentTime
    } = body;

    // Validate required fields
    if (!saleId || !customerId || !action || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: saleId, customerId, action, status' },
        { status: 400 }
      );
    }

    const logData = {
      saleId,
      agentId: agentId || null,
      customerId,
      bankId: bankId || null,
      cardId: cardId || null,
      action,
      status,
      currentSaleData: currentSaleData || null,
      previousSaleData: previousSaleData || null,
      breakdown: breakdown || null,
      note: note || null,
      appointmentDate: appointmentDate || null,
      appointmentTime: appointmentTime || null,
      timestamp: new Date()
    };

    const salesLog = await SalesLogService.createLog(logData);

    return NextResponse.json({
      success: true,
      data: salesLog,
      message: 'Sales log created successfully'
    });

  } catch (error) {
    console.error('Error creating sales log:', error);
    return NextResponse.json(
      { error: 'Failed to create sales log' },
      { status: 500 }
    );
  }
}
