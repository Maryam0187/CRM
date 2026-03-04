import { ChequeElectronic, Sale } from '../../../models/index.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { addPaymentInfoTagToSale } from '../../../lib/sale-payment-tag.js';

export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    
    if (!['agent', 'supervisor', 'admin', 'processor', 'verification'].includes(user.role)) {
      return Response.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    const chequeData = await request.json();
    
    if (!chequeData.saleId || !chequeData.routingNumber || !chequeData.accountNumber || 
        !chequeData.chequeNumber || !chequeData.nameOnCheque || !chequeData.bankName || !chequeData.state) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use customerId from frontend when provided; otherwise fallback to sale lookup
    if (chequeData.customerId == null && chequeData.saleId) {
      const sale = await Sale.findByPk(chequeData.saleId, { attributes: ['customerId'] });
      if (sale?.customerId) chequeData.customerId = sale.customerId;
    }

    chequeData.addedByUserId = user.id;

    const cheque = await ChequeElectronic.create(chequeData);
    if (cheque.saleId) {
      await addPaymentInfoTagToSale(cheque.saleId, user?.id || 1, {
        note: 'Payment information added via electronic cheque'
      });
    }
    
    return Response.json({
      success: true,
      message: 'Electronic cheque details saved successfully',
      data: cheque
    }, { status: 201 });
  } catch (error) {
    console.error('Create electronic cheque error:', error);
    return Response.json(
      { success: false, message: 'Failed to save cheque details', error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    
    let whereClause = {};
    if (saleId) {
      whereClause.saleId = saleId;
    }
    
    const cheques = await ChequeElectronic.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    const processedCheques = cheques.map(cheque => {
      const chequeData = cheque.getDataForRole(user.role);
      return chequeData;
    });
    
    return Response.json({
      success: true,
      data: processedCheques
    });
  } catch (error) {
    console.error('Get electronic cheques error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch cheques', error: error.message },
      { status: 500 }
    );
  }
}


