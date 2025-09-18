import { Card } from '../../../models/index.js';
import { 
  validateCardForm, 
  cleanCardData,
  getCardExpirationStatus,
  formatDisplayDate
} from '../../../lib/validation.js';
import { requireAuth } from '../../../lib/serverAuth.js';

export async function POST(request) {
  try {
    // Verify authentication - users should be logged in to add cards
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    
    // Allow agents, admins, processors, and verification users to create cards
    if (!['agent', 'admin', 'processor', 'verification'].includes(user.role)) {
      return Response.json(
        { success: false, message: 'Insufficient permissions to create cards' },
        { status: 403 }
      );
    }
    
    const cardData = await request.json();
    
    // Validate required fields
    if (!cardData.saleId || !cardData.cardType || !cardData.provider || 
        !cardData.customerName || !cardData.cardNumber || !cardData.cvv || !cardData.expiryDate) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate all fields using shared validation
    const errors = validateCardForm(cardData);

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return Response.json(
        { success: false, message: 'Validation failed', errors },
        { status: 400 }
      );
    }

    // Clean card data using shared function
    const cleanedCardData = cleanCardData(cardData);

    const card = await Card.create(cleanedCardData);
    
    return Response.json({
      success: true,
      message: 'Card details saved successfully',
      data: card
    }, { status: 201 });
  } catch (error) {
    console.error('Create card error:', error);
    return Response.json(
      { success: false, message: 'Failed to save card details', error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const authenticatedUserRole = user.role; // Get role from authenticated user
    
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    
    // Use authenticated user's role, don't allow role override from query params for security
    const userRole = authenticatedUserRole;
    
    let whereClause = {};
    if (saleId) {
      whereClause.saleId = saleId;
    }
    
    // Get raw cards without automatic decryption (newest first)
    const rawCards = await Card.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']], // Most recently added cards first
      include: [{
        association: 'sale',
        include: ['agent'] // Include agent info for authorization checks
      }]
    });
    
    // Apply role-based filtering
    let authorizedCards = rawCards;
    if (userRole === 'agent') {
      // Agents can only see cards from their own sales
      authorizedCards = rawCards.filter(card => 
        card.sale && card.sale.agentId === user.id
      );
    } else if (userRole === 'supervisor') {
      // TODO: Add supervisor logic - can see cards from supervised agents
      // For now, supervisors see all cards like admins
    }
    // Admins, processors, and verification users can see all cards
    
    // Process cards with expiration status and formatted dates
    const processedCards = authorizedCards.map(card => {
      // Use the instance method to get role-based data
      const cardData = card.getDataForRole(userRole);
      
      // Add expiration status and formatted dates
      const expirationStatus = getCardExpirationStatus(cardData.expiryDate);
      
      return {
        ...cardData,
        expirationStatus: expirationStatus,
        isExpired: expirationStatus.status === 'expired',
        isExpiringSoon: expirationStatus.status === 'expiring_soon',
        createdDate: formatDisplayDate(cardData.created_at),
        updatedDate: formatDisplayDate(cardData.updated_at)
      };
    });
    
    return Response.json({
      success: true,
      data: processedCards
    });
  } catch (error) {
    console.error('Get cards error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch cards', error: error.message },
      { status: 500 }
    );
  }
}
