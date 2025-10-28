import { NextResponse } from 'next/server';
import socketManager from '../../../../lib/socket';

export async function GET() {
  try {
    const io = socketManager.getIO();
    
    if (!io) {
      return NextResponse.json({
        status: 'error',
        message: 'Socket.IO server not initialized',
        connectedClients: 0,
        uptime: 0
      }, { status: 500 });
    }

    const connectedClients = io.engine.clientsCount;
    const uptime = process.uptime();
    
    return NextResponse.json({
      status: 'healthy',
      message: 'Socket.IO server is running',
      connectedClients,
      uptime: Math.floor(uptime),
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Socket.IO health check error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Socket.IO health check failed',
      error: error.message
    }, { status: 500 });
  }
}
