-- Migration: Add request_file_url column to supplier_requests table
-- This allows suppliers to receive material requests as PDF files in addition to text

ALTER TABLE supplier_requests
ADD COLUMN request_file_url TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN supplier_requests.request_file_url IS 'URL of the uploaded PDF document containing material request details';
