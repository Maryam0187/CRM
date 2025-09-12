import { CustomerService } from '../../../../lib/sequelize-db.js';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const customer = await CustomerService.findById(id);
    
    if (!customer) {
      return Response.json(
        { success: false, message: 'Customer not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch customer', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const updateData = await request.json();
    
    // Sanitize email field - convert empty strings to null for email validation
    const sanitizeEmail = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };
    
    // Sanitize the update data
    const sanitizedData = {
      ...updateData,
      email: sanitizeEmail(updateData.email)
    };
    
    const customer = await CustomerService.update(id, sanitizedData);
    
    if (!customer) {
      return Response.json(
        { success: false, message: 'Customer not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    return Response.json(
      { success: false, message: 'Failed to update customer', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const result = await CustomerService.delete(id);
    
    if (!result) {
      return Response.json(
        { success: false, message: 'Customer not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    return Response.json(
      { success: false, message: 'Failed to delete customer', error: error.message },
      { status: 500 }
    );
  }
}
