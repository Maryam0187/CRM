import { CustomerService } from '../../../../lib/sequelize-db.js';
import { normalizePhoneForStorage } from '../../../../lib/twilio.js';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { getStatusDisplayName, getStatusBadgeClasses } from '../../../../lib/salesStatuses.js';

/**
 * Check if any customer exists with this number and return last sale info.
 * Used by Dialing page - number only, no firstName required.
 */
export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { number } = await request.json();
    const landlineOrPhone = number?.trim();

    if (!landlineOrPhone) {
      return Response.json(
        { success: false, message: 'Number is required' },
        { status: 400 }
      );
    }

    const normalized = normalizePhoneForStorage(landlineOrPhone) || landlineOrPhone;
    const landlineCustomers = await CustomerService.findAllByLandlineOrPhone(normalized);

    if (landlineCustomers && landlineCustomers.length > 0) {
      // Get the most recent sale across all customers with this number
      let lastSaleOverall = null;
      let customerWithLastSale = null;

      for (const customer of landlineCustomers) {
        const lastSale = customer.sales && customer.sales.length > 0 ? customer.sales[0] : null;
        if (lastSale) {
          const saleDate = new Date(lastSale.created_at).getTime();
          if (!lastSaleOverall || saleDate > new Date(lastSaleOverall.created_at).getTime()) {
            lastSaleOverall = lastSale;
            customerWithLastSale = customer;
          }
        }
      }

      const customersWithSales = landlineCustomers.map((customer) => {
        const lastSale = customer.sales && customer.sales.length > 0 ? customer.sales[0] : null;
        return {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          landline: customer.landline,
          phone: customer.phone,
          lastSale: lastSale
            ? {
                id: lastSale.id,
                status: lastSale.status,
                statusDisplay: getStatusDisplayName(lastSale.status),
                statusBadgeClasses: getStatusBadgeClasses(lastSale.status),
                spoke_to: lastSale.spoke_to,
                notes: lastSale.notes,
                created_at: lastSale.created_at,
                agent: lastSale.agent
                  ? {
                      id: lastSale.agent.id,
                      firstName: lastSale.agent.firstName,
                      lastName: lastSale.agent.lastName,
                    }
                  : null,
              }
            : null,
        };
      });

      return Response.json({
        success: true,
        exists: true,
        customers: customersWithSales,
        customerCount: landlineCustomers.length,
        lastSale: lastSaleOverall
          ? {
              id: lastSaleOverall.id,
              status: lastSaleOverall.status,
              statusDisplay: getStatusDisplayName(lastSaleOverall.status),
              statusBadgeClasses: getStatusBadgeClasses(lastSaleOverall.status),
              spoke_to: lastSaleOverall.spoke_to,
              notes: lastSaleOverall.notes,
              created_at: lastSaleOverall.created_at,
              agent: lastSaleOverall.agent
                ? {
                    id: lastSaleOverall.agent.id,
                    firstName: lastSaleOverall.agent.firstName,
                    lastName: lastSaleOverall.agent.lastName,
                  }
                : null,
              customer: customerWithLastSale
                ? {
                    id: customerWithLastSale.id,
                    firstName: customerWithLastSale.firstName,
                    lastName: customerWithLastSale.lastName,
                  }
                : null,
            }
          : null,
        message: `Found ${landlineCustomers.length} customer(s) with this number.`,
      });
    }

    return Response.json({
      success: true,
      exists: false,
      customers: [],
      lastSale: null,
      message: 'No customer found with this number.',
    });
  } catch (error) {
    console.error('Check by number error:', error);
    return Response.json(
      { success: false, message: 'Failed to check number', error: error.message },
      { status: 500 }
    );
  }
}
