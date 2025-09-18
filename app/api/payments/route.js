import { NextResponse } from 'next/server';
import { Sale, Card, Bank, Customer, User } from '../../../models/index.js';
import { SaleService, SupervisorAgentService } from '../../../lib/sequelize-db.js';
import { requireAuth } from '../../../lib/serverAuth.js';
import { getCardExpirationStatus, formatDisplayDate } from '../../../lib/validation.js';

export async function GET(request) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const userRole = user.role;
    const userId = user.id;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    const requestedFullDetails = searchParams.get('showFullDetails') === 'true';
    
    // Only admins can request full details
    const showFullDetails = userRole === 'admin' && requestedFullDetails;

    let sales = [];

    if (saleId) {
      // EFFICIENT: Query only the specific sale when saleId is provided
      const sale = await Sale.findByPk(parseInt(saleId), {
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
          },
          {
            model: User,
            as: 'agent',
            attributes: ['id', 'firstName', 'lastName', 'email']
          },
          {
            model: Card,
            as: 'cards'
          },
          {
            model: Bank,
            as: 'banks'
          }
        ]
      });

      if (!sale) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
      }

      // Check if user has permission to view this specific sale
      if (userRole === 'agent' && sale.agentId !== userId) {
        return NextResponse.json({ error: 'Unauthorized to view this sale' }, { status: 403 });
      }
      if (userRole === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const agentIds = supervisedAgents.map(agent => agent.id);
        if (!agentIds.includes(sale.agentId)) {
          return NextResponse.json({ error: 'Unauthorized to view this sale' }, { status: 403 });
        }
      }

      sales = [sale];
    } else {
      // When no saleId provided, get all sales (for dashboard/list views)
      if (userRole === 'admin' && showFullDetails) {
        sales = await SaleService.findAll();
      } else {
        sales = await SaleService.findAllWithLimitedPaymentInfo();
      }

      // Apply role-based filtering for all sales
      if (userRole === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const agentIds = supervisedAgents.map(agent => agent.id);
        sales = agentIds.length > 0 ? sales.filter(sale => agentIds.includes(sale.agentId)) : [];
      } else if (userRole === 'agent') {
        sales = sales.filter(sale => sale.agentId === userId);
      } else if (userRole !== 'admin' && userRole !== 'processor' && userRole !== 'verification') {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Note: Card masking is now handled by the Card model's getDataForRole method

    // Transform sales data to include payment information
    const paymentsData = sales.map(sale => {
      const paymentInfo = {
        saleId: sale.id,
        customer: {
          id: sale.customer?.id,
          name: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : 'N/A',
          email: sale.customer?.email || 'N/A',
          phone: sale.customer?.phone || sale.customer?.landline || 'N/A'
        },
        agent: {
          id: sale.agent?.id,
          name: sale.agent ? `${sale.agent.firstName} ${sale.agent.lastName}` : 'N/A'
        },
        saleInfo: {
          status: sale.status,
          createdAt: sale.created_at,
          regularBill: sale.regularBill,
          promotionalBill: sale.promotionalBill,
          lastPayment: sale.lastPayment,
          lastPaymentDate: sale.lastPaymentDate,
          balance: sale.balance
        },
        cards: (sale.cards || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Newest first
          .map(card => {
          // Determine what level of detail to show
          const isAdminWithFullDetails = userRole === 'admin' && showFullDetails;
          
          // Get the appropriate role for card data
          let cardRole;
          if (isAdminWithFullDetails) {
            cardRole = 'admin'; // Show full details
          } else {
            cardRole = 'agent'; // Show masked details (last 4 digits, hidden CVV)
          }
          
          // Use the card's getDataForRole method for proper decryption and masking
          const roleBasedData = card.getDataForRole ? card.getDataForRole(cardRole) : card;
          
          // Add expiration status and formatted dates (but keep masking)
          const expirationStatus = getCardExpirationStatus(roleBasedData.expiryDate);
          
          return {
            id: roleBasedData.id,
            cardType: roleBasedData.cardType,
            provider: roleBasedData.provider,
            customerName: roleBasedData.customerName,
            cardNumber: roleBasedData.cardNumber,
            expiryDate: roleBasedData.expiryDate,
            cvv: isAdminWithFullDetails ? roleBasedData.cvv : '***', // Show *** for non-admin, full CVV for admin with full details
            status: roleBasedData.status,
            created_at: roleBasedData.created_at,
            expirationStatus: expirationStatus,
            isExpired: expirationStatus.status === 'expired',
            isExpiringSoon: expirationStatus.status === 'expiring_soon',
            createdDate: formatDisplayDate(roleBasedData.created_at),
            updatedDate: formatDisplayDate(roleBasedData.updated_at)
          };
        }),
        banks: (sale.banks || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Newest first
          .map(bank => {
          // Determine what level of detail to show (same logic as cards)
          const isAdminWithFullDetails = userRole === 'admin' && showFullDetails;
          
          // Get the appropriate role for bank data
          let bankRole;
          if (isAdminWithFullDetails) {
            bankRole = 'admin'; // Show full details
          } else {
            bankRole = 'agent'; // Show masked details
          }
          
          const bankData = bank.getDataForRole ? bank.getDataForRole(bankRole) : bank;
          
          return {
            id: bankData.id,
            bankName: bankData.bankName,
            accountHolder: bankData.accountHolder,
            accountNumber: bankData.accountNumber,
            routingNumber: bankData.routingNumber,
            checkNumber: bankData.checkNumber,
            driverLicense: bankData.driverLicense,
            nameOnLicense: bankData.nameOnLicense,
            stateId: bankData.stateId,
            status: bankData.status,
            created_at: bankData.created_at,
            createdDate: formatDisplayDate(bankData.created_at),
            updatedDate: formatDisplayDate(bankData.updated_at)
          };
        })
      };

      return paymentInfo;
    });

    return NextResponse.json({ 
      success: true, 
      payments: paymentsData,
      userRole 
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}
