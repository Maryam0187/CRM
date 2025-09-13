import { Card } from '../../../models/index.js';

export async function POST(request) {
  try {
    const cardData = await request.json();
    
    // Validate required fields
    if (!cardData.saleId || !cardData.cardType || !cardData.provider || 
        !cardData.customerName || !cardData.cardNumber || !cardData.cvv || !cardData.expiryDate) {
      return Response.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const card = await Card.create(cardData);
    
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
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    
    let whereClause = {};
    if (saleId) {
      whereClause.saleId = saleId;
    }
    
    const cards = await Card.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    return Response.json({
      success: true,
      data: cards
    });
  } catch (error) {
    console.error('Get cards error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch cards', error: error.message },
      { status: 500 }
    );
  }
}
