import { Bank, Sale, SalesLog } from '../../../models/index.js';
import { 
  validateBankForm, 
  cleanBankData 
} from '../../../lib/validation.js';
import { requireAuth } from '../../../lib/serverAuth.js';

export async function POST(request) {
  try {
    const bankData = await request.json();
    
    // Get user info from authentication (like in cards)
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    
    // Allow agents, supervisors, admins, processors, and verification users to create bank accounts
    if (!['agent', 'supervisor', 'admin', 'processor', 'verification'].includes(user.role)) {
      return Response.json(
        { success: false, message: 'Insufficient permissions to create bank accounts' },
        { status: 403 }
      );
    }
    
    // Validate required fields
    if (!bankData.saleId || !bankData.bankName || !bankData.accountHolder || 
        !bankData.accountNumber || !bankData.routingNumber || !bankData.checkNumber || 
        !bankData.driverLicense || !bankData.nameOnLicense || !bankData.stateId) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate all fields using shared validation
    const errors = validateBankForm(bankData);

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return Response.json(
        { success: false, message: 'Validation failed', errors },
        { status: 400 }
      );
    }

    // Clean bank data using shared function
    const cleanedBankData = cleanBankData(bankData);

    const bank = await Bank.create(cleanedBankData);
    
    // Update sale status to payment_info when bank is created
    if (bank.saleId) {
      await Sale.update(
        { status: 'payment_info' },
        { where: { id: bank.saleId } }
      );
      
      // Get the sale to retrieve customerId
      const sale = await Sale.findByPk(bank.saleId);
      
      // Log the status change in sales logs
      await SalesLog.create({
        saleId: bank.saleId,
        customerId: sale.customerId,
        agentId: user?.id || 1, // Use user ID from request or default to 1
        action: 'payment_info_added',
        status: 'payment_info',
        note: 'Payment information added via bank',
        bankId: bank.id,
        timestamp: new Date()
      });
    }
    
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
