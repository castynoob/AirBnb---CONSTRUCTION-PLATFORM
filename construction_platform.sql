
-- Construction Platform Database Schema (PostgreSQL)
-- Generated on: 2025-10-15 12:03:43

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(50),
    first_name VARCHAR(255),
    middle_name VARCHAR(255),
    last_name VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Entrepreneur Profiles
CREATE TABLE entrepreneur_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    license_number VARCHAR(100),
    years_in_business INT,
    num_employees INT,
    address TEXT,
    specializations TEXT[],
    average_rating NUMERIC(3,2),
    total_reviews INT,
    portfolio JSONB,
    subscription_plan VARCHAR(20),
    subscription_start TIMESTAMP,
    subscription_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Manager Profiles
CREATE TABLE manager_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    address TEXT,
    total_properties INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Properties
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manager_id UUID REFERENCES manager_profiles(id) ON DELETE CASCADE,
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    num_units INT,
    building_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inspection Reports
CREATE TABLE inspection_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    file_url TEXT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES manager_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    urgency VARCHAR(50),
    due_date DATE,
    estimated_duration_days INT,
    budget_min NUMERIC(12,2),
    budget_max NUMERIC(12,2),
    is_budget_hidden BOOLEAN DEFAULT FALSE,
    is_emergency BOOLEAN DEFAULT FALSE,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Bids
CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    entrepreneur_id UUID REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2),
    message TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Favorites
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manager_id UUID REFERENCES manager_profiles(id) ON DELETE CASCADE,
    entrepreneur_id UUID REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id),
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Budget Unlocks
CREATE TABLE budget_unlocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entrepreneur_id UUID REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12,2),
    payment_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Resident Profiles
CREATE TABLE resident_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(20),
    move_in_date DATE,
    contact_preferences JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Supplier Profiles
CREATE TABLE supplier_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    address TEXT,
    phone VARCHAR(50),
    website TEXT,
    catalog_pdf_url TEXT,
    business_license TEXT,
    years_in_business INT,
    delivery_areas TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Supplier Requests
CREATE TABLE supplier_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entrepreneur_id UUID REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES supplier_profiles(id) ON DELETE CASCADE,
    request_details TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Supplier Invoices
CREATE TABLE supplier_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID REFERENCES supplier_requests(id) ON DELETE CASCADE,
    items JSONB,
    total_amount NUMERIC(12,2),
    delivery_terms TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reviewed_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id),
    rating INT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
