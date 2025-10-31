# Upload Endpoints - Quick Reference

## Manager Profile Picture

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/users/manager/profile-picture` | property_manager | Upload profile picture |
| DELETE | `/api/users/manager/profile-picture` | property_manager | Delete profile picture |

**Form Field:** `image` (single file)

---

## Entrepreneur Profile Picture

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/users/entrepreneur/profile-picture` | entrepreneur | Upload profile picture |
| DELETE | `/api/users/entrepreneur/profile-picture` | entrepreneur | Delete profile picture |

**Form Field:** `image` (single file)

---

## Property Images

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/properties/:id/image` | property_manager | Upload property image |
| DELETE | `/api/properties/:id/image` | property_manager | Delete property image |

**Form Field:** `image` (single file)
**Note:** Only property owner can upload/delete

---

## Job Images

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/jobs/:id/images` | property_manager, entrepreneur | Upload multiple images |
| POST | `/api/jobs/:id/image` | property_manager, entrepreneur | Upload single image |
| GET | `/api/jobs/:id/images` | authenticated | Get all job images |
| DELETE | `/api/jobs/:jobId/images/:imageId` | property_manager, entrepreneur | Delete specific image |

**Form Field:**
- Multiple: `images` (array of files, max 10)
- Single: `image` (single file)
- Optional: `caption` (string)

---

## File Requirements

**Accepted Formats:** JPG, PNG, WEBP
**Max Size:** 5MB per image
**Max Count (Jobs):** 10 images per upload

---

## Quick cURL Examples

### Upload Manager Profile Picture
```bash
curl -X POST http://localhost:5000/api/users/manager/profile-picture \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@profile.jpg"
```

### Upload Property Image
```bash
curl -X POST http://localhost:5000/api/properties/PROPERTY_ID/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@property.jpg"
```

### Upload Multiple Job Images
```bash
curl -X POST http://localhost:5000/api/jobs/JOB_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F "caption=Progress photos"
```

### Get Job Images
```bash
curl -X GET http://localhost:5000/api/jobs/JOB_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete Job Image
```bash
curl -X DELETE http://localhost:5000/api/jobs/JOB_ID/images/IMAGE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Storage Buckets (Supabase)

| Bucket | Purpose | Public |
|--------|---------|--------|
| `profile-images` | User profile pictures | Yes |
| `property-images` | Property photos | Yes |
| `job-images` | Job-related images | Yes |

---

## Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid file or missing data |
| 401 | Not authenticated |
| 403 | Forbidden (wrong role or not owner) |
| 404 | Resource not found |
| 500 | Server error |

---

For detailed documentation, see [UPLOAD_API_DOCUMENTATION.md](./UPLOAD_API_DOCUMENTATION.md)
