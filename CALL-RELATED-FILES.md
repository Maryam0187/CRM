# Call-Related Files in CRM Project

This document lists all files related to call functionality in the CRM project.

## Components

1. **components/CallButton.js** - Button component for initiating calls
2. **components/CallHistory.js** - Component for displaying call history
3. **components/WebCallInterface.js** - Main web interface for making/receiving calls
4. **components/AddSale.js** - Contains call functionality integrated with sales

## Models

5. **models/CallLog.js** - Sequelize model for call logs
6. **models/CallTransfer.js** - Sequelize model for call transfers
7. **models/index.js** - Model index (exports CallLog, CallTransfer)

## API Routes - Calls

8. **app/api/calls/agents/route.js** - API route for call agents
9. **app/api/calls/hangup/route.js** - API route for hanging up calls
10. **app/api/calls/initiate/route.js** - API route for initiating calls
11. **app/api/calls/notes/route.js** - API route for call notes
12. **app/api/calls/status/[callSid]/route.js** - API route for call status by callSid
13. **app/api/calls/transfer/route.js** - API route for call transfers

## API Routes - Twilio

14. **app/api/twilio/agent-conference/route.js** - Twilio agent conference route
15. **app/api/twilio/call-status-callback/route.js** - Twilio call status callback
16. **app/api/twilio/connect-agent/route.js** - Twilio connect agent route
17. **app/api/twilio/join-conference/route.js** - Twilio join conference route
18. **app/api/twilio/recording-callback/route.js** - Twilio recording callback
19. **app/api/twilio/token/route.js** - Twilio token generation route
20. **app/api/twilio/transfer-voice-response/route.js** - Twilio transfer voice response
21. **app/api/twilio/voice-response/route.js** - Twilio voice response route
22. **app/api/twilio/warm-transfer-voice/route.js** - Twilio warm transfer voice route
23. **app/api/twilio/agent-voice-response/** - Directory (empty or route.js exists)
24. **app/api/twilio/conference-wait/** - Directory (empty or route.js exists)

## API Routes - Users

25. **app/api/users/[id]/call-logs/route.js** - Get user call logs (Admin only)

## Libraries/Utilities

26. **lib/twilio.js** - Twilio client and utility functions
27. **lib/useCallStatus.js** - React hook for call status management

## Migrations

28. **migrations/20251011000000-create-call-logs-table.js** - Migration to create call logs table
29. **migrations/20251201220706-create-call-transfers-table.js** - Migration to create call transfers table

## Debug/Test Files

30. **debug-call-flow.js** - Debug script for call flow
31. **test-twilio.js** - Test script for Twilio integration

## Documentation

32. **TWILIO-SETUP.md** - Twilio setup documentation
33. **TWILIO-JWT-ERROR-FIX.md** - Twilio JWT error fix documentation
34. **TWILIO-TWIML-APP-SETUP.md** - Twilio TwiML app setup documentation
35. **README-SimpleDialer.md** - Simple dialer documentation

## Other Files Using Call Functionality

36. **components/UserDetailsModal.js** - Uses call logs
37. **lib/sequelize-db.js** - Database connection (used by call models)

---

**Total: 37+ files related to call functionality**

## Summary by Category

- **Components**: 4 files
- **Models**: 3 files
- **API Routes (Calls)**: 6 files
- **API Routes (Twilio)**: 11+ files
- **API Routes (Users)**: 1 file
- **Libraries**: 2 files
- **Migrations**: 2 files
- **Debug/Test**: 2 files
- **Documentation**: 4 files
- **Other**: 2 files

