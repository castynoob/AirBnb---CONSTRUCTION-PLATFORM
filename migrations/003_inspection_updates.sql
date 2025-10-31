-- ============================================
-- MIGRATION: Inspection & File Upload Updates
-- Date: 2025-01-30
-- Description: Add columns for file uploads and inspection tracking
-- ============================================

-- Add profile_picture column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Update inspection_reports table with file metadata
ALTER TABLE inspection_reports
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS parsed_job_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Add comment for clarity
COMMENT ON COLUMN inspection_reports.status IS 'Status: pending (uploaded), parsed (jobs extracted), completed (jobs created), failed (error occurred)';
COMMENT ON COLUMN inspection_reports.parsed_job_count IS 'Number of jobs successfully parsed from Excel file';

-- Create index on inspection status for faster queries
CREATE INDEX IF NOT EXISTS idx_inspection_reports_status ON inspection_reports(status);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_property ON inspection_reports(property_id);

-- ============================================
-- OPTIONAL: Add images array to jobs table
-- (Alternative: use existing images table)
-- ============================================
-- Uncomment if you want to store image URLs directly in jobs table
-- ALTER TABLE jobs
-- ADD COLUMN IF NOT EXISTS images TEXT[];

-- ============================================
-- Verification Queries (Run these after migration)
-- ============================================

-- Check if columns were added successfully
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'inspection_reports'
-- AND column_name IN ('file_name', 'file_size', 'file_type', 'parsed_job_count', 'status');

-- Check if indexes were created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'inspection_reports';
