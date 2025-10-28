import { NextResponse } from 'next/server';
import { NotificationService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth';

export async function GET(request) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Get notifications for the authenticated user
    const notifications = await NotificationService.findByUserId(user.id, {
      limit,
      offset,
      unreadOnly
    });

    // Get total count for pagination
    const totalCount = await NotificationService.getTotalCount(user.id, { unreadOnly });

    // Get unread count
    const unreadCount = await NotificationService.getUnreadCount(user.id);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        total: totalCount,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: notifications.length === limit
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch notifications', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { notificationId, action } = await request.json();
    
    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }
    
    // For mark_all_read, notificationId is not required
    if (action !== 'mark_all_read' && !notificationId) {
      return NextResponse.json({ error: 'Notification ID is required for this action' }, { status: 400 });
    }

    let result;
    
    switch (action) {
      case 'mark_read':
        result = await NotificationService.markAsRead(notificationId);
        break;
      case 'mark_all_read':
        result = await NotificationService.markAllAsRead(user.id);
        break;
      case 'delete':
        result = await NotificationService.delete(notificationId);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!result) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Notification updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Update notification error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update notification', error: error.message },
      { status: 500 }
    );
  }
}

