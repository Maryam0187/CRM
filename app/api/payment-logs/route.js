import { NextResponse } from 'next/server';
import { PaymentLog, Sale, User } from '../../../models/index.js';
import { SaleService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { SALES_STATUSES } from '../../../lib/salesStatuses.js';

const PAYMENT_TYPES = ['card', 'bank', 'cheque_electronic', 'cheque_mail', 'payment_email'];
const ACTIONS = ['attempt', 'charged', 'declined', 'chargeback'];

export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can view payment logs' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const saleIdParam = searchParams.get('saleId');
    const paymentType = searchParams.get('paymentType');
    const paymentIdParam = searchParams.get('paymentId');

    const where = {};
    if (saleIdParam) {
      const saleId = parseInt(saleIdParam, 10);
      if (Number.isNaN(saleId)) {
        return NextResponse.json({ error: 'Invalid saleId' }, { status: 400 });
      }
      where.saleId = saleId;
    }
    if (paymentType && paymentIdParam) {
      if (!PAYMENT_TYPES.includes(paymentType)) {
        return NextResponse.json({ error: 'Invalid paymentType' }, { status: 400 });
      }
      const paymentId = parseInt(paymentIdParam, 10);
      if (Number.isNaN(paymentId)) {
        return NextResponse.json({ error: 'Invalid paymentId' }, { status: 400 });
      }
      where.paymentType = paymentType;
      where.paymentId = paymentId;
    }
    if (!where.saleId && !where.paymentType) {
      return NextResponse.json({ error: 'Provide saleId or paymentType+paymentId' }, { status: 400 });
    }

    const logs = await PaymentLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
    });

    const data = logs.map((log) => {
      const plain = log.get ? log.get({ plain: true }) : log;
      const user = plain.user;
      return {
        id: plain.id,
        paymentType: plain.paymentType,
        paymentId: plain.paymentId,
        saleId: plain.saleId,
        action: plain.action,
        reason: plain.reason,
        userId: plain.userId,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A' : null,
        metadata: plain.metadata,
        createdAt: plain.created_at
      };
    });

    return NextResponse.json({ success: true, logs: data });
  } catch (error) {
    console.error('Error fetching payment logs:', error);
    return NextResponse.json({ error: 'Failed to fetch payment logs' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    // Only admin can record charged/declined/chargeback (same as sale status)
    const body = await request.json();
    const { saleId, paymentType, paymentId, action, reason, metadata } = body;

    if (!saleId || !paymentType || !paymentId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: saleId, paymentType, paymentId, action' },
        { status: 400 }
      );
    }
    if (!PAYMENT_TYPES.includes(paymentType)) {
      return NextResponse.json({ error: 'Invalid paymentType' }, { status: 400 });
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const saleIdNum = parseInt(saleId, 10);
    const paymentIdNum = parseInt(paymentId, 10);
    if (Number.isNaN(saleIdNum) || Number.isNaN(paymentIdNum)) {
      return NextResponse.json({ error: 'Invalid saleId or paymentId' }, { status: 400 });
    }

    const sale = await SaleService.findById(saleIdNum);
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (['charged', 'declined', 'chargeback'].includes(action) && user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can record charged/declined/chargeback' }, { status: 403 });
    }

    const log = await PaymentLog.create({
      paymentType,
      paymentId: paymentIdNum,
      saleId: saleIdNum,
      action,
      reason: reason || null,
      userId: user.id,
      metadata: metadata || null
    });

    if (action === 'charged') {
      await SaleService.update(saleIdNum, { status: SALES_STATUSES.CHARGED });
    } else if (action === 'declined') {
      await SaleService.update(saleIdNum, { status: SALES_STATUSES.DECLINED });
    } else if (action === 'chargeback') {
      await SaleService.update(saleIdNum, { status: SALES_STATUSES.CHARGEBACK });
    }

    const plain = log.get ? log.get({ plain: true }) : log;
    return NextResponse.json({
      success: true,
      log: {
        id: plain.id,
        paymentType: plain.paymentType,
        paymentId: plain.paymentId,
        saleId: plain.saleId,
        action: plain.action,
        reason: plain.reason,
        userId: plain.userId,
        metadata: plain.metadata,
        createdAt: plain.created_at
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating payment log:', error);
    return NextResponse.json({ error: 'Failed to create payment log' }, { status: 500 });
  }
}
