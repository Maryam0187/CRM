import { SaleService, SupervisorAgentService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const dateFilter = searchParams.get('dateFilter');
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');
    
    // Pagination parameters
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    let result;
    
    // Role-based data filtering with pagination
    if (userRole === 'admin') {
      // Admin can see all sales
      if (status && dateFilter) {
        result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit);
      } else if (status) {
        result = await SaleService.findByStatusPaginated(status, page, limit);
      } else if (dateFilter) {
        result = await SaleService.findByDatePaginated(dateFilter, page, limit);
      } else {
        result = await SaleService.findAllPaginated(page, limit);
      }
    } else if (userRole === 'supervisor' && userId) {
      // Supervisor can see their agents' sales
      const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
      const agentIds = supervisedAgents.map(agent => agent.id);
      
      if (agentIds.length === 0) {
        result = {
          data: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      } else {
        // Get all sales first, then filter by supervised agents
        let allSales;
        if (status && dateFilter) {
          allSales = await SaleService.findByStatusAndDate(status, dateFilter);
        } else if (status) {
          allSales = await SaleService.findByStatus(status);
        } else if (dateFilter) {
          allSales = await SaleService.findByDate(dateFilter);
        } else {
          allSales = await SaleService.findAll();
        }
        
        // Filter by supervised agents
        const filteredSales = allSales.filter(sale => agentIds.includes(sale.agentId));
        
        // Apply pagination manually
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = filteredSales.slice(startIndex, endIndex);
        
        result = {
          data: paginatedData,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(filteredSales.length / limit),
            totalItems: filteredSales.length,
            itemsPerPage: limit,
            hasNextPage: page < Math.ceil(filteredSales.length / limit),
            hasPrevPage: page > 1
          }
        };
      }
    } else if (userRole === 'supervisor_own' && userId) {
      // Supervisor viewing their own sales (when "Me" button is clicked)
      let allSales;
      if (status && dateFilter) {
        allSales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        allSales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        allSales = await SaleService.findByDate(dateFilter);
      } else {
        allSales = await SaleService.findAll();
      }
      
      // Filter by supervisor's own ID
      const filteredSales = allSales.filter(sale => sale.agentId === parseInt(userId));
      
      // Apply pagination manually
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = filteredSales.slice(startIndex, endIndex);
      
      result = {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filteredSales.length / limit),
          totalItems: filteredSales.length,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(filteredSales.length / limit),
          hasPrevPage: page > 1
        }
      };
    } else if (userRole === 'agent' && userId) {
      // Agent can only see their own sales
      let allSales;
      if (status && dateFilter) {
        allSales = await SaleService.findByStatusAndDate(status, dateFilter);
      } else if (status) {
        allSales = await SaleService.findByStatus(status);
      } else if (dateFilter) {
        allSales = await SaleService.findByDate(dateFilter);
      } else {
        allSales = await SaleService.findAll();
      }
      
      // Filter by agent ID
      const filteredSales = allSales.filter(sale => sale.agentId === parseInt(userId));
      
      // Apply pagination manually
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = filteredSales.slice(startIndex, endIndex);
      
      result = {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filteredSales.length / limit),
          totalItems: filteredSales.length,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(filteredSales.length / limit),
          hasPrevPage: page > 1
        }
      };
    } else {
      // Default behavior for other roles or no role specified
      if (status && dateFilter) {
        result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit);
      } else if (status) {
        result = await SaleService.findByStatusPaginated(status, page, limit);
      } else if (dateFilter) {
        result = await SaleService.findByDatePaginated(dateFilter, page, limit);
      } else {
        result = await SaleService.findAllPaginated(page, limit);
      }
    }
    
    return Response.json({
      success: true,
      data: result.data,
      pagination: result.pagination
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
