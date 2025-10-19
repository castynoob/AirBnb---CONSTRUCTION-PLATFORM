-- ============================================
-- PAYMENT SYSTEM MIGRATION
-- Add Stripe integration to existing database
-- ============================================

-- 1. Add stripe_customer_id to users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;

-- 2. Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entrepreneur_profile_id UUID REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('basic', 'premium')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
    trial_end TIMESTAMP,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 3. Update budget_unlocks table
ALTER TABLE budget_unlocks
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255) UNIQUE;

ALTER TABLE budget_unlocks
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'succeeded';

ALTER TABLE budget_unlocks
ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMP DEFAULT NOW();

-- Rename amount_paid to amount
DO $$ 
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns 
              WHERE table_name='budget_unlocks' AND column_name='amount_paid') THEN
        ALTER TABLE budget_unlocks RENAME COLUMN amount_paid TO amount;
    END IF;
END $$;

-- Convert amount to INTEGER (cents)
ALTER TABLE budget_unlocks
ALTER COLUMN amount TYPE INTEGER USING (amount * 100)::INTEGER;

-- Add unique constraint
ALTER TABLE budget_unlocks
ADD CONSTRAINT IF NOT EXISTS unique_entrepreneur_job UNIQUE(entrepreneur_id, job_id);

-- 4. Create bid_counts table
CREATE TABLE IF NOT EXISTS bid_counts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entrepreneur_profile_id UUID NOT NULL REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    bids_used INTEGER DEFAULT 0 CHECK (bids_used >= 0),
    bids_limit INTEGER DEFAULT 30 CHECK (bids_limit > 0),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_entrepreneur_id ON subscriptions(entrepreneur_profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_budget_unlocks_entrepreneur_job ON budget_unlocks(entrepreneur_id, job_id);
CREATE INDEX IF NOT EXISTS idx_bid_counts_entrepreneur_id ON bid_counts(entrepreneur_profile_id);
CREATE INDEX IF NOT EXISTS idx_bid_counts_period_end ON bid_counts(period_end);

-- 6. Create/update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. Add triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bid_counts_updated_at ON bid_counts;
CREATE TRIGGER update_bid_counts_updated_at 
    BEFORE UPDATE ON bid_counts
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Verification
DO $$ 
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('subscriptions', 'bid_counts');
    
    IF table_count = 2 THEN
        RAISE NOTICE '✅ Payment system migration completed successfully!';
        RAISE NOTICE '📊 Tables created: subscriptions, bid_counts';
        RAISE NOTICE '💳 Users table updated with stripe_customer_id';
    ELSE
        RAISE WARNING '⚠️ Migration may not have completed fully. Expected 2 tables, found %', table_count;
    END IF;
END $$;