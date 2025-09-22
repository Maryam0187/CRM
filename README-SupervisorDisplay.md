# Supervisor Display & Management Feature

## Overview
This feature provides supervisor-agent relationship functionality:
1. Displays supervisor's name for agent users on the dashboard
2. Provides supervisor interface to view sales data for supervised agents
3. Allows supervisors to toggle between agent sales and their own sales

## Implementation Details

### 1. Database Structure
- Uses the existing `supervisor_agents` table to link supervisors and agents
- Relationship: One supervisor can supervise multiple agents
- Each agent can have one supervisor (based on current implementation)

### 2. API Changes
**Updated: `/app/api/auth/signin/route.js`**
- Modified to fetch supervisor information when user logs in
- Only fetches supervisor data for users with role = 'agent'
- Includes supervisor's basic info (id, firstName, lastName, email)

### 3. UI Changes
**Updated: `/components/Home.js`**
- Shows supervisor name for agents below welcome message
- Provides supervisor interface with agent selection buttons
- Includes "Me" button for supervisors to view their own sales
- Real-time switching between different agents' sales data
- Visual indicators for currently selected view

### 4. Service Layer
**Updated: `/lib/sequelize-db.js`**
- Added `findByEmailWithSupervisor()` method to UserService
- Leverages existing SupervisorAgentService functions

## Usage

### For Agents with Supervisors:
When an agent logs in, they will see their supervisor's name displayed below the welcome message:
```
My Sales Dashboard
Welcome back, John! Here's your sales performance and activities.
Your Supervisor: Mike Supervisor
```

### For Supervisors:
When a supervisor logs in, they see an agent selection interface:
```
My Sales Dashboard
Welcome back, Mike! Here's your sales performance and activities.

View sales for: [Me (Mike)] [John Agent] [Sarah Agent]
Showing sales data for John Agent
```

- **Me Button**: Shows supervisor's own sales data (blue when selected)
- **Agent Buttons**: Shows selected agent's sales data (green when selected)
- **Current View Indicator**: Shows whose data is currently displayed

### For Agents without Supervisors:
No supervisor information is displayed - only standard user info shows.

### For Other Roles:
Standard dashboard view without supervisor-specific features.

## Testing

### Test Accounts (from seeder data):
- **John Agent**: `john.agent@crm.com` (supervised by Mike Supervisor)
- **Sarah Agent**: `sarah.agent@crm.com` (supervised by Mike Supervisor)  
- **Independent Agent**: `independent.agent@crm.com` (no supervisor)
- **Mike Supervisor**: `supervisor@crm.com` (supervises John & Sarah)

Password for all test accounts: `password123`

### Expected Behavior:
1. **John and Sarah** should see "Your Supervisor: Mike Supervisor" below welcome message
2. **Mike Supervisor** should see agent selection interface with John and Sarah buttons
3. **Independent Agent** should NOT see any supervisor information
4. **Admin** should see standard dashboard without supervisor features

### Supervisor Interface Features:
- **Default View**: First supervised agent is automatically selected
- **Me Button**: Blue background when showing supervisor's own sales
- **Agent Buttons**: Green background when showing selected agent's sales
- **Dynamic Loading**: Sales data updates automatically when switching between agents
- **Status Indicator**: Clear text showing whose data is currently displayed

## API Endpoints

### Get Supervisor-Agent Relationships:
```
GET /api/supervisor-agents?agentId=3
GET /api/supervisor-agents?supervisorId=2
```

### Create Supervisor-Agent Relationship:
```
POST /api/supervisor-agents
{
  "supervisorId": 2,
  "agentId": 3
}
```

### Remove Supervisor-Agent Relationship:
```
DELETE /api/supervisor-agents?supervisorId=2&agentId=3
```

## Database Seeding

To seed the database with test data including supervisor relationships:
```bash
npm run db:seed
```

This will create the test users and supervisor-agent relationships described above.
