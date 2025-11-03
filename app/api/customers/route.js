import { CustomerService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { Sale, User } from '../../../models/index.js';

export async function GET(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    // For agents and supervisors, get customers from their sales
    if (user.role === 'agent' || user.role === 'supervisor') {
      // Build where clause for sales based on role
      const salesWhere = {};
      
      if (user.role === 'agent') {
        // Agent only sees their own sales
        salesWhere.agentId = user.id;
      } else if (user.role === 'supervisor') {
        // Supervisor only sees their own sales (not their agents' sales)
        salesWhere.agentId = user.id;
      }
      
      // Get all sales matching the criteria (no pagination for getting unique customer IDs)
      const sales = await Sale.findAll({
        where: salesWhere,
        attributes: ['customerId'],
        raw: true
      });
      
      // Extract unique customer IDs
      const customerIds = [...new Set(sales.map(sale => sale.customerId).filter(id => id !== null && id !== undefined))];
      
      if (customerIds.length === 0) {
        return Response.json({
          success: true,
          data: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false
          }
        });
      }
      
      // Paginate customer IDs
      const offset = (page - 1) * limit;
      const paginatedCustomerIds = customerIds.slice(offset, offset + limit);
      
      // Fetch customers with their related sales (filtered by same criteria)
      const customers = await Promise.all(
        paginatedCustomerIds.map(async (customerId) => {
          const customer = await CustomerService.findById(customerId);
          if (!customer) return null;
          
          // Get sales for this customer matching the same criteria
          const customerSalesWhere = {
            ...salesWhere,
            customerId: customerId
          };
          
          const customerSales = await Sale.findAll({
            where: customerSalesWhere,
            include: [
              {
                model: User,
                as: 'agent',
                attributes: ['id', 'firstName', 'lastName', 'email']
              }
            ],
            order: [['created_at', 'DESC']]
          });
          
          return {
            ...customer.toJSON(),
            sales: customerSales
          };
        })
      );
      
      const validCustomers = customers.filter(c => c !== null);
      
      return Response.json({
        success: true,
        data: validCustomers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(customerIds.length / limit),
          totalItems: customerIds.length,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(customerIds.length / limit),
          hasPrevPage: page > 1
        }
      });
    } else {
      // Admin sees all customers
      const result = await CustomerService.findAllPaginated(page, limit);
      return Response.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    }
  } catch (error) {
    console.error('Get customers error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch customers', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const customerData = await request.json();
    
    // Sanitize email field - convert empty strings to null for email validation
    const sanitizeEmail = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };
    
    // Sanitize the customer data
    const sanitizedData = {
      ...customerData,
      email: sanitizeEmail(customerData.email)
    };
    
    const customer = await CustomerService.create(sanitizedData);
    
    return Response.json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    }, { status: 201 });
  } catch (error) {
    console.error('Create customer error:', error);
    
    // Handle duplicate customer error
    if (error.name === 'SequelizeUniqueConstraintError') {
      return Response.json(
        { 
          success: false, 
          message: 'A customer with this name and landline number already exists. Please use a different name or landline number.',
          error: 'DUPLICATE_CUSTOMER'
        },
        { status: 409 }
      );
    }
    
    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => err.message).join(', ');
      return Response.json(
        { 
          success: false, 
          message: `Validation error: ${validationErrors}`,
          error: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }
    
    return Response.json(
      { success: false, message: 'Failed to create customer', error: error.message },
      { status: 500 }
    );
  }
}
