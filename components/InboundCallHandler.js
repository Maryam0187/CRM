'use client';

import { useEffect } from 'react';
import { useCall } from '../contexts/CallContext';
import { useRouter } from 'next/navigation';

/**
 * Component that automatically opens GlobalWebCallInterface when an inbound call notification is received
 */
export default function InboundCallHandler() {
  const { startCall } = useCall();
  const router = useRouter();

  useEffect(() => {
    const handleInboundCallNotification = (event) => {
      const notification = event.detail?.notification;
      
      // Check if this is an inbound call notification (has conferenceName)
      if (notification?.conferenceName && notification.conferenceName.startsWith('inbound-')) {
        console.log('📞 Inbound call notification received, auto-opening GlobalWebCallInterface:', notification);
        
        // Automatically open GlobalWebCallInterface
        startCall({
          callSid: notification.callSid,
          conferenceName: notification.conferenceName,
          customerId: notification.customerId,
          saleId: notification.lastSaleId,
          phoneNumber: notification.callerNumber,
          customerName: notification.customerName
        });

        // Open the sale in the same window if saleId exists
        if (notification.lastSaleId || notification.saleId) {
          const saleId = notification.lastSaleId || notification.saleId;
          // Use setTimeout to ensure navigation happens after state updates
          setTimeout(() => {
            router.push(`/add-sale?id=${saleId}`);
          }, 100);
        }
      }
    };

    // Listen for new notification events
    window.addEventListener('newNotificationArrived', handleInboundCallNotification);

    return () => {
      window.removeEventListener('newNotificationArrived', handleInboundCallNotification);
    };
  }, [startCall, router]);

  // This component doesn't render anything
  return null;
}

