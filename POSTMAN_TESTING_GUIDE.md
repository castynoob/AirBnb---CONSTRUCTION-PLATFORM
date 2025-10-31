# Postman Testing Guide - Image Upload Endpoints

Complete step-by-step guide to test all image upload endpoints using Postman.

---

## Table of Contents
1. [Initial Setup](#initial-setup)
2. [Get Authentication Token](#get-authentication-token)
3. [Test Manager Profile Picture Upload](#test-manager-profile-picture-upload)
4. [Test Entrepreneur Profile Picture Upload](#test-entrepreneur-profile-picture-upload)
5. [Test Property Image Upload](#test-property-image-upload)
6. [Test Job Image Upload](#test-job-image-upload)
7. [Troubleshooting](#troubleshooting)

---

## Initial Setup

### 1. Start Your Server

Make sure your server is running:

```bash
cd /Users/jordandavecaparas/Documents/work&latest/AirBnb---CONSTRUCTION-PLATFORM
npm start
```

Expected output:
```
Server running on port 5000
✓ PostgreSQL Connected
✓ Redis Connected
[Supabase] ✓ Configured successfully
```

### 2. Verify Supabase Buckets Exist

Your Supabase URL: `https://rwsqujvvibcjaomqjovp.supabase.co`

Check if storage buckets are created:
1. Go to https://supabase.com/dashboard
2. Select your project: `rwsqujvvibcjaomqjovp`
3. Click "Storage" in left menu
4. Verify these buckets exist:
   - `profile-images` (public)
   - `property-images` (public)
   - `job-images` (public)

If they don't exist, create them manually or run this script in your project:

```javascript
// scripts/setup-supabase-buckets.js
import { initializeSupabaseBuckets } from './src/config/supabase.js';
await initializeSupabaseBuckets();
```

---

## Get Authentication Token

Before testing uploads, you need a valid JWT token.

### Step 1: Login as Property Manager

**Method:** `POST`
**URL:** `http://localhost:5000/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "manager@example.com",
  "password": "your_password"
}
```

**Screenshots Guide:**
1. Open Postman
2. Click "New" → "HTTP Request"
3. Set method to `POST`
4. Enter URL: `http://localhost:5000/api/auth/login`
5. Click "Headers" tab
   - Key: `Content-Type`
   - Value: `application/json`
6. Click "Body" tab
   - Select "raw"
   - Select "JSON" from dropdown
   - Paste the login JSON above
7. Click "Send"

**Expected Response (200 OK):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid-here",
    "email": "manager@example.com",
    "role": "property_manager"
  }
}
```

**IMPORTANT:** Copy the `token` value - you'll need it for all subsequent requests!

### Alternative: Login as Entrepreneur

Use the same endpoint but with entrepreneur credentials:

```json
{
  "email": "entrepreneur@example.com",
  "password": "your_password"
}
```

---

## Test Manager Profile Picture Upload

### Step 1: Create New Request in Postman

1. Click "New" → "HTTP Request"
2. Name it: "Upload Manager Profile Picture"

### Step 2: Configure Request

**Method:** `POST`
**URL:** `http://localhost:5000/api/users/manager/profile-picture`

### Step 3: Set Headers

Click "Headers" tab:

| Key | Value |
|-----|-------|
| Authorization | `Bearer YOUR_TOKEN_HERE` |

**Replace `YOUR_TOKEN_HERE` with the token from login response**

Example:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImU3YWU1ZTcx...
```

### Step 4: Set Body

1. Click "Body" tab
2. Select "form-data" (NOT raw!)
3. Add a new key-value pair:
   - **Key:** `image` (make sure it says "Text" first)
   - Click the dropdown next to "image" and change from "Text" to **"File"**
   - **Value:** Click "Select Files" and choose an image file from your computer

**Visual Guide:**
```
Body tab
├── form-data (selected)
└── KEY: image  |  VALUE: [Select Files button]  |  TYPE: File
```

### Step 5: Select Image File

Choose any image file:
- Formats: JPG, PNG, or WEBP
- Size: Less than 5MB
- Example: Your profile picture, test image, etc.

### Step 6: Send Request

Click the blue "Send" button

### Expected Response (200 OK):

```json
{
  "message": "Profile picture uploaded successfully",
  "imageUrl": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/v1/object/public/profile-images/managers/e7ae5e71-419a-440f-8b60-3b72058b055e/1730380000000-abc123-profile.jpg"
}
```

### Step 7: Verify Upload

1. Copy the `imageUrl` from the response
2. Paste it in your browser - you should see your uploaded image!
3. Or check Supabase Dashboard:
   - Storage → profile-images → managers → [your-user-id]

---

## Test Entrepreneur Profile Picture Upload

Same steps as Manager, but:

**URL:** `http://localhost:5000/api/users/entrepreneur/profile-picture`

**Requirements:**
- Must be logged in as Entrepreneur role
- Use entrepreneur's JWT token

**All other steps are identical to Manager upload!**

---

## Test Property Image Upload

### Prerequisites

You need a valid property ID. Get one by:

**Method:** `GET`
**URL:** `http://localhost:5000/api/properties`
**Headers:** `Authorization: Bearer YOUR_TOKEN`

Copy a property `id` from the response.

### Upload Property Image

**Method:** `POST`
**URL:** `http://localhost:5000/api/properties/{PROPERTY_ID}/image`

Example: `http://localhost:5000/api/properties/cbb01cc1-0c3d-4354-a982-f227946537c5/image`

### Headers:
```
Authorization: Bearer YOUR_MANAGER_TOKEN
```

### Body (form-data):
```
Key: image (File)
Value: [Select your property image file]
```

### Expected Response (200 OK):

```json
{
  "message": "Property image uploaded successfully",
  "imageUrl": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/v1/object/public/property-images/properties/cbb01cc1-0c3d-4354-a982-f227946537c5/1730380000000-xyz789-building.jpg"
}
```

---

## Test Job Image Upload

### Prerequisites

Get a job ID:

**Method:** `GET`
**URL:** `http://localhost:5000/api/jobs`
**Headers:** `Authorization: Bearer YOUR_TOKEN`

Copy a job `id` from the response.

### Option A: Upload Single Job Image

**Method:** `POST`
**URL:** `http://localhost:5000/api/jobs/{JOB_ID}/image`

Example: `http://localhost:5000/api/jobs/9be9ad4d-61c6-4d1f-bb01-ff0505832308/image`

### Headers:
```
Authorization: Bearer YOUR_TOKEN
```

### Body (form-data):
| Key | Type | Value |
|-----|------|-------|
| image | File | [Select image file] |
| caption | Text | "Before photo" |

**Screenshot Setup:**
1. Body tab → form-data
2. Row 1: Key=`image`, Type=File, Value=[Select file]
3. Row 2: Key=`caption`, Type=Text, Value=`Before photo`

### Expected Response (200 OK):

```json
{
  "message": "Successfully uploaded 1 image(s)",
  "images": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "job_id": "9be9ad4d-61c6-4d1f-bb01-ff0505832308",
      "image_url": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/v1/object/public/job-images/jobs/9be9ad4d-61c6-4d1f-bb01-ff0505832308/1730380000000-abc123-before.jpg",
      "uploaded_by": "e7ae5e71-419a-440f-8b60-3b72058b055e",
      "caption": "Before photo",
      "created_at": "2025-10-31T12:00:00.000Z"
    }
  ]
}
```

### Option B: Upload Multiple Job Images

**Method:** `POST`
**URL:** `http://localhost:5000/api/jobs/{JOB_ID}/images` (Note: plural "images")

### Headers:
```
Authorization: Bearer YOUR_TOKEN
```

### Body (form-data):
| Key | Type | Value |
|-----|------|-------|
| images | File | [Select first image] |
| images | File | [Select second image] |
| images | File | [Select third image] |
| caption | Text | "Progress photos - Day 5" |

**Important:** Use the SAME key name `images` for each file!

**How to add multiple files in Postman:**
1. Body tab → form-data
2. Row 1: Key=`images`, Type=File, Value=[file1.jpg]
3. Row 2: Key=`images`, Type=File, Value=[file2.jpg]
4. Row 3: Key=`images`, Type=File, Value=[file3.jpg]
5. Row 4: Key=`caption`, Type=Text, Value="Progress photos"

### Expected Response (200 OK):

```json
{
  "message": "Successfully uploaded 3 image(s)",
  "images": [
    {
      "id": "img-uuid-1",
      "job_id": "job-uuid",
      "image_url": "https://...image1.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    },
    {
      "id": "img-uuid-2",
      "job_id": "job-uuid",
      "image_url": "https://...image2.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    },
    {
      "id": "img-uuid-3",
      "job_id": "job-uuid",
      "image_url": "https://...image3.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    }
  ]
}
```

---

## Get Job Images

**Method:** `GET`
**URL:** `http://localhost:5000/api/jobs/{JOB_ID}/images`

### Headers:
```
Authorization: Bearer YOUR_TOKEN
```

### Body:
None (GET request doesn't need a body)

### Expected Response (200 OK):

```json
{
  "message": "Job images retrieved successfully",
  "count": 3,
  "images": [
    {
      "id": "img-uuid-1",
      "job_id": "job-uuid",
      "review_id": null,
      "image_url": "https://...image1.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Before photo",
      "created_at": "2025-10-31T10:00:00.000Z",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  ]
}
```

---

## Delete Image Examples

### Delete Manager Profile Picture

**Method:** `DELETE`
**URL:** `http://localhost:5000/api/users/manager/profile-picture`

**Headers:**
```
Authorization: Bearer YOUR_MANAGER_TOKEN
```

**Body:** None

**Expected Response (200 OK):**
```json
{
  "message": "Profile picture deleted successfully"
}
```

### Delete Property Image

**Method:** `DELETE`
**URL:** `http://localhost:5000/api/properties/{PROPERTY_ID}/image`

**Headers:**
```
Authorization: Bearer YOUR_MANAGER_TOKEN
```

**Body:** None

### Delete Job Image

**Method:** `DELETE`
**URL:** `http://localhost:5000/api/jobs/{JOB_ID}/images/{IMAGE_ID}`

Example: `http://localhost:5000/api/jobs/9be9ad4d-61c6-4d1f-bb01-ff0505832308/images/550e8400-e29b-41d4-a716-446655440000`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Body:** None

**Expected Response (200 OK):**
```json
{
  "message": "Image deleted successfully"
}
```

---

## Troubleshooting

### Error: "Access denied. No token provided."

**Problem:** Missing or incorrect Authorization header

**Solution:**
1. Check Headers tab in Postman
2. Verify `Authorization` header exists
3. Make sure format is: `Bearer YOUR_TOKEN` (with space after "Bearer")
4. Ensure token is fresh (login again if expired)

### Error: "Access denied. Required role: property_manager"

**Problem:** Using wrong role token

**Solution:**
- For manager endpoints, login with property_manager account
- For entrepreneur endpoints, login with entrepreneur account

### Error: "No file uploaded"

**Problem:** File not selected or wrong field name

**Solution:**
1. Body tab must be set to "form-data" (NOT raw!)
2. Key name must be exactly `image` (for single) or `images` (for multiple)
3. Type must be "File" (not "Text")
4. Click "Select Files" and choose an image

### Error: "Invalid file type"

**Problem:** File format not supported

**Solution:**
- Use only JPG, PNG, or WEBP files
- Check file extension is correct
- File must be a valid image (not corrupted)

### Error: "File too large"

**Problem:** File exceeds 5MB limit

**Solution:**
- Resize or compress your image
- Use a smaller file
- Maximum allowed: 5MB per image

### Error: "Property not found" or "Job not found"

**Problem:** Invalid ID in URL

**Solution:**
1. Get valid IDs first using GET endpoints
2. Copy exact UUID (don't type manually)
3. Check for extra spaces in URL

### Error: "You can only update your own properties"

**Problem:** Trying to update someone else's resource

**Solution:**
- Use property/job that belongs to your account
- Verify you're logged in with correct account

### Error: "Upload failed" or "Supabase not configured"

**Problem:** Supabase connection issue

**Solution:**
1. Check `.env` file has correct Supabase credentials
2. Verify Supabase URL and keys are valid
3. Check buckets exist in Supabase dashboard
4. Restart your server

### Can't see uploaded image in browser

**Problem:** Bucket might be private

**Solution:**
1. Go to Supabase Dashboard → Storage
2. Click on bucket (e.g., profile-images)
3. Click "Policies" tab
4. Make sure "Public access" is enabled
5. Or add policy: Allow SELECT for public

---

## Quick Test Checklist

- [ ] Server is running (`npm start`)
- [ ] Logged in successfully (have JWT token)
- [ ] Token copied to clipboard
- [ ] Image file selected (JPG/PNG/WEBP, under 5MB)
- [ ] Request method is correct (POST/DELETE)
- [ ] URL is correct
- [ ] Authorization header added: `Bearer TOKEN`
- [ ] Body type is "form-data" (for uploads)
- [ ] Field name is `image` or `images`
- [ ] Field type is "File" (not Text)
- [ ] File is selected
- [ ] Sent request
- [ ] Response is 200 OK
- [ ] Image URL works in browser

---

## Example Postman Collection Structure

Create a collection with these folders:

```
Construction Platform - Image Uploads
├── Auth
│   ├── Login as Manager
│   └── Login as Entrepreneur
├── Profile Pictures
│   ├── Upload Manager Profile Picture
│   ├── Delete Manager Profile Picture
│   ├── Upload Entrepreneur Profile Picture
│   └── Delete Entrepreneur Profile Picture
├── Property Images
│   ├── Get Properties (to get ID)
│   ├── Upload Property Image
│   └── Delete Property Image
└── Job Images
    ├── Get Jobs (to get ID)
    ├── Upload Single Job Image
    ├── Upload Multiple Job Images
    ├── Get Job Images
    └── Delete Job Image
```

---

## Save for Reuse

### Postman Environment Variables

Create an environment with these variables:

| Variable | Initial Value |
|----------|---------------|
| base_url | http://localhost:5000 |
| token | (leave empty - will be set after login) |
| property_id | (will be set manually) |
| job_id | (will be set manually) |

Then use in requests like:
- URL: `{{base_url}}/api/users/manager/profile-picture`
- Header: `Authorization: Bearer {{token}}`

---

**Happy Testing! 🚀**

If you encounter any issues not covered here, check the server console for detailed error messages.
