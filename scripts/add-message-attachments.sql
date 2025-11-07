-- Add image_url and attachments columns to messages table

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages USING GIN (attachments);

-- Comments for documentation
COMMENT ON COLUMN messages.image_url IS 'URL to uploaded image (single image per message)';
COMMENT ON COLUMN messages.attachments IS 'Array of file attachments with metadata: [{name, url, size, type}]';
