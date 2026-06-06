import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { CustomerService } from '../../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { normalizePhoneForStorage } from '../../../../../lib/twilio';

const PLACEHOLDER_NAMES = new Set(['Quick Dial', 'Call Log', '—', '']);

function shouldSetCustomerName(existingName) {
  if (!existingName || PLACEHOLDER_NAMES.has(String(existingName).trim())) return true;
  return false;
}

export async function POST(request, { params }) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'Invalid customer id' },
        { status: 400 }
      );
    }

    const customer = await CustomerService.findById(customerId);
    if (!customer) {
      return NextResponse.json(
        { success: false, message: 'Customer not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { phoneNumber, callSid } = body;

    const normalized = normalizePhoneForStorage(phoneNumber || customer.landline || customer.phone);
    const last10 = normalized ? normalized.slice(-10) : null;

    if (!last10 && !callSid) {
      return NextResponse.json(
        { success: false, message: 'phoneNumber or callSid is required' },
        { status: 400 }
      );
    }

    const displayName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    const linkedIds = new Set();

    const agentScope =
      user.role === 'admin' ? null : { agentId: user.id };

    if (last10) {
      const phoneMatch = { [Op.like]: `%${last10}%` };
      const where = {
        customerId: null,
        [Op.or]: [
          { toNumber: phoneMatch },
          { direction: 'inbound', fromNumber: phoneMatch }
        ],
        ...(agentScope || {})
      };

      const logs = await sequelizeDb.CallLog.findAll({ where });
      for (const log of logs) {
        const updates = { customerId };
        if (displayName && shouldSetCustomerName(log.customerName)) {
          updates.customerName = displayName;
        }
        await log.update(updates);
        linkedIds.add(log.id);
      }
    }

    if (callSid) {
      const specificWhere = {
        callSid: String(callSid),
        customerId: null,
        ...(agentScope || {})
      };
      const specific = await sequelizeDb.CallLog.findOne({ where: specificWhere });
      if (specific && !linkedIds.has(specific.id)) {
        const updates = { customerId };
        if (displayName && shouldSetCustomerName(specific.customerName)) {
          updates.customerName = displayName;
        }
        await specific.update(updates);
        linkedIds.add(specific.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Linked ${linkedIds.size} call log(s) to customer`,
      data: {
        customerId,
        linkedCount: linkedIds.size
      }
    });
  } catch (error) {
    console.error('Link call logs to customer error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to link call logs', error: error.message },
      { status: 500 }
    );
  }
}
