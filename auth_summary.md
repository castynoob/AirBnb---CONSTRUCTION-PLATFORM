# Authentication & Email Verification Implementation Summary

## Overview
Your application is a React + Node.js construction management platform called INTERVOS using PostgreSQL with SendGrid for email delivery.

---

## 1. EXISTING FORGOT PASSWORD BACKEND LOGIC

### Password Reset Flow (IMPLEMENTED)

**Endpoint: POST /api/auth/request-password-reset**
- Location: `src/controllers/authController.js` (lines 281-319)
- **Function**: `requestPasswordReset`
- **Security**: Uses email to identify user (doesn't reveal if email exists)
- **Token Generation**:
  - Uses `crypto.randomBytes(32).toString('hex')` for reset token
  - Token valid for 1 hour
  - Stores in database: `reset_token` and `reset_token_expires`
- **Email Delivery**: Uses SendGrid to send password reset email

**Endpoint: POST /api/auth/reset-password**
- Location: `src/controllers/authController.js` (lines 384-432)
- **Function**: `resetPassword`
- **Process**:
  1. Validates token and new password
  2. Checks password minimum length (8 characters)
  3. Finds user with valid reset token
  4. Hashes new password using bcryptjs
  5. Clears reset token after successful reset
- **Response**: Confirmation message for login

**Rate Limiting**: Both endpoints have rate limiting via `passwordResetRateLimiter` middleware

---

## 2. EMAIL VERIFICATION IMPLEMENTATION

### Email Verification Flow (IMPLEMENTED)

**Registration with Verification**
- Location: `src/controllers/authController.js` (lines 13-47)
- **Function**: `register`
- **Process**:
  1. Creates user with `email_verified = false`
  2. Generates verification token: `crypto.randomBytes(32).toString('hex')`
  3. Token valid for 24 hours
  4. Stores: `verification_token` and `verification_token_expires`
  5. Sends verification email via SendGrid

**Verification Endpoints** (2 methods supported):

1. **POST /api/auth/verify-email** (API endpoint for programmatic verification)
   - Location: `src/controllers/authController.js` (lines 100-133)
   - **Function**: `verifyEmail`
   - Accepts token in request body
   - Returns verified user data

2. **GET /api/auth/verify-email** (Email link endpoint)
   - Location: `src/controllers/authController.js` (lines 136-168)
   - **Function**: `verifyEmailFromLink`
   - Takes token as query parameter
   - Redirects to frontend with status parameter
   - Success: `/frontend-url/?verification=success`
   - Failure: `/frontend-url/?verification=failed&reason=invalid_token`

**Resend Verification Email**
- Location: `src/controllers/authController.js` (lines 171-212)
- **Function**: `resendVerificationEmail`
- **Security**: Doesn't reveal if email exists
- **Rate Limiting**: `verificationEmailRateLimiter` middleware

**Login Verification Check**
- Users MUST have `email_verified = true` to login
- Returns 403 error if email not verified
- Users can resend verification before login

---

## 3. USER MODEL / DATABASE SCHEMA

### Users Table Structure
**Location**: `construction_platform.sql` (lines 639-661)

```sql
CREATE TABLE "public"."users" (
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "email" character varying(255) NOT NULL UNIQUE,
    "password" text,
    "role" character varying(50),
    "first_name" character varying(100),
    "middle_name" character varying(100),
    "last_name" character varying(100),
    "phone" character varying(30),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    
    -- Email Verification Fields
    "email_verified" boolean DEFAULT false,
    "verification_token" text,
    "verification_token_expires" timestamp,
    
    -- Password Reset Fields
    "reset_token" text,
    "reset_token_expires" timestamp,
    
    -- Payment Integration
    "stripe_customer_id" character varying(255),
    
    -- OAuth Support
    "provider" character varying(10) DEFAULT 'local',  -- 'local' or 'google'
    "provider_id" character varying(255)  -- Google ID if using Google auth
);
```

### Related Model File
- **Location**: `src/models/userModel.js`
- **Functions**:
  - `findUserByEmail(email)` - Returns user with all fields
  - `createUser()` - Creates new user (basic)
  - `getAllUsers()`
  - `getAllEntrepreneurEmails()`

---

## 4. TOKEN GENERATION FOR PASSWORD RESET

### Token Generation Strategy
- **Method**: `crypto.randomBytes(32).toString('hex')`
- **Length**: 64 characters (32 bytes as hex)
- **Security**: Cryptographically secure random generation

### Refresh Token System (Separate)
- **Location**: `src/models/refreshTokenModel.js`
- **Token Length**: 64 characters (32 bytes as hex)
- **Lifespan**: 7 days
- **Storage**: Separate `refresh_tokens` table
- **Use Case**: JWT refresh without re-login
- **Functions**:
  - `createRefreshToken(userId)` - Creates new refresh token
  - `findRefreshToken(token)` - Validates token existence and expiry
  - `deleteRefreshToken(token)` - Invalidates on logout

### JWT Access Token
- **Type**: JWT (JSON Web Token)
- **Lifespan**: 15 minutes
- **Secret**: `process.env.JWT_SECRET`
- **Payload**: `{ id, email, role }`
- **Used for**: API request authentication

---

## 5. EMAIL SERVICE CONFIGURATION

### SendGrid Configuration
**Location**: `src/config/emailConfig.js`

- **Setup**: 
  - Initializes SendGrid with `process.env.SENDGRID_API_KEY`
  - Sender email: `process.env.EMAIL_FROM`

- **Functions**:
  - `sendVerificationEmail(email, token)` - Sends HTML email with verification link
  - `sendPasswordResetEmail(email, token)` - Sends HTML email with reset link

### Email Templates
**Verification Email Template** (lines 25-37):
```html
- Blue header with "Email Verification"
- Button link with 24-hour expiration notice
- Fallback text link included
```

**Password Reset Email Template** (lines 56-68):
```html
- Blue header with "Password Reset"
- Button link with 1-hour expiration notice
- Fallback text link included
```

### Fallback Email Service (Not Currently Used)
- **Mailer Service**: `src/services/mailerService.js` - Uses Gmail/Nodemailer
- **Utility Mailer**: `src/utitlities/mailer.js` - Alternative Gmail setup
- **Note**: SendGrid is the primary service

---

## 6. FRONTEND FRAMEWORK & STRUCTURE

### Framework
- **Type**: React 18+ (with Vite bundler)
- **Routing**: React Router DOM
- **UI Library**: Custom CSS styling
- **OAuth**: Google OAuth via `@react-oauth/google`
- **Auth**: JWT tokens stored in localStorage

### Frontend Authentication
**Main Landing Page**
- **Location**: `src/pages/landingpage/LandingPage.jsx`
- **Size**: 1,269 lines
- **Features**:
  - Login modal with form validation
  - Registration modal (multi-step, role-based)
  - Google OAuth login integration
  - Form error handling
  - Password visibility toggle
  - Remember me checkbox

### Login Flow (Frontend)
1. User submits email/password
2. API call to `POST /api/auth/login`
3. Receives: `accessToken`, `refreshToken`, `user` object
4. Stores in localStorage:
   - `token` (access token)
   - `refreshToken` (7-day token)
   - `userId`
   - `userProfile` (JSON)
5. Redirects to role-based homepage

### Registration Flow (Frontend)
1. User selects role (entrepreneur, property-manager, resident, supplier)
2. Fills out role-specific form
3. API call to `/api/register/{entrepreneur|manager|resident|supplier}`
4. Success: Directs to login modal
5. User must verify email before logging in

### API Helper
- **Location**: `src/utils/api.js`
- **Features**:
  - Token refresh mechanism (auto-refresh on 401)
  - Authorization header injection
  - Error handling
  - Request queuing during refresh
- **Key Functions**:
  - `refreshAccessToken()` - Handles token expiration
  - `apiRequest(endpoint, options)` - Authenticated API calls

### Protected Routes
- **Location**: `src/components/ProtectedRoute.jsx`
- Checks for valid token and user role
- Redirects unauthorized users to landing page

---

## 7. AUTHENTICATION FLOW SUMMARY

### Registration
```
User → Landing Page Registration Modal
  ↓
Select Role
  ↓
Fill Form (role-specific fields)
  ↓
POST /api/register/{role}
  ↓
Backend: Creates user with email_verified=false
  ↓
Backend: Generates verification_token
  ↓
SendGrid: Sends verification email
  ↓
Frontend: Shows success message
  ↓
User: Clicks link in email
  ↓
GET /api/auth/verify-email?token=XXX
  ↓
Redirect to landing page with success message
```

### Login
```
User → Landing Page Login Modal
  ↓
Enter email/password OR use Google OAuth
  ↓
POST /api/auth/login (or /api/auth/google-login)
  ↓
Backend: Validates credentials
  ↓
Backend: Checks email_verified = true
  ↓
Generate JWT access token (15 min)
  ↓
Generate refresh token (7 days, stored in DB)
  ↓
Frontend: Store tokens in localStorage
  ↓
Redirect to /homepage/{role}
```

### Password Reset
```
User → "Forgot password?" link
  ↓
POST /api/auth/request-password-reset
  ↓
Backend: Generates reset_token (1 hour)
  ↓
SendGrid: Sends reset email with token
  ↓
User: Clicks link in email
  ↓
Frontend: Shows password reset form
  ↓
POST /api/auth/reset-password
  ↓
Backend: Validates token, hashes password, clears token
  ↓
Success: User can now login with new password
```

### Token Refresh
```
User Makes API Request
  ↓
Frontend: Attaches access token in Authorization header
  ↓
If 401 Unauthorized:
  ↓
POST /api/auth/refresh-token with refreshToken
  ↓
Backend: Validates refresh token, generates new access token
  ↓
Frontend: Updates localStorage token
  ↓
Retries original request
```

---

## 8. AUTHENTICATION MIDDLEWARE

**Location**: `src/middleware/authMiddleware.js`

- **Function**: `authenticateToken`
- **Usage**: Protects routes requiring authentication
- **Process**:
  1. Extracts JWT from Authorization header
  2. Verifies against `JWT_SECRET`
  3. Attaches user data to request object
  4. Returns 401 if token invalid/missing

---

## 9. RATE LIMITING

**Location**: `src/middleware/rateLimitMiddleware.js`

Applied to:
- `loginRateLimiter` - Login attempts
- `loginEmailRateLimiter` - Email-based login limiting
- `registrationRateLimiter` - Registration attempts
- `passwordResetRateLimiter` - Password reset requests
- `verificationEmailRateLimiter` - Verification resend requests

---

## 10. ROUTES CONFIGURATION

**Location**: `src/routes/authRoutes.js`

```javascript
POST   /api/auth/register                  - Register new user
POST   /api/auth/login                     - Login
POST   /api/auth/google-login              - Google OAuth login
POST   /api/auth/verify-email              - Verify email (API)
GET    /api/auth/verify-email              - Verify email (link click)
POST   /api/auth/resend-verification       - Resend verification email
POST   /api/auth/refresh-token             - Refresh access token
POST   /api/auth/logout                    - Logout (invalidate refresh token)
POST   /api/auth/request-password-reset    - Request password reset
POST   /api/auth/reset-password            - Reset password
GET    /api/auth/me                        - Get current user profile
PUT    /api/auth/me                        - Update current user profile
```

---

## 11. ENVIRONMENT VARIABLES REQUIRED

```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key

# SendGrid
SENDGRID_API_KEY=your-sendgrid-key
EMAIL_FROM=noreply@intervos.com

# URLs
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## 12. KEY FILES REFERENCE

### Backend
- Auth Controller: `/src/controllers/authController.js` (484 lines)
- Auth Routes: `/src/routes/authRoutes.js` (67 lines)
- User Model: `/src/models/userModel.js` (37 lines)
- Refresh Token Model: `/src/models/refreshTokenModel.js` (27 lines)
- Email Config: `/src/config/emailConfig.js` (80 lines)
- Auth Middleware: `/src/middleware/authMiddleware.js`
- Rate Limiting: `/src/middleware/rateLimitMiddleware.js`

### Frontend
- Landing Page: `/src/pages/landingpage/LandingPage.jsx` (1,269 lines)
- API Helper: `/src/utils/api.js` (323 lines)
- Protected Route: `/src/components/ProtectedRoute.jsx`

### Database
- Schema: `/construction_platform.sql`

---

## 13. SECURITY FEATURES

✓ Passwords hashed with bcryptjs (10 rounds)
✓ Cryptographically secure token generation
✓ Token expiration (verification: 24h, reset: 1h, access: 15m, refresh: 7d)
✓ Rate limiting on auth endpoints
✓ Email verification required for login
✓ JWT secret in environment variables
✓ Refresh token storage in database (not localStorage)
✓ 401/403 error handling in frontend
✓ No email enumeration (security: doesn't reveal if email exists)
✓ OAuth provider support (Google)

---

## 14. POTENTIAL IMPROVEMENTS

- [ ] Add "Forgot Password" link to login modal (currently hardcoded link)
- [ ] Implement frontend password reset page (currently only backend)
- [ ] Add email change verification
- [ ] Add two-factor authentication
- [ ] Implement remember me functionality on frontend
- [ ] Add logout on all devices feature
- [ ] Add password strength validation on frontend
- [ ] Add social login to registration flow

