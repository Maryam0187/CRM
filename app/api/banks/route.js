import { Bank, Sale } from '../../../models/index.js';
import { validateBankForm, cleanBankData } from '../../../lib/validation.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { addPaymentInfoTagToSale } from '../../../lib/sale-payment-tag.js';
export async function POST(request) {
  try {
    
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const bankData = await request.json();
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

    // Use customerId from frontend when provided; otherwise fallback to sale lookup
    if (cleanedBankData.customerId == null && bankData.saleId) {
      const sale = await Sale.findByPk(bankData.saleId, { attributes: ['customerId'] });
      if (sale?.customerId) cleanedBankData.customerId = sale.customerId;
    }

    cleanedBankData.addedByUserId = user.id;

    const bank = await Bank.create(cleanedBankData);
    if (bank.saleId) {
      await addPaymentInfoTagToSale(bank.saleId, user?.id || 1, {
        note: 'Payment information added via bank',
        bankId: bank.id
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
    
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

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
