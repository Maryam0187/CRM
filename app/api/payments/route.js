import { NextResponse } from 'next/server';
import { SaleService, SupervisorAgentService } from '../../../lib/sequelize-db.js';
import { requireAuth } from '../../../lib/serverAuth.js';

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
    const showFullDetails = searchParams.get('showFullDetails') === 'true';

    let sales = [];

    // Role-based access control with appropriate field selection
    if (userRole === 'admin' && showFullDetails) {
      // Admin with full details can see all sales with complete payment details
      sales = await SaleService.findAll();
    } else {
      // All other users get sales with limited payment information
      sales = await SaleService.findAllWithLimitedPaymentInfo();
    }

    // Apply role-based filtering
    if (userRole === 'supervisor') {
      // Supervisor can see their agents' sales
      const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
      const agentIds = supervisedAgents.map(agent => agent.id);
      
      if (agentIds.length === 0) {
        sales = [];
      } else {
        sales = sales.filter(sale => agentIds.includes(sale.agentId));
      }
    } else if (userRole === 'agent') {
      // Agent can only see their own sales
      sales = sales.filter(sale => sale.agentId === userId);
    } else if (userRole !== 'admin' && userRole !== 'processor' && userRole !== 'verification') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Filter by specific sale ID if provided
    if (saleId) {
      sales = sales.filter(sale => sale.id === parseInt(saleId));
    }

    // Helper function to mask card number (show last 4 digits)
    const maskCardNumber = (cardNumber) => {
      if (!cardNumber) return null;
      const cleaned = cardNumber.replace(/\s/g, '');
      if (cleaned.length < 4) return '****';
      return '**** **** **** ' + cleaned.slice(-4);
    };

    // Helper function to determine if user can see full details
    const canSeeFullDetails = () => {
      return userRole === 'admin' && showFullDetails;
    };

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
        cards: (sale.cards || []).map(card => ({
          id: card.id,
          cardType: card.cardType,
          provider: card.provider,
          customerName: card.customerName,
          cardNumber: canSeeFullDetails() ? card.cardNumber : maskCardNumber(card.cardNumber),
          expiryDate: card.expiryDate,
          status: card.status,
          created_at: card.created_at
        })),
        banks: (sale.banks || []).map(bank => ({
          id: bank.id,
          bankName: bank.bankName,
          accountHolder: bank.accountHolder,
          status: bank.status,
          created_at: bank.created_at
        }))
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
