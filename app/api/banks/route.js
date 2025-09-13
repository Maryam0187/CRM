import { Bank } from '../../../models/index.js';

export async function POST(request) {
  try {
    const bankData = await request.json();
    
    // Validate required fields
    if (!bankData.saleId || !bankData.bankName || !bankData.accountHolder || 
        !bankData.accountNumber || !bankData.routingNumber || !bankData.checkNumber || 
        !bankData.driverLicense || !bankData.nameOnLicense || !bankData.stateId) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const bank = await Bank.create(bankData);
    
    return Response.json({
      success: true,
      message: 'Bank details saved successfully',
      data: bank
    }, { status: 201 });
  } catch (error) {
    console.error('Create bank error:', error);
    return Response.json(
      { success: false, message: 'Failed to save bank details', error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    
    let whereClause = {};
    if (saleId) {
      whereClause.saleId = saleId;
    }
    
    const banks = await Bank.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    return Response.json({
      success: true,
      data: banks
    });
  } catch (error) {
    console.error('Get banks error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch banks', error: error.message },
      { status: 500 }
    );
  }
}
