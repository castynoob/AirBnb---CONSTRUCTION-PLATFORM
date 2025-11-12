# Favorites API Documentation

Complete API reference for the Favorites feature in the Construction Platform.

## Overview

The Favorites system allows property managers to bookmark and track their preferred entrepreneurs across multiple jobs and bids. Each favorite can include optional notes and is linked to specific bids and jobs.

## Authentication

All favorites endpoints require:
- Valid JWT token in Authorization header
- Property Manager role only

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Add to Favorites

Add an entrepreneur to your favorites list.

**Endpoint:** `POST /api/favorites`

**Request Body:**
```json
{
  "entrepreneurId": "uuid",     // Required
  "jobId": "uuid",              // Optional
  "bidId": "uuid",              // Optional
  "notes": "string"             // Optional
}
```

**Success Response:** `201 Created`
```json
{
  "success": true,
  "message": "Entrepreneur added to favorites",
  "favorite": {
    "id": "uuid",
    "manager_id": "uuid",
    "entrepreneur_id": "uuid",
    "job_id": "uuid",
    "bid_id": "uuid",
    "notes": "Great work on kitchen renovation",
    "created_at": "2025-01-12T10:30:00Z"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Missing entrepreneurId
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Manager profile not found
- `500 Internal Server Error`

---

### 2. Get All Favorites

Retrieve all favorited entrepreneurs with detailed information.

**Endpoint:** `GET /api/favorites`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "count": 5,
  "favorites": [
    {
      "favorite_id": "uuid",
      "entrepreneur_id": "uuid",
      "company_name": "ABC Construction",
      "license_number": "LC-12345",
      "years_in_business": 10,
      "specializations": ["Plumbing", "Electrical"],
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@abc.com",
      "phone": "+1234567890",
      "average_rating": 4.5,
      "review_count": 23,
      "completed_jobs": 45,
      "subscription_plan": "premium",
      "subscription_status": "active",
      "last_job_title": "Kitchen Renovation",
      "last_job_category": "residential",
      "last_bid_amount": 15000,
      "bid_status": "approved",
      "notes": "Excellent work quality",
      "favorited_at": "2025-01-10T15:20:00Z"
    }
  ]
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Manager profile not found
- `500 Internal Server Error`

---

### 3. Remove from Favorites

Remove an entrepreneur from favorites by bid ID.

**Endpoint:** `DELETE /api/favorites/bid/:bidId`

**URL Parameters:**
- `bidId` (uuid) - The bid ID to remove from favorites

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Entrepreneur removed from favorites"
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Favorite not found or manager profile not found
- `500 Internal Server Error`

---

### 4. Check if Favorited

Check if a specific bid is in your favorites.

**Endpoint:** `GET /api/favorites/check/bid/:bidId`

**URL Parameters:**
- `bidId` (uuid) - The bid ID to check

**Success Response:** `200 OK`
```json
{
  "success": true,
  "isFavorited": true
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Manager profile not found
- `500 Internal Server Error`

---

### 5. Get Favorite Count

Get the total number of favorites.

**Endpoint:** `GET /api/favorites/count`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "count": 12
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Manager profile not found
- `500 Internal Server Error`

---

### 6. Get Entrepreneur Job History

Get all past jobs/bids with a specific entrepreneur.

**Endpoint:** `GET /api/favorites/:entrepreneurId/history`

**URL Parameters:**
- `entrepreneurId` (uuid) - The entrepreneur profile ID

**Success Response:** `200 OK`
```json
{
  "success": true,
  "count": 3,
  "history": [
    {
      "job_id": "uuid",
      "title": "Kitchen Renovation",
      "description": "Complete kitchen remodel",
      "category": "residential",
      "status": "completed",
      "created_at": "2024-12-01T10:00:00Z",
      "bid_amount": 15000,
      "bid_status": "approved",
      "bid_message": "I can start next week",
      "property_name": "Sunset Apartments",
      "property_address": "123 Main St",
      "property_city": "Los Angeles"
    }
  ]
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Manager profile not found
- `500 Internal Server Error`

---

### 7. Update Favorite Notes

Update your notes about a favorited entrepreneur.

**Endpoint:** `PATCH /api/favorites/:favoriteId/notes`

**URL Parameters:**
- `favoriteId` (uuid) - The favorite record ID

**Request Body:**
```json
{
  "notes": "Updated notes about this entrepreneur"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Notes updated successfully",
  "favorite": {
    "id": "uuid",
    "manager_id": "uuid",
    "entrepreneur_id": "uuid",
    "job_id": "uuid",
    "bid_id": "uuid",
    "notes": "Updated notes about this entrepreneur",
    "created_at": "2025-01-10T15:20:00Z"
  }
}
```

**Error Responses:**
- `403 Forbidden` - Not a property manager
- `404 Not Found` - Favorite not found or doesn't belong to this manager
- `500 Internal Server Error`

---

## Usage Examples

### Add Entrepreneur to Favorites (from Bid)

```javascript
const response = await fetch(`${API_URL}/api/favorites`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    entrepreneurId: 'entrepreneur-uuid-here',
    jobId: 'job-uuid-here',
    bidId: 'bid-uuid-here',
    notes: 'Excellent work on previous project'
  })
});

const data = await response.json();
console.log(data.favorite);
```

### Get All Favorites

```javascript
const response = await fetch(`${API_URL}/api/favorites`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(`You have ${data.count} favorites`);
data.favorites.forEach(fav => {
  console.log(`${fav.company_name} - Rating: ${fav.average_rating}`);
});
```

### Check if Bid is Favorited

```javascript
const response = await fetch(
  `${API_URL}/api/favorites/check/bid/${bidId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
if (data.isFavorited) {
  // Show filled heart icon
} else {
  // Show empty heart icon
}
```

### Remove from Favorites

```javascript
const response = await fetch(
  `${API_URL}/api/favorites/bid/${bidId}`,
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
console.log(data.message); // "Entrepreneur removed from favorites"
```

## Database Schema

The `favorites` table structure:

```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID NOT NULL REFERENCES manager_profiles(id) ON DELETE CASCADE,
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  bid_id UUID REFERENCES bids(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint: same manager can favorite same entrepreneur multiple times
  -- but not with the same bid
  UNIQUE (manager_id, entrepreneur_id, COALESCE(bid_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Indexes for performance
CREATE INDEX idx_favorites_manager_id ON favorites(manager_id);
CREATE INDEX idx_favorites_entrepreneur_id ON favorites(entrepreneur_id);
CREATE INDEX idx_favorites_bid_id ON favorites(bid_id) WHERE bid_id IS NOT NULL;
CREATE INDEX idx_favorites_job_id ON favorites(job_id) WHERE job_id IS NOT NULL;
```

## Business Logic

### Duplicate Prevention

The system allows a manager to favorite the same entrepreneur multiple times across different jobs/bids. However, the same bid cannot be favorited twice.

### Cascade Deletes

When a job, bid, entrepreneur profile, or manager profile is deleted, associated favorites are automatically removed.

### Notes

Notes are optional and can be added/updated at any time to keep track of why you favorited an entrepreneur or details about their work.

## Frontend Integration

See the frontend API helper methods in `src/utils/api.js`:

- `addFavorite(entrepreneurId, jobId, bidId, notes)`
- `removeFavorite(bidId)`
- `getFavorites()`
- `checkFavorite(bidId)`
- `getFavoriteCount()`
- `getEntrepreneurHistory(entrepreneurId)`
- `updateFavoriteNotes(favoriteId, notes)`

## Error Handling

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (in development only)"
}
```

Common error codes:
- `400` - Bad request (missing required fields)
- `401` - Unauthorized (invalid or expired token)
- `403` - Forbidden (wrong role or permissions)
- `404` - Resource not found
- `500` - Internal server error
