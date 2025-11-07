# Authentication & Email Verification - Complete Documentation

This folder contains comprehensive documentation about the authentication and email verification system in your INTERVOS construction platform.

---

## Documentation Files

### 1. AUTHENTICATION_QUICK_START.md (PRIMARY - START HERE)
**Best for:** Getting started quickly, seeing what's implemented, next steps

Contains:
- Summary of implemented features
- Key file locations
- API endpoint list
- Token lifetimes
- Database field descriptions
- Testing commands
- Next steps for development
- Debugging tips

**Read this first** to get a quick overview of the entire system.

---

### 2. auth_summary.md (COMPREHENSIVE REFERENCE)
**Best for:** Deep understanding of each component, detailed explanations

Contains:
- 14 detailed sections covering all aspects
- Existing forgot password backend logic
- Email verification implementation details
- User model/database schema
- Token generation strategies
- Email service configuration
- Frontend framework details
- Authentication flow diagrams
- Middleware explanations
- Rate limiting info
- All routes configuration
- Environment variables
- Security features checklist
- Potential improvements

**Read this for complete technical details** on each component.

---

### 3. architecture_diagram.txt (VISUAL REFERENCE)
**Best for:** Understanding component relationships and data flow

Contains:
- ASCII diagrams of all components
- Frontend architecture
- Backend architecture
- Database structure
- Email service setup
- Middleware configuration
- Token expiry timeline
- Security features list
- Complete 6-step data flow scenarios:
  1. User Registration
  2. User Login
  3. Protected API Request
  4. Token Expiration Handling
  5. Password Reset
  6. Logout

**Use this when you need visual understanding** of how components interact.

---

### 4. CODE_SNIPPETS_REFERENCE.md (COPY-PASTE READY)
**Best for:** Implementing features, copy-paste ready code

Contains:
- Database schema (SQL)
- Backend implementations:
  - Register function
  - Verify email function
  - Request password reset
  - Reset password
  - Email configuration
- Frontend implementations:
  - Login form handler
  - Token refresh helper
  - Authenticated API request
- Backend models (refresh tokens)
- Route configuration
- Environment variables template

**Use this when implementing new features** or modifying existing ones.

---

## Quick Navigation

### I want to understand...

**The overall architecture:**
- Start with: AUTHENTICATION_QUICK_START.md
- Then read: architecture_diagram.txt

**How registration and email verification works:**
- Read: auth_summary.md sections 1-2
- See code: CODE_SNIPPETS_REFERENCE.md "Register with Email Verification"

**How password reset works:**
- Read: auth_summary.md section 1
- See code: CODE_SNIPPETS_REFERENCE.md "Request Password Reset" + "Reset Password"
- Note: Frontend page is NOT implemented - needs to be created

**How token refresh works:**
- Read: auth_summary.md section 4
- See code: CODE_SNIPPETS_REFERENCE.md "Token Refresh Helper"
- Also see: architecture_diagram.txt section 4

**All database fields:**
- Read: auth_summary.md section 3
- See code: CODE_SNIPPETS_REFERENCE.md "Database Schema"
- See: AUTHENTICATION_QUICK_START.md "Database Fields for Authentication"

**All API endpoints:**
- See: AUTHENTICATION_QUICK_START.md "API Endpoints"
- Full details: auth_summary.md section 10

**Security features:**
- See: auth_summary.md section 13
- See: architecture_diagram.txt security features list

---

## Key Implementation Summary

### What's Working
✓ Registration with email verification
✓ Email verification (24h tokens)
✓ Login with email verification requirement
✓ Password reset request (backend)
✓ Password reset confirmation (backend)
✓ JWT access tokens (15 min)
✓ Refresh tokens (7 days)
✓ Token auto-refresh on 401
✓ Logout (token invalidation)
✓ Google OAuth login
✓ Rate limiting on all auth endpoints
✓ Password hashing with bcryptjs
✓ SendGrid email delivery

### What's Missing
- [ ] Frontend password reset page
- [ ] Forgot password link in login modal
- [ ] Remember me functionality
- [ ] Email change verification
- [ ] Two-factor authentication

---

## File Locations in Project

### Backend Code
```
/src/controllers/authController.js      (484 lines)  - Main auth logic
/src/routes/authRoutes.js               (67 lines)   - Route definitions
/src/models/userModel.js                (37 lines)   - User queries
/src/models/refreshTokenModel.js        (27 lines)   - Refresh token queries
/src/config/emailConfig.js              (80 lines)   - SendGrid setup
/src/middleware/authMiddleware.js       - JWT verification
/src/middleware/rateLimitMiddleware.js  - Rate limiting
```

### Frontend Code
```
/src/pages/landingpage/LandingPage.jsx  (1,269 lines) - Login/Register modals
/src/utils/api.js                       (323 lines)  - API helper
/src/components/ProtectedRoute.jsx      - Route protection
```

### Database
```
/construction_platform.sql              - SQL schema (users table at line 639)
```

---

## Critical Concepts

### Token Types

1. **Verification Token**
   - 64-character hex string
   - 24-hour expiry
   - Used to verify email after registration
   - Sent via email link and in verification endpoints

2. **Reset Token**
   - 64-character hex string
   - 1-hour expiry
   - Used to reset forgotten password
   - Sent via email

3. **JWT Access Token**
   - JSON Web Token
   - 15-minute expiry
   - Contains: {id, email, role}
   - Sent in Authorization header for API requests
   - Stored in localStorage on frontend

4. **Refresh Token**
   - 128-character hex string (64 bytes as hex)
   - 7-day expiry
   - Stored in database (not localStorage)
   - Used to get new access tokens when they expire
   - Can be revoked (deleted from DB) to logout

---

## Usage Examples

### Frontend Login
```javascript
// User enters email/password
const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
  method: "POST",
  body: JSON.stringify({ email, password })
});

// Save tokens
localStorage.setItem('token', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);

// API calls will now use token in Authorization header
```

### Frontend Protected API Call
```javascript
// Auto-refresh mechanism in api.js handles 401
const data = await apiRequest('/api/data');
// If token expired, automatically refreshes and retries
```

### Backend Password Reset Flow
```
1. User requests reset: POST /api/auth/request-password-reset
2. Backend generates token + email
3. User gets email with link
4. User submits form: POST /api/auth/reset-password
5. Backend validates token, hashes password, clears token
6. User can now login with new password
```

---

## Environment Variables

Create a `.env` file with:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/db_name

# JWT
JWT_SECRET=your-very-secure-secret-key

# SendGrid
SENDGRID_API_KEY=your-sendgrid-key
EMAIL_FROM=noreply@intervos.com

# URLs
PORT=5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## Common Tasks

### Create Password Reset Page
1. Create `/src/pages/auth/ResetPasswordPage.jsx`
2. Extract token from URL query: `const token = new URLSearchParams(window.location.search).get('token')`
3. Show password form
4. POST to `/api/auth/reset-password`
5. Redirect to login on success

See: AUTHENTICATION_QUICK_START.md "Missing Implementation - Password Reset Frontend"

### Add Forgot Password Link
1. Add link to login modal
2. Handle click -> navigate to reset password page
3. Frontend handles GET /api/auth/verify-email redirect from email

### Test Authentication
Run the curl commands in: AUTHENTICATION_QUICK_START.md "Testing the Authentication Flow"

---

## Performance Notes

- JWT tokens are stateless (scales horizontally)
- Refresh tokens in DB allow revocation (good for security)
- Email verification prevents spam accounts
- Rate limiting prevents brute force
- Password hashing takes ~100ms per operation
- SendGrid handles high email volume

---

## Security Best Practices Implemented

✓ Passwords never stored in plain text (bcryptjs)
✓ Tokens are cryptographically random (crypto.randomBytes)
✓ Tokens have expiration times
✓ Refresh tokens can be revoked
✓ JWT secret in environment variables
✓ Email verification required before login
✓ Rate limiting on authentication endpoints
✓ No email enumeration (can't tell if email exists)
✓ HTTPS recommended for production
✓ OAuth support (Google)

---

## Next Development Priorities

1. **HIGH** - Create frontend password reset page
2. **HIGH** - Add forgot password link to login
3. **MEDIUM** - Implement remember me
4. **MEDIUM** - Add email change verification
5. **LOW** - Add two-factor authentication

---

## Document Index by Topic

### Authentication
- AUTHENTICATION_QUICK_START.md
- auth_summary.md sections 1, 7
- architecture_diagram.txt section 6

### Email Verification
- auth_summary.md section 2
- CODE_SNIPPETS_REFERENCE.md "Register with Email Verification"
- architecture_diagram.txt section 1

### Password Reset
- auth_summary.md section 1
- CODE_SNIPPETS_REFERENCE.md "Request Password Reset" + "Reset Password"
- architecture_diagram.txt section 5

### Token Management
- auth_summary.md section 4
- CODE_SNIPPETS_REFERENCE.md "Token Refresh Helper"
- architecture_diagram.txt section 4

### Database
- auth_summary.md section 3
- CODE_SNIPPETS_REFERENCE.md "Database Schema"
- AUTHENTICATION_QUICK_START.md "Database Fields for Authentication"

### API Routes
- auth_summary.md section 10
- AUTHENTICATION_QUICK_START.md "API Endpoints"
- CODE_SNIPPETS_REFERENCE.md "Backend - Auth Routes Configuration"

### Security
- auth_summary.md section 13
- AUTHENTICATION_QUICK_START.md "Security Considerations"
- architecture_diagram.txt "SECURITY FEATURES"

---

## Document Timestamps
- Created: November 7, 2025
- Documentation covers: 1,612 lines across 4 files
- Coverage: 100% of authentication system

