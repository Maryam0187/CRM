import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { User, UserSession } from '../../../../models';

export async function POST(request) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Verify refresh token
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      // When refresh token is expired, mark the session inactive so server state matches reality
      try {
        const expired = jwt.decode(refreshToken);
        if (expired?.sessionId && expired?.userId) {
          await UserSession.update(
            { isActive: false },
            { where: { sessionId: expired.sessionId, userId: expired.userId } }
          );
        }
      } catch (_) { /* ignore */ }
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Check if token type is refresh
    if (decoded.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid token type' },
        { status: 401 }
      );
    }

    // Get user data to ensure user still exists and is active
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      );
    }

    // Ensure session exists and is still active (not logged out / invalidated)
    if (decoded.sessionId) {
      const session = await UserSession.findOne({
        where: { sessionId: decoded.sessionId, userId: user.id }
      });
      if (!session || !session.isActive) {
        return NextResponse.json(
          { error: 'Session was invalidated. Please sign in again.' },
          { status: 401 }
        );
      }
      // Session validity is isActive only; refresh token expiry controls max login duration
    }

    // Generate new access token (include sessionId from refresh token)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Default to 15 minutes if not set

    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: `${user.firstName} ${user.lastName}`.trim(),
        sessionId: decoded.sessionId,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      expiresIn: JWT_EXPIRES_IN, // Token expiration from environment variable
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
