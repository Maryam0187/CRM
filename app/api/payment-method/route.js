import { NextResponse } from 'next/server';
import { Card, Bank, ChequeElectronic, ChequeMail, PaymentEmail } from '../../../models/index.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';

const MODELS = {
  card: Card,
  bank: Bank,
  cheque_electronic: ChequeElectronic,
  cheque_mail: ChequeMail,
  payment_email: PaymentEmail
};

export async function PATCH(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    if (!['agent', 'supervisor', 'admin', 'processor', 'verification'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { paymentType, paymentId, comments } = body;

    if (!paymentType || !paymentId) {
      return NextResponse.json({ error: 'Missing paymentType or paymentId' }, { status: 400 });
    }
    const Model = MODELS[paymentType];
    if (!Model) {
      return NextResponse.json({ error: 'Invalid paymentType' }, { status: 400 });
    }
    const id = parseInt(paymentId, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid paymentId' }, { status: 400 });
    }

    const record = await Model.findByPk(id);
    if (!record) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    const updates = {};
    if (comments !== undefined) {
      updates.comments = Array.isArray(comments) ? comments : [];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, data: record });
    }

    await record.update(updates);
    const plain = record.get ? record.get({ plain: true }) : record;
    return NextResponse.json({
      success: true,
      data: {
        id: plain.id,
        comments: plain.comments || []
      }
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 });
  }
}
