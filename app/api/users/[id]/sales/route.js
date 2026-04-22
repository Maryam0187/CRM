import { NextResponse } from 'next/server';
import { requireJWTAdmin } from '../../../../../lib/jwtAuth';
import { SalesLog, Sale, Customer, Sequelize } from '../../../../../models';
import { getUtcBoundsForLocalDateRange, parseTimezoneOffsetMinutes } from '../../../../../lib/dateFilterTimezone';

const { Op } = Sequelize;

/**
 * Get user sales logs from sales_logs table (Admin only)
 * GET /api/users/[id]/sales?limit=50&offset=0&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function GET(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(searchParams.get('tzOffset'));

    // Build where clause
    const where = { agentId: userId };
    
    // Add date filter if provided - use timestamp field for sales logs
    if (startDate && endDate) {
      const bounds = getUtcBoundsForLocalDateRange(startDate, endDate, tzOffsetMinutes);
      where['timestamp'] = {
        [Op.between]: [bounds.startDate, bounds.endDate]
      };
    }

    // Get total count
    const totalSalesLogs = await SalesLog.count({ where });

    // Get sales logs with pagination
    const salesLogs = await SalesLog.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          required: false
        },
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'status', 'carrier', 'basicPackage'],
          required: false
        }
      ],
      order: [['timestamp', 'DESC']],
      limit,
      offset
    });

    // Format sales logs data
    const formattedSalesLogs = salesLogs.map(log => ({
      id: log.id,
      action: log.action,
      status: log.status,
      timestamp: log.timestamp,
      note: log.note,
      breakdown: log.breakdown,
      appointmentDatetime: log.appointment_datetime,
      createdAt: log.created_at,
      customer: log.customer ? {
        id: log.customer.id,
        firstName: log.customer.firstName,
        lastName: log.customer.lastName,
        phone: log.customer.phone,
        email: log.customer.email
      } : null,
      sale: log.sale ? {
        id: log.sale.id,
        status: log.sale.status,
        carrier: log.sale.carrier,
        basicPackage: log.sale.basicPackage
      } : null
    }));

    return NextResponse.json({
      success: true,
      userId,
      sales: formattedSalesLogs,
      pagination: {
        total: totalSalesLogs,
        limit,
        offset,
        hasMore: offset + limit < totalSalesLogs
      }
    });

  } catch (error) {
    console.error('Get user sales logs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

