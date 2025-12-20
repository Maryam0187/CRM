import { CustomerService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import { Sale, User, Customer, Sequelize } from '../../../models/index.js';

const { Op } = Sequelize;

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
    
    // For agents and supervisors, get customers from their sales AND customers they created
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
      
      // Extract unique customer IDs from sales
      const customerIdsFromSales = [...new Set(sales.map(sale => sale.customerId).filter(id => id !== null && id !== undefined))];
      
      // Also get customer IDs where the agent created them (even without sales)
      const customersCreatedByAgent = await Customer.findAll({
        where: { createdBy: user.id },
        attributes: ['id'],
        raw: true
      });
      
      const customerIdsFromCreated = customersCreatedByAgent.map(c => c.id).filter(id => id !== null && id !== undefined);
      
      // Combine and deduplicate customer IDs
      const allCustomerIds = [...new Set([...customerIdsFromSales, ...customerIdsFromCreated])];
      
      if (allCustomerIds.length === 0) {
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
      
      // Fetch all customers with ordering by created_at DESC, then paginate
      const allCustomers = await Customer.findAll({
        where: {
          id: {
            [Op.in]: allCustomerIds
          }
        },
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      
      // Paginate the sorted customers
      const offset = (page - 1) * limit;
      const paginatedCustomers = allCustomers.slice(offset, offset + limit);
      
      // Fetch sales for each paginated customer (filtered by same criteria)
      const customers = await Promise.all(
        paginatedCustomers.map(async (customer) => {
          // Get sales for this customer matching the same criteria
          const customerSalesWhere = {
            ...salesWhere,
            customerId: customer.id
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
          totalPages: Math.ceil(allCustomers.length / limit),
          totalItems: allCustomers.length,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(allCustomers.length / limit),
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
