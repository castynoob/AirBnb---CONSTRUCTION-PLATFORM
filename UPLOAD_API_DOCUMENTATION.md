# Image Upload API Documentation

Complete documentation for all image upload endpoints in the Construction Platform API.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [File Requirements](#file-requirements)
4. [Manager Profile Picture](#manager-profile-picture)
5. [Entrepreneur Profile Picture](#entrepreneur-profile-picture)
6. [Property Images](#property-images)
7. [Job Images](#job-images)
8. [Error Responses](#error-responses)

---

## Overview

All image upload endpoints use **multipart/form-data** encoding and store images in **Supabase Storage**. Files are automatically:
- Validated for type and size
- Given unique filenames
- Uploaded to appropriate storage buckets
- Linked to database records via public URLs

### Base URL
```
https://your-api-domain.com/api
```

---

## Authentication

All upload endpoints require authentication via Bearer token:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

Get your token by logging in through `/api/auth/login`.

---

## File Requirements

### Accepted Image Formats
- `image/jpeg` (.jpg, .jpeg)
- `image/png` (.png)
- `image/webp` (.webp)

### File Size Limits
- **Profile Images**: 5MB maximum
- **Property Images**: 5MB maximum
- **Job Images**: 5MB per file, 10 files maximum

### Field Names
- Single image: `image`
- Multiple images: `images`

---

## Manager Profile Picture

### Upload Manager Profile Picture

**Endpoint:** `POST /api/users/manager/profile-picture`

**Authentication:** Required (Property Manager role)

**Description:** Upload or update the profile picture for the logged-in property manager.

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
```
image: [File] (required) - The image file to upload
```

#### Example using cURL

```bash
curl -X POST https://your-api-domain.com/api/users/manager/profile-picture \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/profile-picture.jpg"
```

#### Example using JavaScript (Fetch)

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('https://your-api-domain.com/api/users/manager/profile-picture', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
console.log(data);
```

#### Success Response (200 OK)

```json
{
  "message": "Profile picture uploaded successfully",
  "imageUrl": "https://your-supabase-url.supabase.co/storage/v1/object/public/profile-images/managers/user-id/timestamp-uuid-filename.jpg"
}
```

---

### Delete Manager Profile Picture

**Endpoint:** `DELETE /api/users/manager/profile-picture`

**Authentication:** Required (Property Manager role)

**Description:** Remove the profile picture for the logged-in property manager.

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Example using cURL

```bash
curl -X DELETE https://your-api-domain.com/api/users/manager/profile-picture \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Success Response (200 OK)

```json
{
  "message": "Profile picture deleted successfully"
}
```

---

## Entrepreneur Profile Picture

### Upload Entrepreneur Profile Picture

**Endpoint:** `POST /api/users/entrepreneur/profile-picture`

**Authentication:** Required (Entrepreneur role)

**Description:** Upload or update the profile picture for the logged-in entrepreneur.

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
```
image: [File] (required) - The image file to upload
```

#### Example using cURL

```bash
curl -X POST https://your-api-domain.com/api/users/entrepreneur/profile-picture \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/profile-picture.jpg"
```

#### Example using JavaScript (Axios)

```javascript
const formData = new FormData();
formData.append('image', file);

const response = await axios.post(
  'https://your-api-domain.com/api/users/entrepreneur/profile-picture',
  formData,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data'
    }
  }
);

console.log(response.data);
```

#### Success Response (200 OK)

```json
{
  "message": "Profile picture uploaded successfully",
  "imageUrl": "https://your-supabase-url.supabase.co/storage/v1/object/public/profile-images/entrepreneurs/user-id/timestamp-uuid-filename.jpg"
}
```

---

### Delete Entrepreneur Profile Picture

**Endpoint:** `DELETE /api/users/entrepreneur/profile-picture`

**Authentication:** Required (Entrepreneur role)

**Description:** Remove the profile picture for the logged-in entrepreneur.

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Example using cURL

```bash
curl -X DELETE https://your-api-domain.com/api/users/entrepreneur/profile-picture \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Success Response (200 OK)

```json
{
  "message": "Profile picture deleted successfully"
}
```

---

## Property Images

### Upload Property Image

**Endpoint:** `POST /api/properties/:id/image`

**Authentication:** Required (Property Manager role)

**Description:** Upload or update the main image for a property. Only the property owner can upload images.

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Property ID |

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
```
image: [File] (required) - The property image file to upload
```

#### Example using cURL

```bash
curl -X POST https://your-api-domain.com/api/properties/123e4567-e89b-12d3-a456-426614174000/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/property-image.jpg"
```

#### Example using JavaScript (React + Axios)

```javascript
const handleUpload = async (propertyId, file) => {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await axios.post(
      `https://your-api-domain.com/api/properties/${propertyId}/image`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    console.log('Upload successful:', response.data);
    return response.data.imageUrl;
  } catch (error) {
    console.error('Upload failed:', error.response?.data);
    throw error;
  }
};
```

#### Success Response (200 OK)

```json
{
  "message": "Property image uploaded successfully",
  "imageUrl": "https://your-supabase-url.supabase.co/storage/v1/object/public/property-images/properties/property-id/timestamp-uuid-filename.jpg"
}
```

---

### Delete Property Image

**Endpoint:** `DELETE /api/properties/:id/image`

**Authentication:** Required (Property Manager role)

**Description:** Remove the image from a property. Only the property owner can delete images.

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Property ID |

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Example using cURL

```bash
curl -X DELETE https://your-api-domain.com/api/properties/123e4567-e89b-12d3-a456-426614174000/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Success Response (200 OK)

```json
{
  "message": "Property image deleted successfully"
}
```

---

## Job Images

### Upload Job Image(s)

**Endpoint (Multiple):** `POST /api/jobs/:id/images`
**Endpoint (Single):** `POST /api/jobs/:id/image`

**Authentication:** Required (Property Manager or Entrepreneur role)

**Description:** Upload one or multiple images for a job. Supports progress photos, before/after shots, etc.

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Job ID |

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Form Data (Multiple):**
```
images: [File[]] (required) - Array of image files (max 10)
caption: [String] (optional) - Caption for the image(s)
```

**Form Data (Single):**
```
image: [File] (required) - Single image file
caption: [String] (optional) - Caption for the image
```

#### Example using cURL (Multiple Images)

```bash
curl -X POST https://your-api-domain.com/api/jobs/123e4567-e89b-12d3-a456-426614174000/images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "images=@/path/to/image3.jpg" \
  -F "caption=Progress photos - Day 5"
```

#### Example using JavaScript (Multiple Files)

```javascript
const uploadJobImages = async (jobId, files, caption = null) => {
  const formData = new FormData();

  // Append multiple files
  Array.from(files).forEach(file => {
    formData.append('images', file);
  });

  if (caption) {
    formData.append('caption', caption);
  }

  const response = await fetch(
    `https://your-api-domain.com/api/jobs/${jobId}/images`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    }
  );

  const data = await response.json();
  return data;
};

// Usage
const fileInput = document.getElementById('fileInput');
const result = await uploadJobImages(
  'job-uuid-here',
  fileInput.files,
  'Before photos'
);
console.log(result);
```

#### Example using JavaScript (Single File)

```javascript
const uploadJobImage = async (jobId, file, caption = null) => {
  const formData = new FormData();
  formData.append('image', file);

  if (caption) {
    formData.append('caption', caption);
  }

  const response = await fetch(
    `https://your-api-domain.com/api/jobs/${jobId}/image`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    }
  );

  return await response.json();
};
```

#### Success Response (200 OK)

```json
{
  "message": "Successfully uploaded 3 image(s)",
  "images": [
    {
      "id": "img-uuid-1",
      "job_id": "job-uuid",
      "image_url": "https://your-supabase-url.supabase.co/storage/v1/object/public/job-images/jobs/job-id/timestamp-uuid-image1.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    },
    {
      "id": "img-uuid-2",
      "job_id": "job-uuid",
      "image_url": "https://your-supabase-url.supabase.co/storage/v1/object/public/job-images/jobs/job-id/timestamp-uuid-image2.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    },
    {
      "id": "img-uuid-3",
      "job_id": "job-uuid",
      "image_url": "https://your-supabase-url.supabase.co/storage/v1/object/public/job-images/jobs/job-id/timestamp-uuid-image3.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Progress photos - Day 5",
      "created_at": "2025-10-31T12:00:00.000Z"
    }
  ]
}
```

---

### Get Job Images

**Endpoint:** `GET /api/jobs/:id/images`

**Authentication:** Required

**Description:** Retrieve all images associated with a specific job.

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Job ID |

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Example using cURL

```bash
curl -X GET https://your-api-domain.com/api/jobs/123e4567-e89b-12d3-a456-426614174000/images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Example using JavaScript

```javascript
const getJobImages = async (jobId) => {
  const response = await fetch(
    `https://your-api-domain.com/api/jobs/${jobId}/images`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  return await response.json();
};
```

#### Success Response (200 OK)

```json
{
  "message": "Job images retrieved successfully",
  "count": 5,
  "images": [
    {
      "id": "img-uuid-1",
      "job_id": "job-uuid",
      "review_id": null,
      "image_url": "https://your-supabase-url.supabase.co/storage/v1/object/public/job-images/jobs/job-id/image1.jpg",
      "uploaded_by": "user-uuid",
      "caption": "Before photo",
      "created_at": "2025-10-31T10:00:00.000Z",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    },
    {
      "id": "img-uuid-2",
      "job_id": "job-uuid",
      "review_id": null,
      "image_url": "https://your-supabase-url.supabase.co/storage/v1/object/public/job-images/jobs/job-id/image2.jpg",
      "uploaded_by": "user-uuid",
      "caption": "After photo",
      "created_at": "2025-10-31T12:00:00.000Z",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  ]
}
```

---

### Delete Job Image

**Endpoint:** `DELETE /api/jobs/:jobId/images/:imageId`

**Authentication:** Required (Property Manager or Entrepreneur role)

**Description:** Delete a specific image from a job. Users can delete their own uploads, and job managers can delete any image.

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `jobId` | UUID | Job ID |
| `imageId` | UUID | Image ID |

#### Request

**Headers:**
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Example using cURL

```bash
curl -X DELETE https://your-api-domain.com/api/jobs/123e4567-e89b-12d3-a456-426614174000/images/img-uuid-here \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Example using JavaScript

```javascript
const deleteJobImage = async (jobId, imageId) => {
  const response = await fetch(
    `https://your-api-domain.com/api/jobs/${jobId}/images/${imageId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  return await response.json();
};
```

#### Success Response (200 OK)

```json
{
  "message": "Image deleted successfully"
}
```

---

## Error Responses

### Common Error Codes

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid file or missing required fields |
| 401 | Unauthorized - Missing or invalid authentication token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 413 | Payload Too Large - File exceeds size limit |
| 500 | Internal Server Error - Server-side error |

### Error Response Format

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Example Error Responses

#### No File Uploaded (400)

```json
{
  "error": "No file uploaded",
  "message": "Please provide an image file"
}
```

#### Invalid File Type (400)

```json
{
  "error": "Invalid file",
  "message": "Invalid file type. Allowed types: image/jpeg, image/jpg, image/png, image/webp"
}
```

#### File Too Large (400)

```json
{
  "error": "File too large",
  "message": "File size exceeds the maximum allowed size",
  "maxSize": "5MB"
}
```

#### Unauthorized (401)

```json
{
  "message": "Access denied. No token provided."
}
```

#### Forbidden - Wrong Role (403)

```json
{
  "message": "Access denied. Required role: property_manager"
}
```

#### Forbidden - Not Owner (403)

```json
{
  "message": "You can only update your own properties"
}
```

#### Profile Not Found (404)

```json
{
  "message": "Manager profile not found"
}
```

#### Resource Not Found (404)

```json
{
  "message": "Property not found"
}
```

#### Upload Failed (500)

```json
{
  "error": "Upload failed",
  "message": "Failed to upload to storage: Connection timeout"
}
```

---

## Complete Example: React Image Upload Component

```javascript
import React, { useState } from 'react';
import axios from 'axios';

const ImageUploadComponent = ({ entityType, entityId, token }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      // Determine endpoint based on entity type
      let endpoint;
      switch (entityType) {
        case 'manager-profile':
          endpoint = '/api/users/manager/profile-picture';
          break;
        case 'entrepreneur-profile':
          endpoint = '/api/users/entrepreneur/profile-picture';
          break;
        case 'property':
          endpoint = `/api/properties/${entityId}/image`;
          break;
        case 'job':
          endpoint = `/api/jobs/${entityId}/image`;
          break;
        default:
          throw new Error('Invalid entity type');
      }

      const response = await axios.post(
        `https://your-api-domain.com${endpoint}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setImageUrl(response.data.imageUrl);
      alert('Image uploaded successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="image-upload">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {preview && (
        <div className="preview">
          <img src={preview} alt="Preview" style={{ maxWidth: '300px' }} />
        </div>
      )}

      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload Image'}
      </button>

      {error && <div className="error">{error}</div>}
      {imageUrl && (
        <div className="success">
          <p>Image uploaded successfully!</p>
          <img src={imageUrl} alt="Uploaded" style={{ maxWidth: '300px' }} />
        </div>
      )}
    </div>
  );
};

export default ImageUploadComponent;
```

---

## Testing Endpoints

### Using Postman

1. **Create a new request**
2. **Set method** to POST/DELETE
3. **Enter the URL** (e.g., `http://localhost:5000/api/users/manager/profile-picture`)
4. **Add Authorization header:**
   - Key: `Authorization`
   - Value: `Bearer YOUR_JWT_TOKEN`
5. **For uploads, select Body tab:**
   - Choose `form-data`
   - Add key `image` with type `File`
   - Select your image file
6. **Send the request**

### Using Insomnia

Similar steps to Postman. Insomnia also provides excellent support for multipart/form-data requests.

---

## Notes

1. **Old images are automatically deleted** when uploading new ones to prevent storage bloat
2. **Cache is invalidated** automatically after uploads/deletes
3. **Files are stored with unique names** (timestamp + UUID + original name)
4. **All uploads are logged** for debugging purposes
5. **Permissions are strictly enforced** - users can only modify their own resources
6. **Job images support multiple uploaders** - both managers and entrepreneurs can upload

---

## Support

For issues or questions:
- Check error messages carefully
- Ensure file meets size/type requirements
- Verify authentication token is valid
- Confirm user has appropriate role/permissions

---

**Last Updated:** October 31, 2025
**API Version:** 1.0.0
