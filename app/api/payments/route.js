import { NextResponse } from 'next/server';
import { Sale, Card, Bank, ChequeElectronic, ChequeMail, PaymentEmail, Customer, User } from '../../../models/index.js';
import { SaleService, SupervisorAgentService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { getCardExpirationStatus, formatDisplayDate } from '../../../lib/validation.js';

export async function GET(request) {
  try {
    // Verify JWT authentication
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const userRole = user.role;
    const userId = user.id;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    const customerIdParam = searchParams.get('customerId');
    // showAllPayments no longer used: when customerId present we always return all customer sales
    const requestedFullDetails = searchParams.get('showFullDetails') === 'true';
    
    // Only admins can request full details
    const showFullDetails = userRole === 'admin' && requestedFullDetails;

    /** With saleId + passing auth, return decrypted card/bank/cheque values for sale document download. */
    const exportDocument = searchParams.get('exportDocument') === 'true';
    let allowFullSensitiveForExport = false;

    // No nested User include on payment models (would cause duplicate alias). We batch-load addedBy users below.
    const includePaymentModels = [
      { model: Customer, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline'] },
      { model: User, as: 'agent', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: Card, as: 'cards' },
      { model: Bank, as: 'banks' },
      { model: ChequeElectronic, as: 'chequesElectronic' },
      { model: ChequeMail, as: 'chequesMail' },
      { model: PaymentEmail, as: 'paymentEmails' }
    ];

    let sales = [];
    const customerIdNum = customerIdParam ? parseInt(customerIdParam, 10) : null;
    if (customerIdParam && Number.isNaN(customerIdNum)) {
      return NextResponse.json({ error: 'Invalid customerId' }, { status: 400 });
    }

    // When customerId is present, return all sales for this customer so agent/supervisor can see all customer payments
    if (customerIdParam) {
      const customerId = customerIdNum;
      const customerSales = await Sale.findAll({
        where: { customerId },
        include: includePaymentModels
      });
      if (userRole === 'agent') {
        sales = customerSales;
      } else if (userRole === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const agentIds = supervisedAgents.map((a) => a.id);
        sales = customerSales.filter(
          (s) => s.agentId === userId || agentIds.length === 0 || agentIds.includes(s.agentId)
        );
      } else {
        sales = customerSales;
      }
    } else if (saleId) {
      // When only saleId is provided: load that sale then all sales for same customer (so page can show current sale first, others below)
      const sale = await Sale.findByPk(parseInt(saleId), {
        include: includePaymentModels
      });

      if (!sale) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
      }

      if (userRole === 'agent' && sale.agentId !== userId) {
        return NextResponse.json({ error: 'Unauthorized to view this sale' }, { status: 403 });
      }
      if (userRole === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const agentIds = supervisedAgents.map(agent => agent.id);
        const canViewSale = (sale.agentId === userId) || (agentIds.length === 0) || (agentIds.length > 0 && agentIds.includes(sale.agentId));
        if (!canViewSale) {
          return NextResponse.json({ error: 'Unauthorized to view this sale' }, { status: 403 });
        }
      }

      if (exportDocument) {
        allowFullSensitiveForExport = true;
      }

      const customerIdFromSale = sale.customerId;
      const customerSales = await Sale.findAll({
        where: { customerId: customerIdFromSale },
        include: includePaymentModels
      });
      if (userRole === 'agent') {
        sales = customerSales;
      } else if (userRole === 'supervisor') {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const agentIds = supervisedAgents.map((a) => a.id);
        sales = customerSales.filter(
          (s) => s.agentId === userId || agentIds.length === 0 || agentIds.includes(s.agentId)
        );
      } else {
        sales = customerSales;
      }
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
        // Supervisor can view their own sales OR sales from their supervised agents
        sales = sales.filter(sale => 
          sale.agentId === userId || // Own sales
          agentIds.length === 0 || // No supervised agents = view all
          agentIds.includes(sale.agentId) // Supervised agents' sales
        );
      } else if (userRole === 'agent') {
        sales = sales.filter(sale => sale.agentId === userId);
      } else if (userRole !== 'admin' && userRole !== 'processor' && userRole !== 'verification') {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Note: Card masking is now handled by the Card model's getDataForRole method
    const useFullSensitivePayments =
      (userRole === 'admin' && showFullDetails) || allowFullSensitiveForExport;

    // Batch-load users who added payment records (avoid duplicate JOIN alias with nested include)
    const addedByUserIds = new Set();
    for (const sale of sales) {
      for (const c of sale.cards || []) if (c.addedByUserId) addedByUserIds.add(c.addedByUserId);
      for (const b of sale.banks || []) if (b.addedByUserId) addedByUserIds.add(b.addedByUserId);
      for (const c of sale.chequesElectronic || []) if (c.addedByUserId) addedByUserIds.add(c.addedByUserId);
      for (const c of sale.chequesMail || []) if (c.addedByUserId) addedByUserIds.add(c.addedByUserId);
      for (const e of sale.paymentEmails || []) if (e.addedByUserId) addedByUserIds.add(e.addedByUserId);
    }
    const addedByUsersMap = new Map();
    if (addedByUserIds.size > 0) {
      const users = await User.findAll({
        where: { id: [...addedByUserIds] },
        attributes: ['id', 'firstName', 'lastName', 'role']
      });
      for (const u of users) addedByUsersMap.set(u.id, u);
    }

    const addedByFromUserId = (userId) => {
      if (!userId) return { addedByUserId: null, addedByUserName: null, addedByUserRole: null };
      const u = addedByUsersMap.get(userId);
      if (!u) return { addedByUserId: userId, addedByUserName: null, addedByUserRole: null };
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A';
      return { addedByUserId: u.id, addedByUserName: name, addedByUserRole: u.role || null };
    };

    // Transform sales data to include payment information
    const paymentsData = sales.map(sale => {
      const paymentInfo = {
        saleId: sale.id,
        customer: {
          id: sale.customer?.id,
          name: (() => {
            if (!sale.customer) return 'N/A';
            const n = `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim();
            return n || 'N/A';
          })(),
          email: sale.customer?.email || '-',
          phone: sale.customer?.phone || sale.customer?.landline || '-'
        },
        agent: {
          id: sale.agent?.id,
          name: (() => {
            if (!sale.agent) return 'N/A';
            const n = `${sale.agent.firstName || ''} ${sale.agent.lastName || ''}`.trim();
            return n || 'N/A';
          })()
        },
        saleInfo: {
          status: sale.status,
          createdAt: sale.created_at,
          regularBill: sale.regularBill,
          promotionalBill: sale.promotionalBill,
          lastPayment: sale.lastPayment,
          lastPaymentDate: sale.lastPaymentDate,
          balance: sale.balance,
          usedOldPaymentRefs: Array.isArray(sale.usedOldPaymentRefs) ? sale.usedOldPaymentRefs : (sale.used_old_payment_refs || [])
        },
        cards: (sale.cards || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Newest first
          .map(card => {
          const cardRole = useFullSensitivePayments ? 'admin' : 'agent';

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
            cvv: useFullSensitivePayments ? roleBasedData.cvv : '***',
            status: roleBasedData.status,
            created_at: roleBasedData.created_at,
            expirationStatus: expirationStatus,
            isExpired: expirationStatus.status === 'expired',
            isExpiringSoon: expirationStatus.status === 'expiring_soon',
            createdDate: formatDisplayDate(roleBasedData.created_at),
            updatedDate: formatDisplayDate(roleBasedData.updated_at),
            comments: Array.isArray(roleBasedData.comments) ? roleBasedData.comments : [],
            ...addedByFromUserId(card.addedByUserId)
          };
        }),
        banks: (sale.banks || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Newest first
          .map(bank => {
          const bankRole = useFullSensitivePayments ? 'admin' : 'agent';

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
            updatedDate: formatDisplayDate(bankData.updated_at),
            comments: Array.isArray(bankData.comments) ? bankData.comments : [],
            ...addedByFromUserId(bank.addedByUserId)
          };
        }),
        chequesElectronic: (sale.chequesElectronic || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map(cheque => {
          const chequeRole = useFullSensitivePayments ? 'admin' : 'agent';
          const chequeData = cheque.getDataForRole ? cheque.getDataForRole(chequeRole) : cheque;
          
          return {
            id: chequeData.id,
            routingNumber: chequeData.routingNumber,
            accountNumber: chequeData.accountNumber,
            chequeNumber: chequeData.chequeNumber,
            nameOnCheque: chequeData.nameOnCheque,
            bankName: chequeData.bankName,
            state: chequeData.state,
            status: chequeData.status,
            notes: chequeData.notes,
            created_at: chequeData.created_at,
            createdDate: formatDisplayDate(chequeData.created_at),
            updatedDate: formatDisplayDate(chequeData.updated_at),
            comments: Array.isArray(chequeData.comments) ? chequeData.comments : [],
            ...addedByFromUserId(cheque.addedByUserId)
          };
        }),
        chequesMail: (sale.chequesMail || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map(cheque => {
          const chequeRole = useFullSensitivePayments ? 'admin' : 'agent';
          const chequeData = cheque.getDataForRole ? cheque.getDataForRole(chequeRole) : cheque;
          
          return {
            id: chequeData.id,
            chequeNumber: chequeData.chequeNumber,
            nameOnCheque: chequeData.nameOnCheque,
            bankName: chequeData.bankName,
            status: chequeData.status,
            notes: chequeData.notes,
            created_at: chequeData.created_at,
            createdDate: formatDisplayDate(chequeData.created_at),
            updatedDate: formatDisplayDate(chequeData.updated_at),
            comments: Array.isArray(chequeData.comments) ? chequeData.comments : [],
            ...addedByFromUserId(cheque.addedByUserId)
          };
        }),
        paymentEmails: (sale.paymentEmails || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map(email => {
          return {
            id: email.id,
            emailAddress: email.emailAddress,
            invoiceLink: email.invoiceLink,
            sentAt: email.sentAt,
            status: email.status,
            notes: email.notes,
            created_at: email.created_at,
            createdDate: formatDisplayDate(email.created_at),
            updatedDate: formatDisplayDate(email.updated_at),
            comments: Array.isArray(email.comments) ? email.comments : [],
            ...addedByFromUserId(email.addedByUserId)
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
