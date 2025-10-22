import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';

export async function GET(request, { params }) {
  try {
    const { callSid } = params;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    // Find the call log by call SID
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid },
      include: [
        {
          model: sequelizeDb.Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone']
        },
        {
          model: sequelizeDb.User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: sequelizeDb.Sale,
          as: 'sale',
          attributes: ['id', 'status']
        }
      ]
    });

    if (!callLog) {
      return NextResponse.json(
        { success: false, message: 'Call log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      callLog: {
        id: callLog.id,
        callSid: callLog.callSid,
        status: callLog.status,
        duration: callLog.duration,
        direction: callLog.direction,
        fromNumber: callLog.fromNumber,
        toNumber: callLog.toNumber,
        callPurpose: callLog.callPurpose,
        createdAt: callLog.createdAt,
        updatedAt: callLog.updatedAt,
        customer: callLog.customer,
        agent: callLog.agent,
        sale: callLog.sale,
        twilioData: callLog.twilioData
      }
    });

  } catch (error) {
    console.error('Error fetching call status:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch call status',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
