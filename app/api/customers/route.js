import { CustomerService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    const result = await CustomerService.findAllPaginated(page, limit);
    
    return Response.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
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
    return Response.json(
      { success: false, message: 'Failed to create customer', error: error.message },
      { status: 500 }
    );
  }
}
