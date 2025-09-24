import { CarrierService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    const result = await CarrierService.findAllPaginated(page, limit);
    
    return Response.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get carriers error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch carriers', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const carrierData = await request.json();
    
    const carrier = await CarrierService.create(carrierData);
    
    return Response.json({
      success: true,
      message: 'Carrier created successfully',
      data: carrier
    }, { status: 201 });
  } catch (error) {
    console.error('Create carrier error:', error);
    return Response.json(
      { success: false, message: 'Failed to create carrier', error: error.message },
      { status: 500 }
    );
  }
}
