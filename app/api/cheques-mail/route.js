import { ChequeMail, Sale, SalesLog } from '../../../models/index.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';

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
    
    if (!chequeData.saleId || !chequeData.chequeNumber || !chequeData.nameOnCheque || !chequeData.bankName) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const cheque = await ChequeMail.create(chequeData);
    
    if (cheque.saleId) {
      await Sale.update(
        { status: 'payment_info' },
        { where: { id: cheque.saleId } }
      );
      
      const sale = await Sale.findByPk(cheque.saleId);
      
      await SalesLog.create({
        saleId: cheque.saleId,
        customerId: sale.customerId,
        agentId: user?.id || 1,
        action: 'payment_info_added',
        status: 'payment_info',
        note: 'Payment information added via cheque to mail',
        timestamp: new Date()
      });
    }
    
    return Response.json({
      success: true,
      message: 'Cheque to mail details saved successfully',
      data: cheque
    }, { status: 201 });
  } catch (error) {
    console.error('Create cheque mail error:', error);
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
    
    const cheques = await ChequeMail.findAll({
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
    console.error('Get cheques mail error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch cheques', error: error.message },
      { status: 500 }
    );
  }
}


