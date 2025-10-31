# Supabase File Upload & Inspection System Setup Guide

## Overview

This construction platform backend now includes **Supabase integration** for file storage and **inspection Excel parsing** for bulk job creation. This guide covers setup, configuration, and usage.

---

## Table of Contents

1. [Features Implemented](#features-implemented)
2. [Supabase Setup](#supabase-setup)
3. [Storage Buckets Configuration](#storage-buckets-configuration)
4. [Database Migration](#database-migration)
5. [API Endpoints](#api-endpoints)
6. [Excel Template Format](#excel-template-format)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Features Implemented

### Phase 2: Inspection Excel Upload & Bulk Job Creation (COMPLETED)

✅ **Inspection Management:**
- Upload inspection Excel files (.xlsx, .xls, .csv)
- Automatic parsing of job data from Excel
- Preview parsed jobs before creation
- Bulk job creation from parsed data
- Download inspection Excel template
- Track inspection status (pending, parsed, completed)

✅ **File Storage:**
- Supabase storage integration
- Secure file uploads with authentication
- Automatic file validation (type, size)
- Unique file naming with UUIDs

✅ **Job Creation:**
- Parse multiple jobs from single Excel file
- Support for English translations of non-English columns
- Automatic data validation and normalization
- Transaction-based bulk job creation

---

## Supabase Setup

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in project details:
   - **Name:** `construction-platform` (or your preferred name)
   - **Database Password:** Create a strong password (save it!)
   - **Region:** Choose closest to your users
   - **Pricing Plan:** Free tier is sufficient for development

5. Wait 2-3 minutes for project to be created

### Step 2: Get API Keys

1. In your Supabase dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxxxxxxx.supabase.co`)
   - **anon public key** (starts with `eyJhbG...`)
   - **service_role key** (starts with `eyJhbG...`) - **Keep this secret!**

### Step 3: Update Environment Variables

Your `.env` file already has Supabase credentials configured:

```env
SUPABASE_URL=https://rwsqujvvibcjaomqjovp.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

✅ **Your credentials are already set!** Supabase is ready to use.

---

## Storage Buckets Configuration

### Required Storage Buckets

The system uses 4 storage buckets:

| Bucket Name | Purpose | Public | File Types | Max Size |
|------------|---------|--------|------------|----------|
| `inspections` | Inspection Excel files | Private | .xlsx, .xls, .csv | 10MB |
| `job-images` | Job/project photos | Public | .jpg, .png, .webp | 5MB |
| `profile-images` | User profile pictures | Public | .jpg, .png, .webp | 5MB |
| `property-images` | Property photos | Public | .jpg, .png, .webp | 5MB |

### Automatic Bucket Creation

Buckets are automatically created when you first start the server. However, you can also create them manually:

#### Manual Bucket Creation:

1. Go to **Storage** in your Supabase dashboard
2. Click **"New bucket"**
3. Create each bucket with these settings:

**For `inspections` bucket:**
- Name: `inspections`
- Public: **No** (private)
- File size limit: `10485760` (10MB)
- Allowed MIME types: Add these types:
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.ms-excel`
  - `text/csv`

**For `job-images`, `profile-images`, `property-images` buckets:**
- Public: **Yes**
- File size limit: `5242880` (5MB)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

### Storage Policies (Row Level Security)

For the `inspections` bucket, add this policy:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload inspections"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inspections');

-- Allow users to read their own files
CREATE POLICY "Users can read own inspections"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'inspections' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own inspections"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inspections' AND auth.uid()::text = (storage.foldername(name))[1]);
```

For public buckets (`job-images`, `profile-images`, `property-images`):
- Public access is automatically configured
- No additional policies needed

---

## Database Migration

### Run the Migration

Execute the SQL migration to add required columns:

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Run the migration
\i migrations/003_inspection_updates.sql
```

Or execute directly:

```sql
-- Add profile_picture column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Update inspection_reports table
ALTER TABLE inspection_reports
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS parsed_job_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inspection_reports_status ON inspection_reports(status);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_property ON inspection_reports(property_id);
```

### Verify Migration

```sql
-- Check if columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'inspection_reports'
AND column_name IN ('file_name', 'file_size', 'file_type', 'parsed_job_count', 'status');
```

---

## API Endpoints

### Inspection Endpoints

#### 1. Download Inspection Template
```http
GET /api/inspections/template
Authorization: Bearer {token}
```

**Response:** Excel file download

**Example (cURL):**
```bash
curl -X GET http://localhost:5000/api/inspections/template \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output inspection-template.xlsx
```

---

#### 2. Upload Inspection Excel
```http
POST /api/inspections/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data
Role: property_manager
```

**Body (Form Data):**
- `file`: Excel file (.xlsx, .xls, .csv)
- `property_id`: UUID of property

**Response:**
```json
{
  "success": true,
  "message": "Successfully uploaded inspection. Found 15 jobs.",
  "inspection": {
    "id": "uuid",
    "property_id": "uuid",
    "file_name": "inspection.xlsx",
    "file_url": "https://...",
    "uploaded_at": "2025-01-30T...",
    "status": "parsed"
  },
  "parsedData": {
    "totalRows": 15,
    "successCount": 15,
    "errorCount": 0,
    "jobs": [
      {
        "title": "Fix leaking faucet",
        "description": "Kitchen faucet dripping",
        "category": "Plumbing",
        "urgency": "Medium",
        "budget": 150,
        "location": "Unit 101",
        "sourceRow": 2
      }
      // ... more jobs
    ],
    "detectedColumns": ["Job Title", "Description", "Category", ...],
    "fieldMapping": { "Job Title": "title", ... }
  }
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', excelFile);
formData.append('property_id', 'property-uuid');

const response = await fetch('http://localhost:5000/api/inspections/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(`Parsed ${result.parsedData.successCount} jobs`);
```

---

#### 3. Create Jobs from Inspection
```http
POST /api/inspections/:id/create-jobs
Authorization: Bearer {token}
Content-Type: application/json
Role: property_manager
```

**Body:**
```json
{
  "jobs": [
    {
      "title": "Fix leaking faucet",
      "description": "Kitchen faucet dripping",
      "category": "Plumbing",
      "urgency": "Medium",
      "budget": 150,
      "location": "Unit 101"
    }
    // ... array of jobs from parsed data
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully created 15 jobs from inspection",
  "jobs": [/* array of created job objects */],
  "inspection": {
    "id": "uuid",
    "status": "completed"
  }
}
```

---

#### 4. Get Inspections by Property
```http
GET /api/inspections/property/:propertyId
Authorization: Bearer {token}
Role: property_manager
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "inspections": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "file_name": "inspection.xlsx",
      "file_url": "https://...",
      "uploaded_at": "2025-01-30T...",
      "status": "completed",
      "parsed_job_count": 15,
      "first_name": "John",
      "last_name": "Doe"
    }
    // ... more inspections
  ]
}
```

---

#### 5. Preview Inspection
```http
GET /api/inspections/:id/preview
Authorization: Bearer {token}
Role: property_manager
```

Re-parses the Excel file to show job preview.

---

#### 6. Delete Inspection
```http
DELETE /api/inspections/:id
Authorization: Bearer {token}
Role: property_manager
```

Deletes both the file from Supabase and database record.

---

## Excel Template Format

### Standard Column Names (English)

The parser automatically detects these columns (case-insensitive):

| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| **Job Title** or **Title** | ✅ Yes | Name of the job | "Fix leaking faucet" |
| **Description** or **Details** | No | Job details | "Kitchen faucet dripping continuously" |
| **Category** or **Type** | No | Work category | "Plumbing", "Electrical", "HVAC" |
| **Urgency** or **Priority** | No | Urgency level | "Low", "Medium", "High", "Critical" |
| **Budget** or **Cost** | No | Estimated cost | 150, "$150", "150.00" |
| **Location** or **Area** | No | Specific location | "Unit 101 - Kitchen", "2nd Floor" |
| **Due Date** or **Deadline** | No | Completion date | Excel date or "2025-02-15" |
| **Notes** or **Comments** | No | Additional info | "Tenant reported on Monday" |

### Supported Categories

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

### Urgency Levels

- **Low** (1)
- **Medium** (2, default)
- **High** (3)
- **Critical** (4, emergency)

### Example Excel File

| Job Title | Description | Category | Urgency | Budget | Location | Due Date | Notes |
|-----------|-------------|----------|---------|--------|----------|----------|-------|
| Fix leaking faucet | Kitchen faucet dripping | Plumbing | Medium | 150 | Unit 101 | 2025-02-07 | Tenant reported |
| Repaint hallway | Fresh coat needed | Painting | Low | 500 | 2nd Floor | 2025-02-14 | Use off-white |
| Emergency outlet repair | Outlet sparking | Electrical | Critical | 300 | Unit 205 | 2025-02-01 | URGENT |

### Non-English Column Support

The parser is flexible and can handle translated column names. The mapping system will attempt to match similar columns:

**Example (if your Excel uses other names):**
- "Task" → maps to "title"
- "Work Description" → maps to "description"
- "Trade" → maps to "category"
- "Room" → maps to "location"

If you have a specific Excel format with non-English columns, share it and we can add custom mappings!

---

## Testing

### 1. Test Supabase Connection

```bash
npm start
```

Look for:
```
[Supabase] ✓ Configured - File uploads enabled
```

### 2. Download Template

```bash
curl -X GET http://localhost:5000/api/inspections/template \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output template.xlsx
```

Open `template.xlsx` to see the example format.

### 3. Upload Test Inspection

```bash
# Using the template you just downloaded
curl -X POST http://localhost:5000/api/inspections/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@template.xlsx" \
  -F "property_id=YOUR_PROPERTY_UUID"
```

### 4. Verify Upload in Supabase

1. Go to **Storage > inspections** in Supabase dashboard
2. You should see your uploaded file in a folder named after the property ID

### 5. Check Database Record

```sql
SELECT * FROM inspection_reports
ORDER BY uploaded_at DESC
LIMIT 1;
```

---

## Troubleshooting

### Supabase Not Configured

**Error:** `[Supabase] ⚠ Not configured - File uploads will not work`

**Solution:**
1. Check `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Verify keys are correct (no extra spaces)
3. Restart server: `npm start`

---

### Upload Fails with "Invalid file type"

**Error:** `Invalid file type. Allowed types: ...`

**Solution:**
- Ensure file is `.xlsx`, `.xls`, or `.csv`
- Check file isn't corrupted
- Try re-saving file in Excel

---

### "Could not find Title column"

**Error:** `Could not find "Title" or "Job Title" column`

**Solution:**
- Excel file must have a column named "Title", "Job Title", or similar
- Check column names match expected format
- Download template for reference: `GET /api/inspections/template`

---

### Bucket Not Found

**Error:** `Bucket 'inspections' not found`

**Solution:**
1. Go to Supabase dashboard > **Storage**
2. Click **"New bucket"**
3. Create bucket named `inspections` (exact name, lowercase)
4. Set to private, 10MB limit

---

### Parse Errors

If parsing fails, check the `errors` array in the response:

```json
{
  "parsedData": {
    "errorCount": 2,
    "errors": [
      {
        "row": 5,
        "error": "Missing title",
        "data": { /* original row data */ }
      }
    ]
  }
}
```

**Common issues:**
- Missing title (required field)
- Invalid category (must match supported categories)
- Malformed dates
- Non-numeric budget values

---

### File Too Large

**Error:** `File too large`

**Limits:**
- Excel files: 10MB max
- Images: 5MB max

**Solution:**
- Compress Excel file (remove unnecessary sheets)
- For images, reduce resolution or compress

---

## Next Steps

### Phase 3: Job Image Uploads (Coming Next)

- Upload multiple images per job
- Image gallery for jobs
- Caption support
- Image deletion

### Phase 4: Profile Images (Coming Next)

- User profile pictures
- Manager company logos
- Entrepreneur profile photos

### Phase 5: Property Images (Coming Next)

- Property exterior/interior photos
- Property image management

---

## File Structure Summary

```
src/
├── config/
│   └── supabase.js           # Supabase client configuration
├── controllers/
│   └── inspectionController.js  # Inspection upload & job creation
├── middleware/
│   └── uploadMiddleware.js    # Multer file upload middleware
├── models/
│   ├── inspectionModel.js     # Inspection database operations
│   └── jobModel.js            # Job model with bulkCreateJobs()
├── routes/
│   └── inspectionRoutes.js    # Inspection API routes
└── utils/
    ├── supabaseHelpers.js     # Upload/delete/URL helpers
    └── excelParser.js         # Excel parsing utility

migrations/
└── 003_inspection_updates.sql  # Database schema updates

.env                           # Supabase credentials (already configured)
```

---

## Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify Supabase credentials in `.env`
3. Ensure database migration was run
4. Test with the provided template first
5. Check Supabase dashboard for storage logs

---

**Congratulations!** Your construction platform now supports inspection Excel uploads and bulk job creation with Supabase! 🎉

**Current Status:**
- ✅ Phase 1: Infrastructure - COMPLETE
- ✅ Phase 2: Inspection Upload & Bulk Jobs - COMPLETE
- ⏳ Phase 3: Job Images - Ready to implement
- ⏳ Phase 4: Profile Images - Ready to implement
- ⏳ Phase 5: Property Images - Ready to implement
