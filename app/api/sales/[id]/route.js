import { SaleService, CustomerService } from '../../../../lib/sequelize-db.js';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const sale = await SaleService.findById(id);
    
    if (!sale) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch sale', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const updateData = await request.json();
    
    // Sanitize enum fields - convert empty strings to null
    const sanitizeEnumField = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };
    
    // Sanitize the update data
    const sanitizedData = {
      ...updateData,
      pinCodeStatus: sanitizeEnumField(updateData.pinCodeStatus),
      basicPackageStatus: sanitizeEnumField(updateData.basicPackageStatus),
      bundle: sanitizeEnumField(updateData.bundle),
      status: sanitizeEnumField(updateData.status)
    };
    
    const sale = await SaleService.update(id, sanitizedData);
    
    if (!sale) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Sale updated successfully',
      data: sale
    });
  } catch (error) {
    console.error('Update sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to update sale', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const result = await SaleService.delete(id);
    
    if (!result) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Sale deleted successfully'
    });
  } catch (error) {
    console.error('Delete sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to delete sale', error: error.message },
      { status: 500 }
    );
  }
}
