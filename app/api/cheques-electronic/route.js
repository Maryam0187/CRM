import { ChequeElectronic, Sale, SalesLog } from '../../../models/index.js';
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
    
    if (!chequeData.saleId || !chequeData.routingNumber || !chequeData.accountNumber || 
        !chequeData.chequeNumber || !chequeData.nameOnCheque || !chequeData.bankName || !chequeData.state) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const cheque = await ChequeElectronic.create(chequeData);
    
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
        note: 'Payment information added via electronic cheque',
        timestamp: new Date()
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


