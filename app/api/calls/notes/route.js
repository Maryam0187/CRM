import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';


import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
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

const body = await request.json();
    const { callSid, notes, callPurpose, customerName, city, zipcode } = body;

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

    // Update call log with notes, purpose, and customer info
    const updateData = {};
    
    if (notes !== undefined) {
      updateData.callNotes = notes;
    }
    
    if (callPurpose !== undefined) {
      updateData.callPurpose = callPurpose;
    }
    
    if (customerName !== undefined) {
      updateData.customerName = customerName;
    }
    
    if (city !== undefined) {
      updateData.city = city;
    }
    
    if (zipcode !== undefined) {
      updateData.zipcode = zipcode;
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
    
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

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
