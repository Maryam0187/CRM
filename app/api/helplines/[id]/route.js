import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import sequelizeDb from '../../../../lib/sequelize-db.js';
import { normalizePhoneForStorage } from '../../../../lib/twilio.js';

export async function PUT(request, { params }) {
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
    const { id } = params;
    const body = await request.json();
    const { phoneNumber, label } = body;

    // Find helpline
    const helpline = await sequelizeDb.Helpline.findOne({
      where: {
        id: parseInt(id),
        userId: user.id,
        isActive: true
      }
    });

    if (!helpline) {
      return Response.json(
        { error: 'Helpline not found' },
        { status: 404 }
      );
    }

    // Update helpline
    if (phoneNumber) {
      const normalizedPhone = normalizePhoneForStorage(phoneNumber) || phoneNumber;
      helpline.phoneNumber = normalizedPhone;
    }
    if (label) {
      helpline.label = label.trim();
    }

    await helpline.save();

    return Response.json({
      success: true,
      message: 'Helpline updated successfully',
      data: helpline
    });
  } catch (error) {
    console.error('Error updating helpline:', error);
    return Response.json(
      { error: 'Failed to update helpline', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
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
    const { id } = params;

    // Find helpline
    const helpline = await sequelizeDb.Helpline.findOne({
      where: {
        id: parseInt(id),
        userId: user.id,
        isActive: true
      }
    });

    if (!helpline) {
      return Response.json(
        { error: 'Helpline not found' },
        { status: 404 }
      );
    }

    // Soft delete
    helpline.isActive = false;
    await helpline.save();

    return Response.json({
      success: true,
      message: 'Helpline deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting helpline:', error);
    return Response.json(
      { error: 'Failed to delete helpline', details: error.message },
      { status: 500 }
    );
  }
}

