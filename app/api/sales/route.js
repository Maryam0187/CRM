import { SaleService, SupervisorAgentService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const dateFilter = searchParams.get('dateFilter');
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');
    
    let sales;
    
    // Role-based data filtering
    if (userRole === 'admin') {
      // Admin can see all sales
      if (status && dateFilter) {
        sales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        sales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        sales = await SaleService.findByDate(dateFilter);
      } else {
        sales = await SaleService.findAll();
      }
    } else if (userRole === 'supervisor' && userId) {
      // Supervisor can see their agents' sales
      const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
      const agentIds = supervisedAgents.map(agent => agent.id);
      
      if (agentIds.length === 0) {
        sales = [];
      } else {
        // Filter sales by supervised agents
        if (status && dateFilter) {
          sales = await SaleService.findByStatusAndDate(status, dateFilter);
        } else if (status) {
          sales = await SaleService.findByStatus(status);
        } else if (dateFilter) {
          sales = await SaleService.findByDate(dateFilter);
        } else {
          sales = await SaleService.findAll();
        }
        
        // Filter by supervised agents
        sales = sales.filter(sale => agentIds.includes(sale.agentId));
      }
    } else if (userRole === 'supervisor_own' && userId) {
      // Supervisor viewing their own sales (when "Me" button is clicked)
      if (status && dateFilter) {
        sales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        sales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        sales = await SaleService.findByDate(dateFilter);
      } else {
        sales = await SaleService.findAll();
      }
      
      // Filter by supervisor's own ID
      sales = sales.filter(sale => sale.agentId === parseInt(userId));
    } else if (userRole === 'agent' && userId) {
      // Agent can only see their own sales
      if (status && dateFilter) {
        sales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        sales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        sales = await SaleService.findByDate(dateFilter);
      } else {
        sales = await SaleService.findAll();
      }
      
      // Filter by agent ID
      sales = sales.filter(sale => sale.agentId === parseInt(userId));
    } else {
      // Default behavior for other roles or no role specified
      if (status && dateFilter) {
        sales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        sales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        sales = await SaleService.findByDate(dateFilter);
      } else {
        sales = await SaleService.findAll();
      }
    }
    
    return Response.json({
      success: true,
      data: sales
    });
  } catch (error) {
    console.error('Get sales error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch sales', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const saleData = await request.json();
    
    // Sanitize enum fields - convert empty strings to null
    const sanitizeEnumField = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };
    
    // Sanitize the sale data
    const sanitizedData = {
      ...saleData,
      pinCodeStatus: sanitizeEnumField(saleData.pinCodeStatus),
      basicPackageStatus: sanitizeEnumField(saleData.basicPackageStatus),
      bundle: sanitizeEnumField(saleData.bundle),
      status: sanitizeEnumField(saleData.status)
    };
    
    const sale = await SaleService.create(sanitizedData);
    
    return Response.json({
      success: true,
      message: 'Sale created successfully',
      data: sale
    }, { status: 201 });
  } catch (error) {
    console.error('Create sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to create sale', error: error.message },
      { status: 500 }
    );
  }
}
