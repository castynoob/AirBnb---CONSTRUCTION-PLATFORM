# API Endpoints Documentation

Complete reference for Inspection Upload, Excel Parsing, and Image Upload endpoints.

---

## 📋 Table of Contents

1. [Inspection Endpoints](#inspection-endpoints)
2. [Image Upload Endpoints](#image-upload-endpoints)
3. [Authentication](#authentication)
4. [Error Responses](#error-responses)
5. [Examples](#examples)

---

## 🔐 Authentication

All endpoints require JWT authentication unless stated otherwise.

**Header Format:**
```http
Authorization: Bearer <your-jwt-token>
```

**Getting a Token:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "manager@test.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGc...",
  "refreshToken": "070454b...",
  "user": {
    "id": "uuid",
    "email": "manager@test.com",
    "role": "property_manager",
    "first_name": "Jane",
    "last_name": "Manager"
  }
}
```

---

## 📊 Inspection Endpoints

### 1. Download Inspection Template

Download an Excel template to see the required format.

**Endpoint:**
```http
GET /api/inspections/template
```

**Authentication:** Required

**Headers:**
```http
Authorization: Bearer <token>
```

**Response:**
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **File:** Excel file download

**Success Response:**
```
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="inspection-template.xlsx"

[Binary Excel Data]
```

**Example (cURL):**
```bash
curl -X GET http://localhost:5000/api/inspections/template \
  -H "Authorization: Bearer eyJhbGc..." \
  --output inspection-template.xlsx
```

**Example (JavaScript):**
```javascript
const response = await fetch('http://localhost:5000/api/inspections/template', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'inspection-template.xlsx';
a.click();
```

---

### 2. Upload Inspection Excel

Upload an Excel file for parsing. Supports both standard inspection templates and maintenance plan templates.

**Endpoint:**
```http
POST /api/inspections/upload
```

**Authentication:** Required (property_manager role)

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (Form Data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Excel file (.xlsx, .xls, .csv) |
| `property_id` | String (UUID) | Yes | Property ID to associate inspection with |

**File Validation:**
- **Allowed types:** `.xlsx`, `.xls`, `.csv`
- **Max size:** 10 MB
- **MIME types:**
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.ms-excel`
  - `text/csv`

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully uploaded inspection. Found 39 jobs.",
  "inspection": {
    "id": "53b8ff3d-74a2-438e-9aec-27fe6aa5a005",
    "property_id": "e6fe5ae9-35df-4f3c-a477-c7df894ab6b2",
    "file_name": "Maintenance_Plan_and_Log_1090_EN.xlsx",
    "file_url": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/...",
    "uploaded_at": "2025-10-31T07:18:14.661Z",
    "status": "parsed"
  },
  "parsedData": {
    "totalRows": 39,
    "successCount": 39,
    "errorCount": 0,
    "jobs": [
      {
        "title": "Injection des fissures par l'extérieur",
        "description": "La méthode de travail adéquate pour l'injection...",
        "category": "Masonry",
        "urgency": "High",
        "budget": 2750,
        "location": "Cast-in-place concrete walls",
        "dueDate": "2026-01-01T00:00:00.000Z",
        "notes": "Component: Cast-in-place concrete walls\nUniformat Code: A1010\nType of Work: Major Repair",
        "sourceRow": 2
      },
      // ... more jobs
    ],
    "errors": [],
    "detectedColumns": [
      "Due Date",
      "Uniformat Code",
      "Component",
      "Type of Work",
      "Title",
      "Description",
      "Current Estimated Cost"
    ],
    "fieldMapping": {
      "Due Date": "dueDate",
      "Uniformat Code": "uniformatCode",
      "Component": "component",
      "Type of Work": "typeOfWork",
      "Title": "title",
      "Description": "description",
      "Current Estimated Cost": "budget"
    }
  }
}
```

**Error Responses:**

**400 Bad Request - Missing property_id:**
```json
{
  "error": "Missing property_id",
  "message": "Please provide the property ID for this inspection"
}
```

**400 Bad Request - No file:**
```json
{
  "error": "No file uploaded",
  "message": "Please provide an Excel file"
}
```

**400 Bad Request - Invalid file type:**
```json
{
  "error": "Invalid file",
  "message": "Invalid file type. Allowed types: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
}
```

**400 Bad Request - No valid jobs:**
```json
{
  "error": "No valid jobs found",
  "message": "The Excel file does not contain any valid job data",
  "errors": [
    {
      "row": 5,
      "error": "Missing title",
      "data": { /* row data */ }
    }
  ]
}
```

**Example (cURL):**
```bash
curl -X POST http://localhost:5000/api/inspections/upload \
  -H "Authorization: Bearer eyJhbGc..." \
  -F "file=@template/Maintenance_Plan_and_Log_1090_EN.xlsx" \
  -F "property_id=e6fe5ae9-35df-4f3c-a477-c7df894ab6b2"
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('property_id', 'e6fe5ae9-35df-4f3c-a477-c7df894ab6b2');

const response = await fetch('http://localhost:5000/api/inspections/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const result = await response.json();
console.log(`Parsed ${result.parsedData.successCount} jobs`);
```

---

### 3. Create Jobs from Inspection

Create actual job records from the parsed inspection data.

**Endpoint:**
```http
POST /api/inspections/:id/create-jobs
```

**Authentication:** Required (property_manager role)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Inspection ID from upload response |

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "jobs": [
    {
      "title": "Fix leaking faucet",
      "description": "Kitchen faucet dripping",
      "category": "Plumbing",
      "urgency": "Medium",
      "budget": 150,
      "location": "Unit 101",
      "dueDate": "2025-11-06T00:00:00.000Z",
      "notes": "Component: Plumbing fixtures\nUniformat Code: D2091"
    }
    // ... array of jobs from parsedData
  ]
}
```

**Job Object Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | String | Yes | Job title |
| `description` | String | No | Job description |
| `category` | String | No | Job category (default: "Other") |
| `urgency` | String | No | Urgency level (Low/Medium/High/Critical) |
| `budget` | Number | No | Budget amount |
| `location` | String | No | Job location |
| `dueDate` | String (ISO) | No | Due date |
| `notes` | String | No | Additional notes |

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Successfully created 39 jobs from inspection",
  "jobs": [
    {
      "id": "8d16826d-2764-4984-9607-bfa76b3b1870",
      "property_id": "e6fe5ae9-35df-4f3c-a477-c7df894ab6b2",
      "manager_id": "5248855c-3f36-4613-ae6a-919c774cef65",
      "title": "Fix leaking faucet",
      "description": "Kitchen faucet dripping",
      "category": "Plumbing",
      "urgency": "Medium",
      "budget_min": "120.00",
      "budget_max": "180.00",
      "is_budget_hidden": false,
      "status": "Open",
      "created_at": "2025-10-31T07:20:10.170Z",
      "updated_at": "2025-10-31T07:20:10.170Z"
    }
    // ... more jobs
  ],
  "inspection": {
    "id": "53b8ff3d-74a2-438e-9aec-27fe6aa5a005",
    "status": "completed"
  }
}
```

**Error Responses:**

**400 Bad Request - No job data:**
```json
{
  "error": "No job data provided",
  "message": "Please provide an array of jobs to create"
}
```

**404 Not Found - Inspection not found:**
```json
{
  "error": "Inspection not found"
}
```

**403 Forbidden - Not owner:**
```json
{
  "error": "Forbidden",
  "message": "You can only create jobs from your own inspections"
}
```

**Example (cURL):**
```bash
curl -X POST http://localhost:5000/api/inspections/53b8ff3d-74a2-438e-9aec-27fe6aa5a005/create-jobs \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "jobs": [
      {
        "title": "Fix leaking faucet",
        "description": "Kitchen faucet dripping",
        "category": "Plumbing",
        "urgency": "Medium",
        "budget": 150,
        "location": "Unit 101"
      }
    ]
  }'
```

**Example (JavaScript):**
```javascript
const response = await fetch(
  `http://localhost:5000/api/inspections/${inspectionId}/create-jobs`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ jobs: parsedJobs })
  }
);

const result = await response.json();
console.log(`Created ${result.jobs.length} jobs`);
```

---

### 4. Get Inspections by Property

Retrieve all inspections for a specific property.

**Endpoint:**
```http
GET /api/inspections/property/:propertyId
```

**Authentication:** Required (property_manager role)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `propertyId` | UUID | Property ID |

**Headers:**
```http
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 3,
  "inspections": [
    {
      "id": "53b8ff3d-74a2-438e-9aec-27fe6aa5a005",
      "property_id": "e6fe5ae9-35df-4f3c-a477-c7df894ab6b2",
      "file_url": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/...",
      "uploaded_by": "e7ae5e71-419a-440f-8b60-3b72058b055e",
      "uploaded_at": "2025-10-31T07:18:14.661Z",
      "file_name": "Maintenance_Plan_and_Log_1090_EN.xlsx",
      "file_size": 76407,
      "file_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "parsed_job_count": 39,
      "status": "completed",
      "first_name": "Jane",
      "last_name": "Manager"
    }
    // ... more inspections
  ]
}
```

**Inspection Status Values:**
- `pending` - Uploaded but not parsed yet
- `parsed` - Successfully parsed, ready to create jobs
- `completed` - Jobs have been created

**Example (cURL):**
```bash
curl -X GET http://localhost:5000/api/inspections/property/e6fe5ae9-35df-4f3c-a477-c7df894ab6b2 \
  -H "Authorization: Bearer eyJhbGc..."
```

**Example (JavaScript):**
```javascript
const response = await fetch(
  `http://localhost:5000/api/inspections/property/${propertyId}`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const result = await response.json();
console.log(`Found ${result.count} inspections`);
```

---

### 5. Preview Inspection

Re-parse an inspection Excel file to preview jobs without creating them.

**Endpoint:**
```http
GET /api/inspections/:id/preview
```

**Authentication:** Required (property_manager role)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Inspection ID |

**Headers:**
```http
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "inspection": {
    "id": "53b8ff3d-74a2-438e-9aec-27fe6aa5a005",
    "property_id": "e6fe5ae9-35df-4f3c-a477-c7df894ab6b2",
    "file_name": "Maintenance_Plan_and_Log_1090_EN.xlsx",
    "status": "parsed"
  },
  "parsedData": {
    "totalRows": 39,
    "successCount": 39,
    "errorCount": 0,
    "jobs": [ /* array of parsed jobs */ ],
    "errors": [],
    "detectedColumns": [ /* array of column names */ ],
    "fieldMapping": { /* object mapping */ }
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Inspection not found"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "You can only preview your own inspections"
}
```

**Example (cURL):**
```bash
curl -X GET http://localhost:5000/api/inspections/53b8ff3d-74a2-438e-9aec-27fe6aa5a005/preview \
  -H "Authorization: Bearer eyJhbGc..."
```

**Example (JavaScript):**
```javascript
const response = await fetch(
  `http://localhost:5000/api/inspections/${inspectionId}/preview`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const result = await response.json();
console.log(`Preview shows ${result.parsedData.successCount} jobs`);
```

---

### 6. Delete Inspection

Delete an inspection and its associated file from storage.

**Endpoint:**
```http
DELETE /api/inspections/:id
```

**Authentication:** Required (property_manager role)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Inspection ID |

**Headers:**
```http
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Inspection deleted successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Inspection not found"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "You can only delete your own inspections"
}
```

**Note:** Deleting an inspection does NOT delete jobs that were created from it.

**Example (cURL):**
```bash
curl -X DELETE http://localhost:5000/api/inspections/53b8ff3d-74a2-438e-9aec-27fe6aa5a005 \
  -H "Authorization: Bearer eyJhbGc..."
```

**Example (JavaScript):**
```javascript
const response = await fetch(
  `http://localhost:5000/api/inspections/${inspectionId}`,
  {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  }
);

const result = await response.json();
console.log(result.message);
```

---

## 🖼️ Image Upload Endpoints

**Note:** Image upload endpoints are planned for Phase 3. Below is the proposed API design.

### 1. Upload Images

Upload multiple images for jobs, properties, or profiles.

**Endpoint:**
```http
POST /api/images/upload
```

**Authentication:** Required

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (Form Data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `images` | File[] | Yes | Image files (can upload multiple) |
| `job_id` | UUID | No | Associate with specific job |
| `property_id` | UUID | No | Associate with specific property |
| `caption` | String | No | Image caption/description |

**File Validation:**
- **Allowed types:** `.jpg`, `.jpeg`, `.png`, `.webp`
- **Max size:** 5 MB per image
- **Max count:** 10 images per request

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Successfully uploaded 3 images",
  "images": [
    {
      "id": "image-uuid-1",
      "url": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/...",
      "job_id": "job-uuid",
      "caption": "Before repair",
      "uploaded_at": "2025-10-31T08:00:00.000Z",
      "file_size": 245678,
      "content_type": "image/jpeg"
    }
    // ... more images
  ]
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('images', file1);
formData.append('images', file2);
formData.append('job_id', jobId);

const response = await fetch('http://localhost:5000/api/images/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

---

### 2. Get Job Images

Retrieve all images for a specific job.

**Endpoint:**
```http
GET /api/images/job/:jobId
```

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 3,
  "images": [
    {
      "id": "image-uuid",
      "url": "https://...",
      "caption": "Before repair",
      "uploaded_at": "2025-10-31T08:00:00.000Z"
    }
    // ... more images
  ]
}
```

---

### 3. Delete Image

Delete a specific image.

**Endpoint:**
```http
DELETE /api/images/:id
```

**Authentication:** Required

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

---

## ⚠️ Error Responses

### Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 413 | Payload Too Large | File too large |
| 415 | Unsupported Media Type | Invalid file type |
| 500 | Internal Server Error | Server error |

### Error Response Format

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error description",
  "details": { /* optional additional details */ }
}
```

---

## 📝 Excel Template Format

### Standard Inspection Template

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| **Job Title** or **Title** | Yes | Job name | "Fix leaking faucet" |
| **Description** or **Details** | No | Job description | "Kitchen faucet dripping" |
| **Category** or **Type** | No | Job category | "Plumbing" |
| **Urgency** or **Priority** | No | Urgency level | "Medium" |
| **Budget** or **Cost** | No | Estimated cost | 150 |
| **Location** or **Area** | No | Job location | "Unit 101" |
| **Due Date** or **Deadline** | No | Completion date | "2025-11-06" |
| **Notes** or **Comments** | No | Additional notes | "Urgent" |

### Maintenance Plan Template (Auto-Detected)

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| **Title** | Yes | Work title | "Injection des fissures" |
| **Description** | No | Work description | "La méthode de travail..." |
| **Component** | No | Building component | "Cast-in-place concrete walls" |
| **Uniformat Code** | No | Uniformat classification | "A1010" |
| **Type of Work** | No | Work type | "Major Repair" |
| **Current Estimated Cost** | No | Cost estimate | 2750 |
| **Due Date** | No | Target date | "2026" |

**Auto-Detection:** System automatically detects maintenance template if it finds "Uniformat Code", "Component", or "Type of Work" columns.

---

## 🔄 Supported Categories

- Plumbing
- Electrical
- HVAC
- Carpentry
- Painting
- Roofing
- Flooring
- Masonry
- Landscaping
- General Repair
- Demolition
- Insulation
- Drywall
- Windows/Doors
- Appliances
- Other (default)

## 🚦 Supported Urgency Levels

- **Low** (1) - Routine maintenance
- **Medium** (2) - Standard priority (default)
- **High** (3) - Important, address soon
- **Critical** (4) - Emergency, immediate attention

---

## 💡 Best Practices

### File Uploads

1. **Validate on client side first:**
   - Check file type before upload
   - Check file size < 10MB
   - Provide user feedback

2. **Handle large files:**
   - Show upload progress
   - Implement timeout handling
   - Provide cancel option

3. **Error handling:**
   - Display clear error messages
   - Allow user to retry
   - Log errors for debugging

### Parsing Results

1. **Always show preview:**
   - Display parsed jobs before creating
   - Show detected columns
   - Highlight any errors
   - Allow user to review

2. **Handle errors gracefully:**
   - Show which rows failed
   - Explain what's wrong
   - Provide fix suggestions

3. **Provide feedback:**
   - Show parsing progress
   - Display success message
   - Show job count
   - Link to created jobs

---

## 📖 Complete Example Workflow

```javascript
// 1. Login
const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'manager@test.com',
    password: 'password123'
  })
});
const { accessToken } = await loginResponse.json();

// 2. Download template (optional)
const templateResponse = await fetch(
  'http://localhost:5000/api/inspections/template',
  { headers: { 'Authorization': `Bearer ${accessToken}` } }
);
const blob = await templateResponse.blob();
// ... download blob

// 3. Upload inspection Excel
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('property_id', 'e6fe5ae9-35df-4f3c-a477-c7df894ab6b2');

const uploadResponse = await fetch(
  'http://localhost:5000/api/inspections/upload',
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: formData
  }
);
const uploadResult = await uploadResponse.json();

console.log(`Parsed ${uploadResult.parsedData.successCount} jobs`);

// 4. Preview parsed jobs
uploadResult.parsedData.jobs.forEach(job => {
  console.log(`${job.title} - ${job.category} (${job.urgency})`);
});

// 5. Create jobs
const createResponse = await fetch(
  `http://localhost:5000/api/inspections/${uploadResult.inspection.id}/create-jobs`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ jobs: uploadResult.parsedData.jobs })
  }
);
const createResult = await createResponse.json();

console.log(`Created ${createResult.jobs.length} jobs!`);

// 6. Get all inspections for property
const inspectionsResponse = await fetch(
  `http://localhost:5000/api/inspections/property/e6fe5ae9-35df-4f3c-a477-c7df894ab6b2`,
  { headers: { 'Authorization': `Bearer ${accessToken}` } }
);
const inspections = await inspectionsResponse.json();

console.log(`Total inspections: ${inspections.count}`);
```

---

## 🔗 Related Documentation

- **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** - Supabase configuration
- **[MAINTENANCE_TEMPLATE_SUPPORT.md](MAINTENANCE_TEMPLATE_SUPPORT.md)** - Maintenance template guide
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Manual API testing
- **[COMPONENTS_SUMMARY.md](COMPONENTS_SUMMARY.md)** - React components guide

---

## 📞 Support

For issues or questions:
1. Check error response messages
2. Verify authentication token
3. Check file format and size
4. Review [TEST_RESULTS.md](TEST_RESULTS.md)
5. See [TROUBLESHOOTING](SUPABASE_SETUP.md#troubleshooting) section

---

**Last Updated:** October 31, 2025
**API Version:** 1.0
**Base URL:** `http://localhost:5000/api`
