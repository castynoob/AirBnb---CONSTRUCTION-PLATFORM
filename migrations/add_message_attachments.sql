-- ============================================
-- Migration: Add image_url and attachments to messages table
-- ============================================

-- Add image_url column for single images
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add attachments column for file attachments (stored as JSONB array)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachments JSONB;

-- Add index for faster queries on messages with images
CREATE INDEX IF NOT EXISTS idx_messages_image_url ON messages(image_url) WHERE image_url IS NOT NULL;

-- Add index for messages with attachments
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages USING GIN (attachments) WHERE attachments IS NOT NULL;

-- Comment the columns
COMMENT ON COLUMN messages.image_url IS 'URL of a single image attachment';
COMMENT ON COLUMN messages.attachments IS 'JSONB array of file attachments with {url, fileName, size, type}';
