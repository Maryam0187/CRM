import { getCustomerIdsWithPayments } from '../../../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../../../lib/jwtAuth.js';

/**
 * GET /api/customers/[id]/has-payments
 * Returns whether this customer has any payment (card, bank, cheque-mail, cheque-electronic, payment_email) on any sale.
 */
export async function GET(request, { params }) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (Number.isNaN(customerId)) {
      return Response.json({ success: false, hasPayments: false }, { status: 400 });
    }

    const set = await getCustomerIdsWithPayments([customerId]);
    const hasPayments = set.has(customerId);

    return Response.json({ success: true, hasPayments });
  } catch (error) {
    console.error('Get customer has-payments error:', error);
    return Response.json(
      { success: false, hasPayments: false, error: error.message },
      { status: 500 }
    );
  }
}
