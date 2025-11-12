# Database Migrations

## Favorites Table Migration

### What This Migration Does

This migration adds missing columns to the `favorites` table to support the complete favorites functionality:

**New Columns:**
- `job_id` (uuid) - References the job associated with the favorite
- `bid_id` (uuid) - References the specific bid that was favorited
- `notes` (text) - Manager's notes about the entrepreneur

**New Constraints:**
- Foreign key for `job_id` → `jobs(id)` with CASCADE delete
- Foreign key for `bid_id` → `bids(id)` with CASCADE delete
- Unique index to prevent duplicate favorites (manager + entrepreneur + bid combination)

**New Indexes:**
- `idx_favorites_manager_id` - Fast lookups by manager
- `idx_favorites_entrepreneur_id` - Fast lookups by entrepreneur
- `idx_favorites_bid_id` - Fast lookups by bid (when not NULL)
- `idx_favorites_job_id` - Fast lookups by job (when not NULL)

### How to Run the Migration

#### Option 1: Using psql (Command Line)

```bash
# Connect to your database and run the migration
psql -h localhost -U your_username -d construction_platform -f migrations/add_favorites_columns.sql
```

#### Option 2: Using pgAdmin or Database GUI

1. Open pgAdmin or your preferred PostgreSQL GUI
2. Connect to the `construction_platform` database
3. Open the Query Tool
4. Copy and paste the contents of `add_favorites_columns.sql`
5. Execute the query

#### Option 3: Using Node.js Migration Script

```bash
# Run the migration script
node migrations/run-migration.js
```

### Verification

After running the migration, verify the changes:

```sql
-- Check the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'favorites'
ORDER BY ordinal_position;

-- Check the indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'favorites';

-- Check the constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'favorites'::regclass;
```

### Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Drop the indexes
DROP INDEX IF EXISTS idx_favorites_manager_id;
DROP INDEX IF EXISTS idx_favorites_entrepreneur_id;
DROP INDEX IF EXISTS idx_favorites_bid_id;
DROP INDEX IF EXISTS idx_favorites_job_id;
DROP INDEX IF EXISTS favorites_unique_idx;

-- Drop the foreign key constraints
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_job_id_fkey;
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_bid_id_fkey;

-- Drop the columns
ALTER TABLE favorites DROP COLUMN IF EXISTS job_id;
ALTER TABLE favorites DROP COLUMN IF EXISTS bid_id;
ALTER TABLE favorites DROP COLUMN IF EXISTS notes;
```

### Impact

- **Data Safety**: This migration is **non-destructive**. It only adds columns and doesn't modify existing data.
- **Backward Compatibility**: Existing code will continue to work as the new columns are nullable.
- **Performance**: New indexes will improve query performance for favorites lookups.
