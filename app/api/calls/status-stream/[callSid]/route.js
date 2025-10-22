import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';

export async function GET(request, { params }) {
  try {
    const { callSid } = params;

    if (!callSid) {
      return new Response('Call SID is required', { status: 400 });
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        console.log('📡 SSE connection started for call:', callSid);
        
        // Send initial connection message
        const initialMessage = `data: ${JSON.stringify({
          type: 'connected',
          callSid,
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(initialMessage));

        // Set up polling to check for status changes
        const pollInterval = setInterval(async () => {
          try {
            const callLog = await sequelizeDb.CallLog.findOne({
              where: { callSid },
              include: [
                {
                  model: sequelizeDb.Customer,
                  as: 'customer',
                  attributes: ['id', 'firstName', 'lastName', 'phone']
                },
                {
                  model: sequelizeDb.User,
                  as: 'agent',
                  attributes: ['id', 'firstName', 'lastName', 'email']
                },
                {
                  model: sequelizeDb.Sale,
                  as: 'sale',
                  attributes: ['id', 'status']
                }
              ]
            });

            if (callLog) {
              const statusData = {
                type: 'status_update',
                callSid: callLog.callSid,
                status: callLog.status,
                duration: callLog.duration,
                direction: callLog.direction,
                fromNumber: callLog.fromNumber,
                toNumber: callLog.toNumber,
                callPurpose: callLog.callPurpose,
                createdAt: callLog.createdAt,
                updatedAt: callLog.updatedAt,
                customer: callLog.customer,
                agent: callLog.agent,
                sale: callLog.sale,
                twilioData: callLog.twilioData,
                timestamp: new Date().toISOString()
              };

              const message = `data: ${JSON.stringify(statusData)}\n\n`;
              controller.enqueue(new TextEncoder().encode(message));

              // If call is completed, close the connection
              if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callLog.status)) {
                console.log('📡 Call completed, closing SSE connection for:', callSid);
                clearInterval(pollInterval);
                controller.close();
              }
            } else {
              console.log('📡 Call log not found, closing SSE connection for:', callSid);
              clearInterval(pollInterval);
              controller.close();
            }
          } catch (error) {
            console.error('📡 Error in SSE polling:', error);
            const errorMessage = `data: ${JSON.stringify({
              type: 'error',
              message: 'Failed to fetch call status',
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorMessage));
          }
        }, 1000); // Poll every 1 second

        // Clean up on connection close
        const cleanup = () => {
          console.log('📡 SSE connection closed for call:', callSid);
          clearInterval(pollInterval);
        };

        // Handle connection close
        request.signal?.addEventListener('abort', cleanup);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });

  } catch (error) {
    console.error('Error creating SSE stream:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
