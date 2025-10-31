# ✅ Correct API Endpoints Reference

## Base URL
```
http://localhost:5000/api
```

## Message & Conversation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | Get all user's conversations |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:conversationId/messages` | Get messages in conversation |
| POST | `/api/messages` | Send a message |
| PUT | `/api/conversations/:conversationId/read` | Mark conversation as read |
| DELETE | `/api/messages/:messageId` | Delete a message |
| GET | `/api/unread-count` | Get unread message count |
| GET | `/api/can-message/:userId` | Check if can message user |

---

## ❌ Wrong URLs (Your Frontend is Using These)

```javascript
// WRONG ❌
GET  /api/messages/conversations
GET  /api/messages/unread-count
```

## ✅ Correct URLs (Fix Your Frontend)

```javascript
// CORRECT ✅
GET  /api/conversations
GET  /api/unread-count
```

---

## Frontend Code Fix Examples

### React/Axios Example

**Before (Wrong):**
```javascript
// ❌ WRONG
const response = await axios.get('http://localhost:5000/api/messages/conversations', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**After (Correct):**
```javascript
// ✅ CORRECT
const response = await axios.get('http://localhost:5000/api/conversations', {
  headers: { Authorization: `Bearer ${token}` }
});
```

### Fetch API Example

**Before (Wrong):**
```javascript
// ❌ WRONG
fetch('http://localhost:5000/api/messages/unread-count', {
  headers: { Authorization: `Bearer ${token}` }
})
```

**After (Correct):**
```javascript
// ✅ CORRECT
fetch('http://localhost:5000/api/unread-count', {
  headers: { Authorization: `Bearer ${token}` }
})
```

---

## Complete API Reference

### 1. Get User's Conversations

```http
GET /api/conversations
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "conversation-uuid",
      "other_user": {
        "id": "user-uuid",
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@test.com",
        "role": "entrepreneur"
      },
      "last_message": {
        "content": "Hello!",
        "created_at": "2025-10-31T12:00:00Z",
        "sender_id": "user-uuid"
      },
      "unread_count": 3,
      "last_message_at": "2025-10-31T12:00:00Z"
    }
  ]
}
```

### 2. Get Unread Count

```http
GET /api/unread-count
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "unreadCount": 5
}
```

### 3. Get Messages from Conversation

```http
GET /api/conversations/:conversationId/messages?limit=50&offset=0
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-uuid",
      "sender_id": "user-uuid",
      "receiver_id": "user-uuid",
      "content": "Hello!",
      "is_read": true,
      "created_at": "2025-10-31T12:00:00Z",
      "sender": {
        "first_name": "John",
        "last_name": "Doe",
        "role": "entrepreneur"
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 10
  }
}
```

### 4. Send Message

```http
POST /api/messages
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "receiverId": "user-uuid",
  "content": "Hello, how are you?",
  "jobId": "job-uuid-optional"
}
```

**Response:**
```json
{
  "message": "Message sent successfully",
  "data": {
    "id": "new-msg-uuid",
    "conversation_id": "conv-uuid",
    "sender_id": "your-uuid",
    "receiver_id": "receiver-uuid",
    "content": "Hello, how are you?",
    "is_read": false,
    "created_at": "2025-10-31T12:00:00Z"
  }
}
```

### 5. Start New Conversation

```http
POST /api/conversations
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "otherUserId": "user-uuid",
  "jobId": "job-uuid-optional"
}
```

### 6. Check If Can Message User

```http
GET /api/can-message/:userId
Authorization: Bearer YOUR_JWT_TOKEN
```

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

### 7. Mark Conversation as Read

```http
PUT /api/conversations/:conversationId/read
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "message": "Messages marked as read"
}
```

### 8. Delete Message

```http
DELETE /api/messages/:messageId
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "message": "Message deleted successfully"
}
```

---

## Testing in Postman

### Step 1: Login
```
POST http://localhost:5000/api/auth/login
Body: {"email": "manager1@test.com", "password": "password123"}
```

### Step 2: Copy Token

### Step 3: Get Conversations (Correct URL)
```
GET http://localhost:5000/api/conversations
Headers: Authorization: Bearer YOUR_TOKEN
```

### Step 4: Get Unread Count (Correct URL)
```
GET http://localhost:5000/api/unread-count
Headers: Authorization: Bearer YOUR_TOKEN
```

---

## Common Frontend API Service Structure

```javascript
// src/services/messageService.js
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const getAuthHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

export const messageService = {
  // Get conversations
  getConversations: () =>
    axios.get(`${API_URL}/conversations`, { headers: getAuthHeader() }),

  // Get unread count
  getUnreadCount: () =>
    axios.get(`${API_URL}/unread-count`, { headers: getAuthHeader() }),

  // Get messages from conversation
  getMessages: (conversationId, limit = 50, offset = 0) =>
    axios.get(`${API_URL}/conversations/${conversationId}/messages`, {
      headers: getAuthHeader(),
      params: { limit, offset }
    }),

  // Send message
  sendMessage: (receiverId, content, jobId = null) =>
    axios.post(`${API_URL}/messages`,
      { receiverId, content, jobId },
      { headers: getAuthHeader() }
    ),

  // Start conversation
  startConversation: (otherUserId, jobId = null) =>
    axios.post(`${API_URL}/conversations`,
      { otherUserId, jobId },
      { headers: getAuthHeader() }
    ),

  // Mark as read
  markAsRead: (conversationId) =>
    axios.put(`${API_URL}/conversations/${conversationId}/read`,
      {},
      { headers: getAuthHeader() }
    ),

  // Check if can message
  canMessage: (userId) =>
    axios.get(`${API_URL}/can-message/${userId}`, { headers: getAuthHeader() }),

  // Delete message
  deleteMessage: (messageId) =>
    axios.delete(`${API_URL}/messages/${messageId}`, { headers: getAuthHeader() })
};
```

---

## Where to Fix in Your Frontend

Look for these files in your frontend codebase:

1. **API Service Files**
   - `src/services/messageService.js`
   - `src/services/api.js`
   - `src/utils/api.js`

2. **Component Files**
   - Message/Chat components
   - Conversation list components

3. **Search for these strings in your frontend:**
   ```bash
   grep -r "/api/messages/conversations" src/
   grep -r "/api/messages/unread-count" src/
   ```

4. **Replace with:**
   - `/api/messages/conversations` → `/api/conversations`
   - `/api/messages/unread-count` → `/api/unread-count`

---

## Summary

**Root Cause:** Frontend is using incorrect endpoint paths with `/api/messages/` prefix.

**Solution:** Remove `/messages` from the path:
- ❌ `/api/messages/conversations`
- ✅ `/api/conversations`

**Files to Update:** Your frontend API service or component files making these API calls.
