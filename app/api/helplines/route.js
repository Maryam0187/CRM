import { requireJWTAuth } from '../../../lib/jwtAuth.js';
import sequelizeDb from '../../../lib/sequelize-db.js';
import { normalizePhoneForStorage } from '../../../lib/twilio.js';

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

    // Get all active helplines for this user
    const helplines = await sequelizeDb.Helpline.findAll({
      where: {
        userId: user.id,
        isActive: true
      },
      order: [['label', 'ASC']],
      attributes: ['id', 'phoneNumber', 'label', 'createdAt', 'updatedAt']
    });

    return Response.json({
      success: true,
      data: helplines
    });
  } catch (error) {
    console.error('Error fetching helplines:', error);
    return Response.json(
      { error: 'Failed to fetch helplines', details: error.message },
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

    const user = authResult.user;
    const body = await request.json();
    const { phoneNumber, label } = body;

    // Validate required fields
    if (!phoneNumber || !label) {
      return Response.json(
        { error: 'Phone number and label are required' },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneForStorage(phoneNumber) || phoneNumber;

    // Check if helpline already exists for this user
    const existingHelpline = await sequelizeDb.Helpline.findOne({
      where: {
        userId: user.id,
        phoneNumber: normalizedPhone,
        isActive: true
      }
    });

    if (existingHelpline) {
      // Update existing helpline
      existingHelpline.label = label;
      await existingHelpline.save();

      return Response.json({
        success: true,
        message: 'Helpline updated successfully',
        data: existingHelpline
      });
    }

    // Create new helpline
    const helpline = await sequelizeDb.Helpline.create({
      userId: user.id,
      phoneNumber: normalizedPhone,
      label: label.trim(),
      isActive: true
    });

    return Response.json({
      success: true,
      message: 'Helpline saved successfully',
      data: helpline
    }, { status: 201 });
  } catch (error) {
    console.error('Error saving helpline:', error);
    return Response.json(
      { error: 'Failed to save helpline', details: error.message },
      { status: 500 }
    );
  }
}

