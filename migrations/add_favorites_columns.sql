-- ============================================
-- FAVORITES TABLE MIGRATION
-- Add missing columns: job_id, bid_id, notes
-- ============================================

-- Add job_id column (references jobs table)
ALTER TABLE favorites
ADD COLUMN IF NOT EXISTS job_id uuid;

-- Add bid_id column (references bids table)
ALTER TABLE favorites
ADD COLUMN IF NOT EXISTS bid_id uuid;

-- Add notes column for manager notes about the entrepreneur
ALTER TABLE favorites
ADD COLUMN IF NOT EXISTS notes text;

-- Add foreign key constraint for job_id
ALTER TABLE favorites
ADD CONSTRAINT favorites_job_id_fkey
FOREIGN KEY (job_id)
REFERENCES jobs(id)
ON DELETE CASCADE;

-- Add foreign key constraint for bid_id
ALTER TABLE favorites
ADD CONSTRAINT favorites_bid_id_fkey
FOREIGN KEY (bid_id)
REFERENCES bids(id)
ON DELETE CASCADE;

-- Create a unique constraint to prevent duplicate favorites
-- A manager can favorite the same entrepreneur multiple times, but not with the same bid
-- Using COALESCE to handle NULL bid_ids properly
CREATE UNIQUE INDEX IF NOT EXISTS favorites_unique_idx
ON favorites (manager_id, entrepreneur_id, COALESCE(bid_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_favorites_manager_id ON favorites(manager_id);
CREATE INDEX IF NOT EXISTS idx_favorites_entrepreneur_id ON favorites(entrepreneur_id);
CREATE INDEX IF NOT EXISTS idx_favorites_bid_id ON favorites(bid_id) WHERE bid_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_favorites_job_id ON favorites(job_id) WHERE job_id IS NOT NULL;

-- Display the updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'favorites'
ORDER BY ordinal_position;
