# Active Time and Inactive Time Calculation

## How It Works

### 1. **Session Creation**
Sessions are created in the `user_time_sessions` table when:

- **User Logs In** → Creates an `active` session (status='online')
  ```javascript
  UserTimeTracker.startSession(userId, 'online', loginTime)
  ```

- **User Changes Status** → Ends previous session, starts new session
  ```javascript
  UserTimeTracker.endOngoingSessions(userId, statusChangeTime)
  UserTimeTracker.startSession(userId, newStatus, statusChangeTime)
  ```

- **User Logs Out** → Ends active session, starts `inactive` session (status='offline')
  ```javascript
  UserTimeTracker.endOngoingSessions(userId, logoutTime)
  UserTimeTracker.startSession(userId, 'offline', logoutTime)
  ```

### 2. **Session Types**
- **Active Session**: `sessionType = 'active'` when `status = 'online'`
- **Inactive Session**: `sessionType = 'inactive'` when `status = 'offline'` or `'away'`

### 3. **Time Calculation Process**

#### When a Session Ends:
1. Calculate duration: `(endTime - startTime)` in seconds
2. Update daily log:
   - If `active` session → Add duration to `activeTimeSeconds`
   - If `inactive` session → Add duration to `inactiveTimeSeconds`

#### When Fetching Time Logs:
1. **Recalculate from all sessions** for the date
2. For each session:
   - If session has `endTime` → Use actual endTime
   - If session has no `endTime` (ongoing) → Use current time (`now`)
3. Sum up all durations:
   - Active sessions → Total `activeTimeSeconds`
   - Inactive sessions → Total `inactiveTimeSeconds`

### 4. **Daily Log Storage**
Results are stored in `user_daily_time_logs` table:
- `active_time_seconds`: Total active time for the day
- `inactive_time_seconds`: Total inactive time for the day
- `first_active_time`: First time user became active
- `last_active_time`: Last time user became active
- `login_count`: Number of logins for the day

## Example Scenario

**User Login at 9:00 AM** (Status: online)
- Creates active session: `startTime = 9:00 AM, endTime = null`

**User Changes Status at 10:30 AM** (Status: away)
- Ends active session: `endTime = 10:30 AM, duration = 90 minutes`
- Updates daily log: `activeTimeSeconds += 5400` (90 min * 60)
- Creates inactive session: `startTime = 10:30 AM, endTime = null`

**User Changes Status at 11:00 AM** (Status: online)
- Ends inactive session: `endTime = 11:00 AM, duration = 30 minutes`
- Updates daily log: `inactiveTimeSeconds += 1800` (30 min * 60)
- Creates active session: `startTime = 11:00 AM, endTime = null`

**User Logs Out at 5:00 PM**
- Ends active session: `endTime = 5:00 PM, duration = 6 hours`
- Updates daily log: `activeTimeSeconds += 21600` (6 hours * 3600)
- Creates inactive session: `startTime = 5:00 PM, endTime = null`

**Result**:
- `activeTimeSeconds` = 5400 + 21600 = 27000 seconds = 7.5 hours
- `inactiveTimeSeconds` = 1800 seconds = 30 minutes

## Why Values Might Be 0

1. **No Sessions Created**: User hasn't logged in or changed status since time tracking was implemented
2. **Sessions Not Ended**: Ongoing sessions haven't been closed yet (they're calculated using current time when viewing)
3. **Missing Recalculation**: Daily logs might not be recalculated from sessions
4. **Database Issue**: Sessions exist but daily log wasn't updated when sessions ended

## Debugging

Check these tables:

```sql
-- Check if sessions exist
SELECT * FROM user_time_sessions 
WHERE user_id = YOUR_USER_ID 
ORDER BY start_time DESC;

-- Check daily logs
SELECT * FROM user_daily_time_logs 
WHERE user_id = YOUR_USER_ID 
ORDER BY date DESC;

-- Check for ongoing sessions (not ended)
SELECT * FROM user_time_sessions 
WHERE user_id = YOUR_USER_ID 
AND end_time IS NULL;
```

## Fix for 0 Values

The API endpoint now automatically recalculates time logs when fetching them, which includes:
- All completed sessions (with endTime)
- Ongoing sessions (using current time)
- Summing up all active and inactive durations

This ensures accurate time tracking even if daily logs weren't updated when sessions ended.

