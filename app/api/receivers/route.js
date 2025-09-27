import { ReceiverService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const carrierId = searchParams.get('carrierId');
    
    let result;
    if (carrierId) {
      // Fetch receivers by carrier ID
      result = await ReceiverService.findByCarrierId(carrierId);
    } else {
      // Fetch all receivers with pagination
      result = await ReceiverService.findAllPaginated(page, limit);
    }
    
    return Response.json({
      success: true,
      data: result.data || result,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get receivers error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch receivers', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const receiverData = await request.json();
    
    const receiver = await ReceiverService.create(receiverData);
    
    return Response.json({
      success: true,
      message: 'Receiver created successfully',
      data: receiver
    }, { status: 201 });
  } catch (error) {
    console.error('Create receiver error:', error);
    return Response.json(
      { success: false, message: 'Failed to create receiver', error: error.message },
      { status: 500 }
    );
  }
}
