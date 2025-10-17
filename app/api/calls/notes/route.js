import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';

export async function POST(request) {
  try {
    const body = await request.json();
    const { callSid, notes, callPurpose } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    // Find the call log by call SID
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid }
    });

    if (!callLog) {
      return NextResponse.json(
        { success: false, message: 'Call log not found' },
        { status: 404 }
      );
    }

    // Update call log with notes and purpose
    const updateData = {};
    
    if (notes !== undefined) {
      updateData.callNotes = notes;
    }
    
    if (callPurpose !== undefined) {
      updateData.callPurpose = callPurpose;
    }

    await callLog.update(updateData);

    return NextResponse.json({
      success: true,
      message: 'Call notes updated successfully',
      data: {
        callSid: callLog.callSid,
        notes: callLog.callNotes,
        purpose: callLog.callPurpose
      }
    });

  } catch (error) {
    console.error('Error updating call notes:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to update call notes',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const callSid = searchParams.get('callSid');

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
          attributes: ['id', 'firstName', 'lastName', 'phone', 'company']
        },
        {
          model: sequelizeDb.User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
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
      data: callLog
    });

  } catch (error) {
    console.error('Error fetching call notes:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch call notes',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
