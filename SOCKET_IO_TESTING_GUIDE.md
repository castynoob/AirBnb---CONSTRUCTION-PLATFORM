# Socket.IO Messaging - Complete Testing Guide

This guide will help you test your Socket.IO real-time messaging system end-to-end.

---

## Prerequisites

### 1. Seed Test Data

First, run the seed script to create test users with proper relationships:

```bash
cd /Users/jordandavecaparas/Documents/work&latest/AirBnb---CONSTRUCTION-PLATFORM
node scripts/seed-messaging-test-data.js
```

This creates 9 test users across 4 roles with pre-configured messaging permissions.

### 2. Start Your Server

```bash
npm start
```

Expected console output:
```
🚀 Server running on http://0.0.0.0:5000
💬 Socket.io ready for real-time messaging
✓ PostgreSQL Connected
✓ Redis Connected
```

---

## Test Users & Credentials

All passwords are: **password123**

### Property Managers
- `manager1@test.com` - Sarah Johnson
- `manager2@test.com` - Mike Davis

### Entrepreneurs
- `entrepreneur1@test.com` - Alex Martinez (has approved bid with manager1)
- `entrepreneur2@test.com` - Jamie Lee (has approved bid with manager2)

### Residents
- `resident1@test.com` - Emma Wilson
- `resident2@test.com` - Chris Taylor
- `resident3@test.com` - Jordan Smith

### Suppliers
- `supplier1@test.com` - Morgan Brown
- `supplier2@test.com` - Casey Garcia

---

## Messaging Rules Refresher

| From | To | Allowed? | Condition |
|------|-----|----------|-----------|
| Property Manager | Resident | ✅ Always | - |
| Resident | Property Manager | ✅ Always | - |
| Resident | Resident | ✅ Always | - |
| Entrepreneur | Supplier | ✅ Always | - |
| Supplier | Entrepreneur | ✅ Always | - |
| Entrepreneur | Property Manager | ✅ Conditional | Approved bid must exist |
| Property Manager | Entrepreneur | ✅ Conditional | Approved bid must exist |
| Any other | Any other | ❌ Never | - |

---

## Part 1: HTTP REST API Testing (Postman)

### Step 1: Login

**Endpoint:** `POST http://localhost:5000/api/auth/login`

**Body (JSON):**
```json
{
  "email": "manager1@test.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-here",
    "email": "manager1@test.com",
    "role": "property_manager"
  }
}
```

**Copy the token!** You'll need it for all subsequent requests.

---

### Step 2: Get Your Conversations

**Endpoint:** `GET http://localhost:5000/api/conversations`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "conversation-uuid",
      "other_user": {
        "id": "user-uuid",
        "first_name": "Emma",
        "last_name": "Wilson",
        "email": "resident1@test.com",
        "role": "resident"
      },
      "last_message": {
        "content": "Yes, I'll be home between 9 AM and 12 PM. Thank you!",
        "created_at": "2025-10-31T12:03:00.000Z",
        "sender_id": "uuid"
      },
      "unread_count": 0,
      "last_message_at": "2025-10-31T12:03:00.000Z"
    }
  ]
}
```

---

### Step 3: Get Messages from a Conversation

**Endpoint:** `GET http://localhost:5000/api/conversations/:conversationId/messages`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters (optional):**
- `limit` - Number of messages (default: 50)
- `offset` - Skip messages (default: 0)

**Example:** `GET http://localhost:5000/api/conversations/abc-123/messages?limit=20&offset=0`

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid-1",
      "conversation_id": "conv-uuid",
      "sender_id": "user-uuid",
      "receiver_id": "user-uuid",
      "content": "Hi! I received your maintenance request.",
      "is_read": true,
      "read_at": "2025-10-31T12:01:00.000Z",
      "created_at": "2025-10-31T12:00:00.000Z",
      "sender": {
        "first_name": "Sarah",
        "last_name": "Johnson",
        "role": "property_manager"
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 4
  }
}
```

---

### Step 4: Send a Message (HTTP)

**Endpoint:** `POST http://localhost:5000/api/messages`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body:**
```json
{
  "receiverId": "uuid-of-receiver",
  "content": "Hello! This is a test message via HTTP API.",
  "jobId": "optional-job-uuid"
}
```

**Response:**
```json
{
  "message": "Message sent successfully",
  "data": {
    "id": "new-message-uuid",
    "conversation_id": "conv-uuid",
    "sender_id": "your-uuid",
    "receiver_id": "receiver-uuid",
    "content": "Hello! This is a test message via HTTP API.",
    "is_read": false,
    "created_at": "2025-10-31T12:30:00.000Z"
  }
}
```

---

### Step 5: Check If You Can Message Someone

**Endpoint:** `GET http://localhost:5000/api/can-message/:otherUserId`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Example:** `GET http://localhost:5000/api/can-message/resident-user-uuid`

**Response (Allowed):**
```json
{
  "canMessage": true
}
```

**Response (Not Allowed):**
```json
{
  "canMessage": false,
  "message": "You are not authorized to message this user"
}
```

---

### Step 6: Get Unread Count

**Endpoint:** `GET http://localhost:5000/api/unread-count`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response:**
```json
{
  "unreadCount": 5
}
```

---

## Part 2: Socket.IO Real-Time Testing

### Option A: Using Postman (Desktop App Only)

Postman Desktop has Socket.IO support.

#### Step 1: Create Socket.IO Request

1. Click "New" → "Socket.IO Request"
2. Enter URL: `http://localhost:5000`
3. Click "Connect"

#### Step 2: Authenticate

Before connecting, add authentication:

1. Click "Events" tab
2. Under "Event name" enter: `connect`
3. Under "Arguments" (JSON):
```json
{
  "auth": {
    "token": "YOUR_JWT_TOKEN_HERE"
  }
}
```

4. Click "Connect"

If successful, you'll see: `Connected to http://localhost:5000`

#### Step 3: Join a Conversation

1. Click "Events" tab
2. Add new event:
   - **Event name:** `join_conversation`
   - **Arguments:**
   ```json
   "conversation-uuid-here"
   ```

3. Click "Send"

Server console should show:
```
👥 User [your-uuid] joined conversation [conversation-uuid]
```

#### Step 4: Send a Message

1. Add new event:
   - **Event name:** `send_message`
   - **Arguments:**
   ```json
   {
     "receiverId": "receiver-user-uuid",
     "content": "Hello from Socket.IO!",
     "conversationId": "conversation-uuid",
     "jobId": null
   }
   ```

2. Click "Send"

#### Step 5: Listen for Events

In the "Listeners" tab, add these events to listen for:

- `new_message` - Receive new messages in the conversation
- `message_sent` - Confirmation your message was sent
- `message_notification` - Notification of new message
- `messages_read` - Someone read messages
- `user_typing` - Someone is typing
- `user_stopped_typing` - Someone stopped typing

You'll see responses like:
```json
{
  "event": "new_message",
  "data": {
    "message": {
      "id": "msg-uuid",
      "content": "Hello from Socket.IO!",
      "sender_id": "your-uuid",
      "created_at": "2025-10-31T12:45:00.000Z"
    }
  }
}
```

---

### Option B: Using Browser Console

#### Step 1: Create Test HTML File

Create `/Users/jordandavecaparas/Documents/work&latest/AirBnb---CONSTRUCTION-PLATFORM/test-socket.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Socket.IO Test Client</title>
    <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
</head>
<body>
    <h1>Socket.IO Messaging Test</h1>

    <div>
        <h3>Connection</h3>
        <input type="text" id="token" placeholder="Paste JWT token here" style="width: 500px">
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
        <p id="status">Not connected</p>
    </div>

    <div>
        <h3>Join Conversation</h3>
        <input type="text" id="conversationId" placeholder="Conversation UUID">
        <button onclick="joinConversation()">Join</button>
    </div>

    <div>
        <h3>Send Message</h3>
        <input type="text" id="receiverId" placeholder="Receiver User UUID"><br>
        <input type="text" id="messageContent" placeholder="Message content"><br>
        <input type="text" id="convoId" placeholder="Conversation UUID"><br>
        <button onclick="sendMessage()">Send</button>
    </div>

    <div>
        <h3>Typing Indicators</h3>
        <input type="text" id="typingConvoId" placeholder="Conversation UUID">
        <button onclick="startTyping()">Start Typing</button>
        <button onclick="stopTyping()">Stop Typing</button>
    </div>

    <div>
        <h3>Messages Received</h3>
        <div id="messages" style="border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: scroll;"></div>
    </div>

    <script>
        let socket;

        function connect() {
            const token = document.getElementById('token').value;

            socket = io('http://localhost:5000', {
                auth: {
                    token: token
                }
            });

            socket.on('connect', () => {
                document.getElementById('status').textContent = 'Connected! ✅';
                console.log('✅ Connected to server');
            });

            socket.on('disconnect', () => {
                document.getElementById('status').textContent = 'Disconnected ❌';
                console.log('❌ Disconnected from server');
            });

            socket.on('connect_error', (error) => {
                document.getElementById('status').textContent = 'Error: ' + error.message;
                console.error('Connection error:', error);
            });

            // Listen for new messages
            socket.on('new_message', (data) => {
                console.log('📩 New message:', data);
                addMessage('NEW MESSAGE', data);
            });

            socket.on('message_sent', (data) => {
                console.log('✅ Message sent:', data);
                addMessage('MESSAGE SENT', data);
            });

            socket.on('message_notification', (data) => {
                console.log('🔔 Notification:', data);
                addMessage('NOTIFICATION', data);
            });

            socket.on('messages_read', (data) => {
                console.log('📖 Messages read:', data);
                addMessage('MESSAGES READ', data);
            });

            socket.on('user_typing', (data) => {
                console.log('⌨️ User typing:', data);
                addMessage('TYPING', data);
            });

            socket.on('user_stopped_typing', (data) => {
                console.log('⌨️ Stopped typing:', data);
                addMessage('STOPPED TYPING', data);
            });
        }

        function disconnect() {
            if (socket) {
                socket.disconnect();
            }
        }

        function joinConversation() {
            const conversationId = document.getElementById('conversationId').value;
            socket.emit('join_conversation', conversationId);
            addMessage('SYSTEM', `Joined conversation: ${conversationId}`);
        }

        function sendMessage() {
            const receiverId = document.getElementById('receiverId').value;
            const content = document.getElementById('messageContent').value;
            const conversationId = document.getElementById('convoId').value;

            socket.emit('send_message', {
                receiverId,
                content,
                conversationId,
                jobId: null
            });
        }

        function startTyping() {
            const conversationId = document.getElementById('typingConvoId').value;
            socket.emit('typing_start', { conversationId });
        }

        function stopTyping() {
            const conversationId = document.getElementById('typingConvoId').value;
            socket.emit('typing_stop', { conversationId });
        }

        function addMessage(type, data) {
            const messagesDiv = document.getElementById('messages');
            const messageEl = document.createElement('div');
            messageEl.style.marginBottom = '10px';
            messageEl.style.padding = '5px';
            messageEl.style.background = '#f0f0f0';
            messageEl.innerHTML = `<strong>${type}:</strong> ${JSON.stringify(data, null, 2)}`;
            messagesDiv.appendChild(messageEl);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    </script>
</body>
</html>
```

#### Step 2: Open in Browser

1. Open the HTML file in your browser
2. Paste your JWT token (from login response)
3. Click "Connect"
4. Use the form to test different features

---

### Option C: Using Node.js Script

Create `/Users/jordandavecaparas/Documents/work&latest/AirBnb---CONSTRUCTION-PLATFORM/test-socket-client.js`:

```javascript
import { io } from 'socket.io-client';
import readline from 'readline';

// PASTE YOUR TOKEN HERE
const TOKEN = 'eyJhbGciOiJIUzI1NiIs...';

const socket = io('http://localhost:5000', {
    auth: {
        token: TOKEN
    }
});

socket.on('connect', () => {
    console.log('✅ Connected to server');
    console.log('Socket ID:', socket.id);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
});

// Listen for events
socket.on('new_message', (data) => {
    console.log('\n📩 NEW MESSAGE:', data);
});

socket.on('message_sent', (data) => {
    console.log('\n✅ MESSAGE SENT:', data);
});

socket.on('message_notification', (data) => {
    console.log('\n🔔 NOTIFICATION:', data);
});

socket.on('messages_read', (data) => {
    console.log('\n📖 MESSAGES READ:', data);
});

socket.on('user_typing', (data) => {
    console.log('\n⌨️  USER TYPING:', data);
});

socket.on('user_stopped_typing', (data) => {
    console.log('\n⌨️  STOPPED TYPING:', data);
});

// Interactive CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n=================================');
console.log('Socket.IO Test Client');
console.log('=================================\n');
console.log('Commands:');
console.log('  join <conversationId>');
console.log('  send <receiverId> <conversationId> <message>');
console.log('  typing <conversationId>');
console.log('  stop-typing <conversationId>');
console.log('  quit\n');

rl.on('line', (input) => {
    const [command, ...args] = input.trim().split(' ');

    switch (command) {
        case 'join':
            socket.emit('join_conversation', args[0]);
            console.log(`Joined conversation: ${args[0]}`);
            break;

        case 'send':
            const [receiverId, conversationId, ...messageParts] = args;
            const message = messageParts.join(' ');
            socket.emit('send_message', {
                receiverId,
                conversationId,
                content: message,
                jobId: null
            });
            console.log('Message sent!');
            break;

        case 'typing':
            socket.emit('typing_start', { conversationId: args[0] });
            console.log('Typing started');
            break;

        case 'stop-typing':
            socket.emit('typing_stop', { conversationId: args[0] });
            console.log('Typing stopped');
            break;

        case 'quit':
            socket.disconnect();
            rl.close();
            process.exit(0);
            break;

        default:
            console.log('Unknown command');
    }
});
```

**Run it:**
```bash
node test-socket-client.js
```

---

## Full Test Scenario

### Scenario: Manager and Resident Messaging

**Users:**
- Manager: `manager1@test.com`
- Resident: `resident1@test.com`

**Steps:**

1. **Login as Manager** (Postman)
   ```
   POST /api/auth/login
   Body: {"email": "manager1@test.com", "password": "password123"}
   ```
   Copy manager token.

2. **Login as Resident** (Another Postman tab or browser)
   ```
   POST /api/auth/login
   Body: {"email": "resident1@test.com", "password": "password123"}
   ```
   Copy resident token.

3. **Get Conversation ID** (Manager)
   ```
   GET /api/conversations
   Headers: Authorization: Bearer MANAGER_TOKEN
   ```
   Copy the conversation ID with resident1.

4. **Connect Socket (Manager)**
   - Open test HTML in browser 1
   - Paste manager token
   - Click "Connect"
   - Enter conversation ID
   - Click "Join"

5. **Connect Socket (Resident)**
   - Open test HTML in browser 2
   - Paste resident token
   - Click "Connect"
   - Enter same conversation ID
   - Click "Join"

6. **Send Message (Manager)**
   - In browser 1, fill in:
     - Receiver ID: resident user UUID
     - Message: "Testing real-time messaging!"
     - Conversation ID: the conversation UUID
   - Click "Send"

7. **Verify Receipt (Resident)**
   - Browser 2 should show `new_message` event
   - Message should appear in "Messages Received" section

8. **Test Typing Indicators (Resident)**
   - In browser 2, enter conversation ID
   - Click "Start Typing"
   - Browser 1 should show `user_typing` event

9. **Mark as Read (Resident)**
   - Use Postman with resident token:
   ```
   PUT /api/conversations/:conversationId/read
   ```
   - Both browsers should see `messages_read` event

---

## Troubleshooting

### "Authentication error: No token provided"

**Solution:** Make sure you're passing the token in the Socket.IO connection:
```javascript
io('http://localhost:5000', {
    auth: { token: 'YOUR_TOKEN' }
})
```

### "Not authorized to message this user"

**Solution:** Check the messaging rules matrix. Example:
- Entrepreneur can only message Manager if approved bid exists
- Run seed script to create approved bids

### Messages not appearing in real-time

**Solution:**
1. Both users must join the conversation room first
2. Check server console for errors
3. Verify Socket.IO connection is active (green in Postman)

### "Cannot find conversation"

**Solution:** Create conversation first via HTTP:
```
POST /api/conversations
Body: {"otherUserId": "user-uuid"}
```

---

## Quick Reference: Socket.IO Events

### Emit (Client → Server)

| Event | Arguments | Description |
|-------|-----------|-------------|
| `join_conversation` | `conversationId` (string) | Join a conversation room |
| `leave_conversation` | `conversationId` (string) | Leave a conversation room |
| `send_message` | `{receiverId, content, conversationId, jobId}` | Send a message |
| `mark_as_read` | `{conversationId}` | Mark messages as read |
| `typing_start` | `{conversationId}` | Start typing indicator |
| `typing_stop` | `{conversationId}` | Stop typing indicator |

### Listen (Server → Client)

| Event | Data | Description |
|-------|------|-------------|
| `new_message` | `{message}` | New message in conversation |
| `message_sent` | `{message}` | Confirmation of sent message |
| `message_notification` | `{conversationId, senderId}` | Notification of new message |
| `messages_read` | `{conversationId, readBy}` | Messages marked as read |
| `user_typing` | `{conversationId, userId}` | User started typing |
| `user_stopped_typing` | `{conversationId, userId}` | User stopped typing |

---

**Happy Testing! 🚀💬**
