import { PaymentEmail, Sale, SalesLog } from '../../../models/index.js';
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
    
    const emailData = await request.json();
    
    if (!emailData.saleId || !emailData.emailAddress) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const paymentEmail = await PaymentEmail.create(emailData);
    
    if (paymentEmail.saleId) {
      await Sale.update(
        { status: 'payment_info' },
        { where: { id: paymentEmail.saleId } }
      );
      
      const sale = await Sale.findByPk(paymentEmail.saleId);
      
      await SalesLog.create({
        saleId: paymentEmail.saleId,
        customerId: sale.customerId,
        agentId: user?.id || 1,
        action: 'payment_info_added',
        status: 'payment_info',
        note: 'Payment information added via email',
        timestamp: new Date()
      });
    }
    
    return Response.json({
      success: true,
      message: 'Payment email saved successfully',
      data: paymentEmail
    }, { status: 201 });
  } catch (error) {
    console.error('Create payment email error:', error);
    return Response.json(
      { success: false, message: 'Failed to save email details', error: error.message },
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
    
    const paymentEmails = await PaymentEmail.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    return Response.json({
      success: true,
      data: paymentEmails
    });
  } catch (error) {
    console.error('Get payment emails error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch payment emails', error: error.message },
      { status: 500 }
    );
  }
}


