import { CarrierService } from '../../../../lib/sequelize-db.js';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const carrier = await CarrierService.findById(id);
    
    if (!carrier) {
      return Response.json(
        { success: false, message: 'Carrier not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      data: carrier
    });
  } catch (error) {
    console.error('Get carrier error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch carrier', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const carrierData = await request.json();
    
    const carrier = await CarrierService.update(id, carrierData);
    
    if (!carrier) {
      return Response.json(
        { success: false, message: 'Carrier not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Carrier updated successfully',
      data: carrier
    });
  } catch (error) {
    console.error('Update carrier error:', error);
    return Response.json(
      { success: false, message: 'Failed to update carrier', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const carrier = await CarrierService.delete(id);
    
    if (!carrier) {
      return Response.json(
        { success: false, message: 'Carrier not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Carrier deleted successfully'
    });
  } catch (error) {
    console.error('Delete carrier error:', error);
    return Response.json(
      { success: false, message: 'Failed to delete carrier', error: error.message },
      { status: 500 }
    );
  }
}
