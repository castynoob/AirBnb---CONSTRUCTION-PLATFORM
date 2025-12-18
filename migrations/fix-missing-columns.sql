-- ============================================
-- COMPREHENSIVE DATABASE FIX MIGRATION
-- Adds all missing columns to update schema
-- Date: 2025-01-XX
-- ============================================

-- Start transaction for safety
BEGIN;

-- ============================================
-- 1. USERS TABLE
-- ============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS province VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Populate full_name from existing first_name, middle_name, last_name
UPDATE users
SET full_name = CONCAT_WS(' ', first_name, middle_name, last_name)
WHERE full_name IS NULL AND (first_name IS NOT NULL OR middle_name IS NOT NULL OR last_name IS NOT NULL);

COMMENT ON COLUMN users.full_name IS 'Full name of the user (combined from first, middle, last names)';
COMMENT ON COLUMN users.profile_picture IS 'URL to user profile picture';

-- ============================================
-- 2. MANAGER_PROFILES TABLE
-- ============================================
ALTER TABLE manager_profiles
ADD COLUMN IF NOT EXISTS years_experience INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS expertise_area VARCHAR(255);

COMMENT ON COLUMN manager_profiles.years_experience IS 'Years of property management experience';
COMMENT ON COLUMN manager_profiles.expertise_area IS 'Primary area of expertise';

-- ============================================
-- 3. ENTREPRENEUR_PROFILES TABLE
-- ============================================
ALTER TABLE entrepreneur_profiles
ADD COLUMN IF NOT EXISTS trade VARCHAR(255),
ADD COLUMN IF NOT EXISTS years_experience INTEGER,
ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_expiry DATE;

-- If years_in_business exists, use it for years_experience
UPDATE entrepreneur_profiles
SET years_experience = years_in_business
WHERE years_experience IS NULL AND years_in_business IS NOT NULL;

COMMENT ON COLUMN entrepreneur_profiles.trade IS 'Primary trade/specialty';
COMMENT ON COLUMN entrepreneur_profiles.years_experience IS 'Years of experience in trade';
COMMENT ON COLUMN entrepreneur_profiles.insurance_provider IS 'Insurance company name';
COMMENT ON COLUMN entrepreneur_profiles.insurance_expiry IS 'Insurance expiration date';

-- ============================================
-- 4. RESIDENT_PROFILES TABLE
-- ============================================
ALTER TABLE resident_profiles
ADD COLUMN IF NOT EXISTS property_ownership VARCHAR(50) DEFAULT 'renter',
ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(50) DEFAULT 'email';

COMMENT ON COLUMN resident_profiles.property_ownership IS 'Ownership status: owner, renter, tenant';
COMMENT ON COLUMN resident_profiles.preferred_contact IS 'Preferred contact method: email, phone, sms';

-- ============================================
-- 5. SUPPLIER_PROFILES TABLE
-- ============================================
ALTER TABLE supplier_profiles
ADD COLUMN IF NOT EXISTS business_registration VARCHAR(255),
ADD COLUMN IF NOT EXISTS business_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);

COMMENT ON COLUMN supplier_profiles.business_registration IS 'Business registration number';
COMMENT ON COLUMN supplier_profiles.business_type IS 'Type of business entity';
COMMENT ON COLUMN supplier_profiles.tax_id IS 'Tax identification number';

-- ============================================
-- 6. PROPERTIES TABLE
-- ============================================
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS resident_id UUID,
ADD COLUMN IF NOT EXISTS property_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
ADD COLUMN IF NOT EXISTS bathrooms INTEGER,
ADD COLUMN IF NOT EXISTS square_footage INTEGER,
ADD COLUMN IF NOT EXISTS year_built INTEGER,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Map building_type to property_type if exists
UPDATE properties
SET property_type = building_type
WHERE property_type IS NULL AND building_type IS NOT NULL;

-- Add foreign key for resident_id
ALTER TABLE properties
ADD CONSTRAINT properties_resident_id_fkey
FOREIGN KEY (resident_id) REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN properties.resident_id IS 'Primary resident of the property';
COMMENT ON COLUMN properties.status IS 'Property status: active, inactive, pending';

-- ============================================
-- 7. UNITS TABLE
-- ============================================
ALTER TABLE units
ADD COLUMN IF NOT EXISTS square_footage INTEGER,
ADD COLUMN IF NOT EXISTS occupancy_status VARCHAR(50) DEFAULT 'vacant';

-- Migrate square_feet to square_footage
UPDATE units
SET square_footage = square_feet::INTEGER
WHERE square_footage IS NULL AND square_feet IS NOT NULL;

-- Migrate is_occupied to occupancy_status
UPDATE units
SET occupancy_status = CASE
  WHEN is_occupied = true THEN 'occupied'
  ELSE 'vacant'
END
WHERE occupancy_status = 'vacant' AND is_occupied IS NOT NULL;

COMMENT ON COLUMN units.occupancy_status IS 'Unit occupancy: vacant, occupied, reserved';

-- ============================================
-- 8. JOBS TABLE
-- ============================================
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS severity VARCHAR(50),
ADD COLUMN IF NOT EXISTS priority VARCHAR(50),
ADD COLUMN IF NOT EXISTS deadline DATE,
ADD COLUMN IF NOT EXISTS bid_deadline DATE;

-- Migrate due_date to deadline
UPDATE jobs
SET deadline = due_date
WHERE deadline IS NULL AND due_date IS NOT NULL;

-- Migrate urgency to severity/priority
UPDATE jobs
SET severity = urgency,
    priority = urgency
WHERE (severity IS NULL OR priority IS NULL) AND urgency IS NOT NULL;

COMMENT ON COLUMN jobs.location IS 'Specific location within property';
COMMENT ON COLUMN jobs.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN jobs.priority IS 'Priority level: low, medium, high, urgent';
COMMENT ON COLUMN jobs.deadline IS 'Job completion deadline';
COMMENT ON COLUMN jobs.bid_deadline IS 'Deadline for bid submissions';

-- ============================================
-- 9. BIDS TABLE
-- ============================================
ALTER TABLE bids
ADD COLUMN IF NOT EXISTS timeline_days INTEGER,
ADD COLUMN IF NOT EXISTS proposal TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW();

-- Migrate message to proposal
UPDATE bids
SET proposal = message
WHERE proposal IS NULL AND message IS NOT NULL;

-- Set submitted_at from created_at if not exists
UPDATE bids
SET submitted_at = created_at
WHERE submitted_at IS NULL AND created_at IS NOT NULL;

COMMENT ON COLUMN bids.timeline_days IS 'Estimated days to complete the job';
COMMENT ON COLUMN bids.proposal IS 'Detailed proposal from entrepreneur';
COMMENT ON COLUMN bids.submitted_at IS 'When the bid was submitted';

-- ============================================
-- 10. MESSAGES TABLE
-- ============================================
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_text TEXT,
ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS attachments JSONB;

-- Migrate content to message_text
UPDATE messages
SET message_text = content
WHERE message_text IS NULL AND content IS NOT NULL;

-- Migrate is_read to read
UPDATE messages
SET read = is_read
WHERE read IS NULL AND is_read IS NOT NULL;

-- Add indexes for attachments
CREATE INDEX IF NOT EXISTS idx_messages_image_url ON messages(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages USING GIN (attachments) WHERE attachments IS NOT NULL;

COMMENT ON COLUMN messages.message_text IS 'Message content text';
COMMENT ON COLUMN messages.read IS 'Whether message has been read';
COMMENT ON COLUMN messages.image_url IS 'URL of a single image attachment';
COMMENT ON COLUMN messages.attachments IS 'JSONB array of file attachments';

-- ============================================
-- 11. REVIEWS TABLE
-- ============================================
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS reviewee_id UUID;

-- Migrate reviewed_user_id to reviewee_id
UPDATE reviews
SET reviewee_id = reviewed_user_id
WHERE reviewee_id IS NULL AND reviewed_user_id IS NOT NULL;

-- Add foreign key
ALTER TABLE reviews
ADD CONSTRAINT reviews_reviewee_id_fkey
FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON COLUMN reviews.reviewee_id IS 'User being reviewed';

-- ============================================
-- 12. INSPECTION_REPORTS TABLE
-- ============================================
ALTER TABLE inspection_reports
ADD COLUMN IF NOT EXISTS report_file TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size INTEGER,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS parsed_job_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Migrate file_url to report_file
UPDATE inspection_reports
SET report_file = file_url
WHERE report_file IS NULL AND file_url IS NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_inspection_reports_status ON inspection_reports(status);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_property ON inspection_reports(property_id);

COMMENT ON COLUMN inspection_reports.status IS 'Status: pending, parsed, completed, failed';
COMMENT ON COLUMN inspection_reports.parsed_job_count IS 'Number of jobs parsed from file';

-- ============================================
-- 13. SUPPLIER_REQUESTS TABLE
-- ============================================
ALTER TABLE supplier_requests
ADD COLUMN IF NOT EXISTS job_id UUID,
ADD COLUMN IF NOT EXISTS manager_id UUID,
ADD COLUMN IF NOT EXISTS request_file_url TEXT;

-- Migrate entrepreneur_id to manager_id
UPDATE supplier_requests
SET manager_id = entrepreneur_id
WHERE manager_id IS NULL AND entrepreneur_id IS NOT NULL;

-- Add foreign keys
ALTER TABLE supplier_requests
ADD CONSTRAINT supplier_requests_job_id_fkey
FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
ADD CONSTRAINT supplier_requests_manager_id_fkey
FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON COLUMN supplier_requests.request_file_url IS 'URL of uploaded PDF document';

-- ============================================
-- 14. SUPPLIER_INVOICES TABLE
-- ============================================
ALTER TABLE supplier_invoices
ADD COLUMN IF NOT EXISTS supplier_request_id UUID,
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS due_date DATE;

-- Migrate request_id to supplier_request_id
UPDATE supplier_invoices
SET supplier_request_id = request_id
WHERE supplier_request_id IS NULL AND request_id IS NOT NULL;

-- Migrate total_amount to amount
UPDATE supplier_invoices
SET amount = total_amount
WHERE amount IS NULL AND total_amount IS NOT NULL;

-- Add foreign key
ALTER TABLE supplier_invoices
ADD CONSTRAINT supplier_invoices_supplier_request_id_fkey
FOREIGN KEY (supplier_request_id) REFERENCES supplier_requests(id) ON DELETE CASCADE;

COMMENT ON COLUMN supplier_invoices.supplier_request_id IS 'Associated supplier request';
COMMENT ON COLUMN supplier_invoices.invoice_number IS 'Unique invoice number';

-- ============================================
-- 15. SUBSCRIPTIONS TABLE
-- ============================================
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;

-- Migrate plan_type to subscription_type
UPDATE subscriptions
SET subscription_type = plan_type
WHERE subscription_type IS NULL AND plan_type IS NOT NULL;

-- Migrate current_period dates
UPDATE subscriptions
SET start_date = current_period_start,
    end_date = current_period_end
WHERE (start_date IS NULL OR end_date IS NULL)
  AND current_period_start IS NOT NULL;

COMMENT ON COLUMN subscriptions.subscription_type IS 'Type of subscription plan';
COMMENT ON COLUMN subscriptions.start_date IS 'Subscription start date';
COMMENT ON COLUMN subscriptions.end_date IS 'Subscription end date';

-- ============================================
-- COMMIT TRANSACTION
-- ============================================
COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Migration completed successfully!' as status;

-- Show summary of changes
SELECT
  'Added missing columns and migrated data' as summary,
  'Run the check-database.js script to verify' as next_step;
