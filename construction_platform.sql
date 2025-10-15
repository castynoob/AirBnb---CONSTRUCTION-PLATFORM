
-- Construction Platform Database Schema (MySQL)
-- Generated on: 2025-10-15 10:12:50

CREATE DATABASE IF NOT EXISTS construction_platform;
USE construction_platform;

-- Users Table
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(50),
    first_name VARCHAR(255),
    middle_name VARCHAR(255),
    last_name VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Entrepreneur Profiles
CREATE TABLE entrepreneur_profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    company_name VARCHAR(255),
    license_number VARCHAR(100),
    years_in_business INT,
    num_employees INT,
    address TEXT,
    specializations JSON,
    average_rating DECIMAL(3,2),
    total_reviews INT,
    portfolio JSON,
    subscription_plan VARCHAR(20),
    subscription_start TIMESTAMP,
    subscription_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Manager Profiles
CREATE TABLE manager_profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    company_name VARCHAR(255),
    address TEXT,
    total_properties INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Properties
CREATE TABLE properties (
    id CHAR(36) PRIMARY KEY,
    manager_id CHAR(36),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    num_units INT,
    building_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES manager_profiles(id)
);

-- Inspection Reports
CREATE TABLE inspection_reports (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36),
    file_url TEXT,
    uploaded_by CHAR(36),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Jobs
CREATE TABLE jobs (
    id CHAR(36) PRIMARY KEY,
    property_id CHAR(36),
    manager_id CHAR(36),
    title VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    urgency VARCHAR(50),
    due_date DATE,
    estimated_duration_days INT,
    budget_min DECIMAL(12,2),
    budget_max DECIMAL(12,2),
    is_budget_hidden BOOLEAN DEFAULT FALSE,
    is_emergency BOOLEAN DEFAULT FALSE,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (manager_id) REFERENCES manager_profiles(id)
);

-- Bids
CREATE TABLE bids (
    id CHAR(36) PRIMARY KEY,
    job_id CHAR(36),
    entrepreneur_id CHAR(36),
    amount DECIMAL(12,2),
    message TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id)
);

-- Favorites
CREATE TABLE favorites (
    id CHAR(36) PRIMARY KEY,
    manager_id CHAR(36),
    entrepreneur_id CHAR(36),
    job_id CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES manager_profiles(id),
    FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Messages
CREATE TABLE messages (
    id CHAR(36) PRIMARY KEY,
    sender_id CHAR(36),
    receiver_id CHAR(36),
    job_id CHAR(36),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Budget Unlocks
CREATE TABLE budget_unlocks (
    id CHAR(36) PRIMARY KEY,
    entrepreneur_id CHAR(36),
    job_id CHAR(36),
    amount_paid DECIMAL(12,2),
    payment_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Resident Profiles
CREATE TABLE resident_profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    property_id CHAR(36),
    unit_number VARCHAR(20),
    move_in_date DATE,
    contact_preferences JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Supplier Profiles
CREATE TABLE supplier_profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    company_name VARCHAR(255),
    address TEXT,
    phone VARCHAR(50),
    website TEXT,
    catalog_pdf_url TEXT,
    business_license TEXT,
    years_in_business INT,
    delivery_areas JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Supplier Requests
CREATE TABLE supplier_requests (
    id CHAR(36) PRIMARY KEY,
    entrepreneur_id CHAR(36),
    supplier_id CHAR(36),
    request_details TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id),
    FOREIGN KEY (supplier_id) REFERENCES supplier_profiles(id)
);

-- Supplier Invoices
CREATE TABLE supplier_invoices (
    id CHAR(36) PRIMARY KEY,
    request_id CHAR(36),
    items JSON,
    total_amount DECIMAL(12,2),
    delivery_terms TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES supplier_requests(id)
);

-- Reviews
CREATE TABLE reviews (
    id CHAR(36) PRIMARY KEY,
    reviewer_id CHAR(36),
    reviewed_user_id CHAR(36),
    job_id CHAR(36),
    rating INT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_user_id) REFERENCES users(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);
