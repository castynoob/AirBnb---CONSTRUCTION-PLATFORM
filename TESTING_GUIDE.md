# Manual Testing Guide for Supabase Inspection Feature

## Prerequisites

Before testing, ensure:
- ✅ Server is running on `http://localhost:5000`
- ✅ Supabase credentials are configured in `.env`
- ✅ Database migration has been run
- ✅ You have a valid JWT token from a property_manager user

---

## Step 1: Get Authentication Token

### Option A: Use existing user credentials
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "YOUR_EMAIL",
    "password": "YOUR_PASSWORD"
  }'
```

### Option B: Register a new test user
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.inspection@example.com",
    "password": "Test123!",
    "first_name": "Test",
    "last_name": "User",
    "role": "property_manager",
    "phone_number": "555-0123"
  }'
```

**Save the token from the response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

Export it for easy use:
```bash
export TOKEN="your-jwt-token-here"
```

---

## Step 2: Get or Create a Property

### Get existing properties:
```bash
curl -X GET http://localhost:5000/api/properties \
  -H "Authorization: Bearer $TOKEN"
```

### Create a test property (if needed):
```bash
curl -X POST http://localhost:5000/api/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "Test Property for Inspection",
    "address": "123 Test Street",
    "city": "Test City",
    "state": "CA",
    "zip_code": "12345"
  }'
```

**Save the property ID:**
```bash
export PROPERTY_ID="property-uuid-here"
```

---

## Step 3: Download Inspection Template

```bash
curl -X GET http://localhost:5000/api/inspections/template \
  -H "Authorization: Bearer $TOKEN" \
  --output inspection-template.xlsx
```

**Expected result:** Excel file downloaded as `inspection-template.xlsx`

**Verify:**
```bash
ls -lh inspection-template.xlsx
file inspection-template.xlsx
```

---

## Step 4: Upload Inspection Excel

```bash
curl -X POST http://localhost:5000/api/inspections/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@inspection-template.xlsx" \
  -F "property_id=$PROPERTY_ID"
```

**Expected response:**
```json
{
  "success": true,
  "message": "Successfully uploaded inspection. Found X jobs.",
  "inspection": {
    "id": "inspection-uuid",
    "property_id": "property-uuid",
    "file_name": "inspection-template.xlsx",
    "file_url": "https://rwsqujvvibcjaomqjovp.supabase.co/storage/...",
    "uploaded_at": "2025-01-30T...",
    "status": "parsed"
  },
  "parsedData": {
    "totalRows": 3,
    "successCount": 3,
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
    ]
  }
}
```

**Save the inspection ID:**
```bash
export INSPECTION_ID="inspection-uuid-here"
```

---

## Step 5: Preview Inspection (Optional)

Re-parse the Excel file to preview jobs:

```bash
curl -X GET http://localhost:5000/api/inspections/$INSPECTION_ID/preview \
  -H "Authorization: Bearer $TOKEN"
```

---

## Step 6: Create Jobs from Inspection

Copy the `jobs` array from the upload response and create actual jobs:

```bash
curl -X POST http://localhost:5000/api/inspections/$INSPECTION_ID/create-jobs \
  -H "Authorization: Bearer $TOKEN" \
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
      },
      {
        "title": "Repaint hallway",
        "description": "Fresh coat needed",
        "category": "Painting",
        "urgency": "Low",
        "budget": 500,
        "location": "2nd Floor"
      }
    ]
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Successfully created X jobs from inspection",
  "jobs": [/* array of created jobs */],
  "inspection": {
    "id": "inspection-uuid",
    "status": "completed"
  }
}
```

---

## Step 7: Get All Inspections for Property

```bash
curl -X GET http://localhost:5000/api/inspections/property/$PROPERTY_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "success": true,
  "count": 1,
  "inspections": [
    {
      "id": "inspection-uuid",
      "property_id": "property-uuid",
      "file_name": "inspection-template.xlsx",
      "file_url": "https://...",
      "uploaded_at": "2025-01-30T...",
      "status": "completed",
      "parsed_job_count": 3,
      "first_name": "Test",
      "last_name": "User"
    }
  ]
}
```

---

## Step 8: Verify in Supabase Dashboard

1. Go to [https://supabase.com](https://supabase.com)
2. Open your project: `rwsqujvvibcjaomqjovp`
3. Navigate to **Storage > inspections**
4. Look for folder named after your property ID
5. Verify the Excel file is present

---

## Step 9: Verify Jobs Created

Check that jobs were created in the database:

```bash
curl -X GET http://localhost:5000/api/jobs/property/$PROPERTY_ID \
  -H "Authorization: Bearer $TOKEN"
```

Or query the database directly:

```bash
psql $DATABASE_URL -c "
SELECT id, title, category, urgency, budget, location
FROM jobs
WHERE property_id = '$PROPERTY_ID'
ORDER BY created_at DESC
LIMIT 10;
"
```

---

## Step 10: Delete Inspection (Optional)

```bash
curl -X DELETE http://localhost:5000/api/inspections/$INSPECTION_ID \
  -H "Authorization: Bearer $TOKEN"
```

This will:
- Delete the file from Supabase storage
- Delete the database record
- Jobs created from the inspection will remain (not deleted)

---

## Troubleshooting

### Error: "Authorization token required"
- Make sure you're including the `Authorization: Bearer $TOKEN` header
- Check that your token hasn't expired
- Try logging in again to get a fresh token

### Error: "Bucket 'inspections' not found"
1. Go to Supabase dashboard
2. Navigate to Storage
3. Create bucket named `inspections` (private, 10MB limit)

### Error: "Property not found"
- Verify the property ID exists
- Make sure you're using the correct property ID from Step 2

### Error: "Could not find Title column"
- Excel file must have a "Title" or "Job Title" column
- Download the template again and ensure it has the required columns

### Parse errors in response
Check the `errors` array in the upload response:
```json
{
  "parsedData": {
    "errors": [
      { "row": 5, "error": "Missing title", "data": {...} }
    ]
  }
}
```

---

## Expected Behavior Summary

✅ **Upload:**
- Excel file is uploaded to Supabase storage
- File is parsed and jobs are extracted
- Inspection record is created with status "parsed"

✅ **Create Jobs:**
- Jobs are created in the database
- Inspection status is updated to "completed"
- Job count is stored in inspection record

✅ **Storage:**
- Files are organized by property ID in Supabase
- Files are private and require authentication
- File URLs are signed URLs with expiration

---

## Quick Test Script

Here's a complete bash script to test all endpoints:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:5000/api"
EMAIL="test.inspection@example.com"
PASSWORD="Test123!"

echo "1. Registering user..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"first_name\": \"Test\",
    \"last_name\": \"User\",
    \"role\": \"property_manager\",
    \"phone_number\": \"555-0123\"
  }")

echo "$REGISTER_RESPONSE" | jq .

echo -e "\n2. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
echo "Token: ${TOKEN:0:50}..."

echo -e "\n3. Creating property..."
PROPERTY_RESPONSE=$(curl -s -X POST $API_URL/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "Test Property",
    "address": "123 Test St",
    "city": "Test City",
    "state": "CA",
    "zip_code": "12345"
  }')

PROPERTY_ID=$(echo "$PROPERTY_RESPONSE" | jq -r '.property.id')
echo "Property ID: $PROPERTY_ID"

echo -e "\n4. Downloading template..."
curl -s -X GET $API_URL/inspections/template \
  -H "Authorization: Bearer $TOKEN" \
  --output template.xlsx

echo "Template downloaded: $(ls -lh template.xlsx)"

echo -e "\n5. Uploading inspection..."
UPLOAD_RESPONSE=$(curl -s -X POST $API_URL/inspections/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@template.xlsx" \
  -F "property_id=$PROPERTY_ID")

echo "$UPLOAD_RESPONSE" | jq .

INSPECTION_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.inspection.id')
JOBS_JSON=$(echo "$UPLOAD_RESPONSE" | jq -c '.parsedData.jobs')

echo -e "\n6. Creating jobs..."
CREATE_JOBS_RESPONSE=$(curl -s -X POST $API_URL/inspections/$INSPECTION_ID/create-jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"jobs\": $JOBS_JSON}")

echo "$CREATE_JOBS_RESPONSE" | jq .

echo -e "\n7. Getting inspections..."
curl -s -X GET $API_URL/inspections/property/$PROPERTY_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

echo -e "\n✅ All tests completed!"
```

Save this as `quick-test.sh`, make it executable with `chmod +x quick-test.sh`, and run it!

---

## Success Criteria

All tests pass if:
- ✅ Template downloads successfully (Excel file)
- ✅ Upload returns parsed jobs with no errors
- ✅ Jobs are created in the database
- ✅ Inspection status changes from "parsed" to "completed"
- ✅ File appears in Supabase storage
- ✅ Can retrieve inspections by property

**Feature is working correctly! 🎉**
