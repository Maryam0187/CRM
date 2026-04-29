import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { Sequelize } from 'sequelize';

export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending|approved|corrected|rejected
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const reviewWhere = {};
    if (status && status.trim()) {
      reviewWhere.reviewStatus = status.trim();
    }

    const { rows, count } = await sequelizeDb.CallLog.findAndCountAll({
      where: Sequelize.where(
        Sequelize.fn('JSON_EXTRACT', Sequelize.col('CallLog.twilio_data'), '$.aiCall'),
        true
      ),
      include: [
        {
          model: sequelizeDb.AiCallReview,
          as: 'aiReview',
          required: false,
          where: Object.keys(reviewWhere).length ? reviewWhere : undefined
        },
        {
          model: sequelizeDb.AiCallExtraction,
          as: 'aiExtractions',
          required: false,
          separate: true,
          limit: 1,
          order: [['created_at', 'DESC']]
        },
        {
          model: sequelizeDb.User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    const queue = rows.map((callLog) => ({
      id: callLog.id,
      callSid: callLog.callSid,
      status: callLog.status,
      duration: callLog.duration,
      fromNumber: callLog.fromNumber,
      toNumber: callLog.toNumber,
      customerName: callLog.customerName,
      callOutcome: callLog.callOutcome,
      createdAt: callLog.created_at,
      agent: callLog.agent || null,
      review: callLog.aiReview || null,
      latestExtraction: Array.isArray(callLog.aiExtractions) && callLog.aiExtractions.length
        ? callLog.aiExtractions[0]
        : null
    }));

    return NextResponse.json({
      success: true,
      data: {
        queue,
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + limit < count
        }
      }
    });
  } catch (error) {
    console.error('Error fetching AI review queue:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch AI review queue',
        error: error.message
      },
      { status: 500 }
    );
  }
}

