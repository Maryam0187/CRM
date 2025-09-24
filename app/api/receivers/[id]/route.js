import { ReceiverService } from '../../../../lib/sequelize-db.js';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const receiver = await ReceiverService.findById(id);
    
    if (!receiver) {
      return Response.json(
        { success: false, message: 'Receiver not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      data: receiver
    });
  } catch (error) {
    console.error('Get receiver error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch receiver', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const receiverData = await request.json();
    
    const receiver = await ReceiverService.update(id, receiverData);
    
    if (!receiver) {
      return Response.json(
        { success: false, message: 'Receiver not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Receiver updated successfully',
      data: receiver
    });
  } catch (error) {
    console.error('Update receiver error:', error);
    return Response.json(
      { success: false, message: 'Failed to update receiver', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const receiver = await ReceiverService.delete(id);
    
    if (!receiver) {
      return Response.json(
        { success: false, message: 'Receiver not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Receiver deleted successfully'
    });
  } catch (error) {
    console.error('Delete receiver error:', error);
    return Response.json(
      { success: false, message: 'Failed to delete receiver', error: error.message },
      { status: 500 }
    );
  }
}
