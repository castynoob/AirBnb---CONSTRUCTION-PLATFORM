# Socket.IO Messaging - Setup Summary

## What Was Done

### 1. ✅ Bug Fix
**File:** [src/config/socketSetup.js](src/config/socketSetup.js:137)

**Fixed:** Method name mismatch in `mark_as_read` event handler
```javascript
// BEFORE (broken):
await messageModel.markConversationAsRead(conversationId, socket.userId);

// AFTER (fixed):
await messageModel.markMessagesAsRead(conversationId, socket.userId);
```

This bug would have caused the Socket.IO `mark_as_read` event to crash.

---

### 2. 📊 Test Data Seed Script Created
**File:** [scripts/seed-messaging-test-data.js](scripts/seed-messaging-test-data.js)

**What it creates:**
- 9 test users across 4 roles (Manager, Entrepreneur, Resident, Supplier)
- 2 properties with jobs
- 2 approved bids (enables Entrepreneur ↔ Manager messaging)
- 3 pre-populated conversations with realistic messages

**How to run:**
```bash
node scripts/seed-messaging-test-data.js
```

**Test user credentials:**
All passwords: `password123`

| Email | Name | Role |
|-------|------|------|
| manager1@test.com | Sarah Johnson | Property Manager |
| manager2@test.com | Mike Davis | Property Manager |
| entrepreneur1@test.com | Alex Martinez | Entrepreneur |
| entrepreneur2@test.com | Jamie Lee | Entrepreneur |
| resident1@test.com | Emma Wilson | Resident |
| resident2@test.com | Chris Taylor | Resident |
| resident3@test.com | Jordan Smith | Resident |
| supplier1@test.com | Morgan Brown | Supplier |
| supplier2@test.com | Casey Garcia | Supplier |

---

### 3. 📚 Comprehensive Documentation Created

#### A. [SOCKET_IO_TESTING_GUIDE.md](SOCKET_IO_TESTING_GUIDE.md)
Complete guide for testing Socket.IO messaging with:
- HTTP REST API testing (Postman)
- Socket.IO real-time testing (3 methods: Postman, Browser, Node.js)
- Full test scenarios
- Event reference
- Troubleshooting

#### B. Test Client Files
**HTML Test Client:** `test-socket.html` (ready to use in browser)
**Node.js Test Client:** `test-socket-client.js` (CLI testing tool)

Both included in the guide with copy-paste ready code.

---

## How Your Messaging System Works

### Authorization Rules

```
✅ ALWAYS ALLOWED:
   - Property Manager ↔ Resident
   - Resident ↔ Resident
   - Entrepreneur ↔ Supplier

✅ CONDITIONALLY ALLOWED (requires approved bid):
   - Entrepreneur ↔ Property Manager

❌ ALL OTHER COMBINATIONS BLOCKED
```

### Database Tables

**conversations**
- Links two users (participant1_id, participant2_id)
- Optionally linked to a job
- Tracks last message timestamp

**messages**
- Individual messages in a conversation
- Tracks read status and timestamps
- Links sender, receiver, and conversation

### Socket.IO Architecture

**Rooms:**
1. **Personal rooms** - User's UUID (for notifications)
2. **Conversation rooms** - Conversation UUID (for real-time chat)

**Events:**
- `send_message` - Send message
- `new_message` - Receive message (broadcast to room)
- `message_sent` - Confirmation (to sender only)
- `message_notification` - Notification (to receiver's personal room)
- `mark_as_read` - Mark as read
- `messages_read` - Broadcast read receipt
- `typing_start/stop` - Typing indicators

---

## Quick Start Testing

### Step 1: Run Seed Script
```bash
cd /Users/jordandavecaparas/Documents/work&latest/AirBnb---CONSTRUCTION-PLATFORM
node scripts/seed-messaging-test-data.js
```

### Step 2: Start Server
```bash
npm start
```

### Step 3: Login (Postman)
```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "manager1@test.com",
  "password": "password123"
}
```

Copy the `token` from response.

### Step 4: Get Conversations
```http
GET http://localhost:5000/api/conversations
Authorization: Bearer YOUR_TOKEN
```

### Step 5: Test Socket.IO (Choose one method)

**Option A: Browser**
1. Copy `test-socket.html` from testing guide
2. Open in browser
3. Paste token, click Connect

**Option B: Postman Desktop**
1. New → Socket.IO Request
2. URL: `http://localhost:5000`
3. Add auth token in connection settings

**Option C: Node.js CLI**
1. Copy `test-socket-client.js` from testing guide
2. Run: `node test-socket-client.js`

---

## API Endpoints Available

### HTTP REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations` | List your conversations |
| POST | `/api/conversations` | Start new conversation |
| GET | `/api/conversations/:id/messages` | Get messages (paginated) |
| POST | `/api/messages` | Send message (HTTP) |
| PUT | `/api/conversations/:id/read` | Mark as read |
| DELETE | `/api/messages/:id` | Delete message |
| GET | `/api/unread-count` | Get unread count |
| GET | `/api/can-message/:userId` | Check if can message user |

### Socket.IO Events

**Emit (Client → Server):**
- `join_conversation`
- `leave_conversation`
- `send_message`
- `mark_as_read`
- `typing_start`
- `typing_stop`

**Listen (Server → Client):**
- `new_message`
- `message_sent`
- `message_notification`
- `messages_read`
- `user_typing`
- `user_stopped_typing`

---

## File Locations

**Backend Code:**
- Socket.IO setup: [src/config/socketSetup.js](src/config/socketSetup.js)
- Message model: [src/models/messageModel.js](src/models/messageModel.js)
- Message controller: [src/controllers/messageController.js](src/controllers/messageController.js)
- Message routes: [src/routes/messageRoutes.js](src/routes/messageRoutes.js)
- Database schema: [scripts/add-messaging-tables.sql](scripts/add-messaging-tables.sql)

**Seed & Test:**
- Seed script: [scripts/seed-messaging-test-data.js](scripts/seed-messaging-test-data.js)
- Testing guide: [SOCKET_IO_TESTING_GUIDE.md](SOCKET_IO_TESTING_GUIDE.md)

---

## Pre-Configured Test Scenarios

The seed script creates these ready-to-test conversations:

### 1. Manager ↔ Resident
**Users:** manager1@test.com & resident1@test.com
**Messages:** 4 messages about maintenance request
**Status:** Pre-configured and ready

### 2. Resident ↔ Resident
**Users:** resident1@test.com & resident2@test.com
**Messages:** 4 messages about community meeting
**Status:** Pre-configured and ready

### 3. Entrepreneur ↔ Supplier
**Users:** entrepreneur1@test.com & supplier1@test.com
**Messages:** 4 messages about supply order
**Status:** Pre-configured and ready

### 4. Entrepreneur ↔ Manager (via Approved Bid)
**Users:** entrepreneur1@test.com & manager1@test.com
**Bid Status:** APPROVED (allows messaging)
**Status:** Ready to test (no pre-existing messages)

---

## Testing Checklist

- [ ] Seed script runs successfully
- [ ] Server starts without errors
- [ ] Can login with test accounts
- [ ] Can retrieve conversations via API
- [ ] Can send message via HTTP POST
- [ ] Socket.IO connects with JWT token
- [ ] Can join conversation room
- [ ] Real-time message appears in both clients
- [ ] Typing indicators work
- [ ] Read receipts update correctly
- [ ] Unread count increments/decrements
- [ ] Cannot message unauthorized users

---

## Common Issues & Solutions

### Issue: "Not authorized to message this user"
**Solution:** Make sure you're testing with users who have permission (see authorization rules above). Entrepreneur ↔ Manager requires approved bid.

### Issue: Socket.IO won't connect
**Solution:**
1. Check JWT token is valid (not expired)
2. Pass token in `auth` object: `{auth: {token: 'YOUR_TOKEN'}}`
3. Check CORS settings in server

### Issue: Messages not appearing in real-time
**Solution:**
1. Both users must join the conversation room first
2. Check browser console for Socket.IO errors
3. Verify server console shows "User joined conversation"

### Issue: Seed script fails
**Solution:**
1. Check database connection in `.env`
2. Ensure PostgreSQL is running
3. Check for table constraint violations

---

## Next Steps

1. **Test HTTP endpoints** using Postman (see testing guide)
2. **Test Socket.IO** using one of the three methods
3. **Test frontend integration** with your React/Vue/etc app
4. **Deploy to production** with environment variables configured

---

## Support Files Created

All files are in your project root:
- [SOCKET_IO_TESTING_GUIDE.md](SOCKET_IO_TESTING_GUIDE.md) - Complete testing guide
- [MESSAGING_SETUP_SUMMARY.md](MESSAGING_SETUP_SUMMARY.md) - This file
- [scripts/seed-messaging-test-data.js](scripts/seed-messaging-test-data.js) - Seed script

---

**Your messaging system is now fully configured and ready to test! 🚀💬**
