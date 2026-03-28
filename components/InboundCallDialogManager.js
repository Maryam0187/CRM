'use client';

import { useEffect } from 'react';
import { useInboundCall } from '../contexts/InboundCallContext';
import { useSocket } from '../contexts/SocketContext';
import InboundCallDialog from './InboundCallDialog';

export default function InboundCallDialogManager() {
  const { activeCall, minimizedCalls, showInboundCall, closeInboundCall, minimizeInboundCall, restoreMinimizedCall } = useInboundCall();
  const { socket, isConnected } = useSocket();
  
  // Listen for inbound call notifications via socket
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleInboundCallNotification = (notification) => {
      // Warm participant invites use GlobalWebCallInterface modal only (same socket shape has conferenceName)
      if (notification.type === 'call_participant_invite') {
        return;
      }
      // Check if this is an inbound call notification
      if (notification.conferenceName || notification.type === 'inbound_call') {
        // Extract saleId from relatedId when relatedType is 'sale'
        const relatedType = notification.relatedType || notification.related_type;
        const relatedId = notification.relatedId || notification.related_id;
        const saleId = notification.saleId || notification.sale_id || (relatedType === 'sale' ? relatedId : null);
        
        // Format notification to match expected structure
        const formattedNotification = {
          id: notification.id || `call-${Date.now()}`,
          title: notification.title || '📞 Inbound Call Received',
          message: notification.message || `Inbound call from ${notification.callerNumber || 'Unknown'}`,
          conferenceName: notification.conferenceName || notification.conference_name,
          callSid: notification.callSid || notification.call_sid,
          callerNumber: notification.callerNumber || notification.caller_number,
          customerId: notification.customerId || notification.customer_id,
          customerName: notification.customerName || notification.customer_name,
          saleId: saleId,
          lastSaleId: notification.lastSaleId || notification.last_sale_id,
          isRead: notification.isRead || false
        };
        
        showInboundCall(formattedNotification);
      }
    };
    
    // Listen for custom notification events
    socket.on('notification', handleInboundCallNotification);
    
    // Also listen for custom events from the window
    const handleWindowNotification = (event) => {
      const notification = event.detail?.notification || event.detail;
      if (notification) {
        handleInboundCallNotification(notification);
      }
    };
    
    window.addEventListener('inboundCallNotification', handleWindowNotification);
    
    return () => {
      socket.off('notification', handleInboundCallNotification);
      window.removeEventListener('inboundCallNotification', handleWindowNotification);
    };
  }, [socket, isConnected, showInboundCall]);
  
  return (
    <>
      {/* Active Call Dialog */}
      {activeCall && (
        <InboundCallDialog
          notification={activeCall}
          onClose={closeInboundCall}
          onMinimize={minimizeInboundCall}
        />
      )}
      
      {/* Minimized Calls - Show as small badges that can be restored */}
      {minimizedCalls.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
          {minimizedCalls.map((call, index) => (
            <div
              key={call.callSid || call.id || index}
              className="bg-white rounded-lg shadow-lg border-2 border-green-500 p-3 flex items-center gap-3 min-w-[250px] cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => restoreMinimizedCall(call)}
            >
              <div className="flex-shrink-0">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {call.customerName || call.callerNumber || 'Incoming Call'}
                </div>
                <div className="text-xs text-gray-600">Click to open</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

