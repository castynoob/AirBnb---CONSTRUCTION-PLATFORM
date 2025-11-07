# Authentication Quick Start Guide

## Documentation Files

I've created comprehensive documentation for you:

1. **auth_summary.md** (13 KB)
   - Complete overview of authentication & email verification implementation
   - Detailed explanation of each feature
   - Security features checklist
   - Full routes configuration

2. **architecture_diagram.txt** (8 KB)
   - Visual ASCII diagrams of the complete architecture
   - Data flow for registration, login, token refresh, password reset
   - Component relationships and dependencies

3. **CODE_SNIPPETS_REFERENCE.md** (15 KB)
   - Ready-to-use code snippets from your codebase
   - Database schema
   - Backend implementations
   - Frontend handlers
   - Configuration examples

## Key Findings Summary

### What's Already Implemented

✓ **Email Verification**
  - Registration creates users with email_verified = false
  - Verification token valid for 24 hours
  - Two endpoints: API (POST) and email link (GET)
  - Automatic email sending via SendGrid
  - Resend verification functionality

✓ **Forgot Password Backend**
  - Request endpoint generates reset token (1 hour expiry)
  - Reset endpoint validates token and updates password
  - Password hashing with bcryptjs (10 rounds)
  - Token generation using crypto.randomBytes(32)
  - SendGrid email delivery with HTML template

✓ **Token Management**
  - Access tokens: JWT, 15 minutes
  - Refresh tokens: 64-char hex, 7 days, DB-stored
  - Auto-refresh mechanism on 401
  - Logout invalidates refresh token

✓ **Security**
  - Rate limiting on all auth endpoints
  - Email verification required for login
  - Password minimum 8 characters
  - No email enumeration (security)
  - OAuth support (Google)

### Frontend Framework
- React 18+ with Vite
- React Router for navigation
- Custom CSS styling
- Google OAuth integration
- localStorage for token storage

---

## Critical File Locations

### Backend
```
src/controllers/authController.js      - All auth logic (484 lines)
src/routes/authRoutes.js               - Route definitions (67 lines)
src/models/userModel.js                - User DB queries (37 lines)
src/models/refreshTokenModel.js        - Token DB queries (27 lines)
src/config/emailConfig.js              - SendGrid setup (80 lines)
src/middleware/authMiddleware.js       - JWT verification
src/middleware/rateLimitMiddleware.js  - Rate limiting
```

### Frontend
```
src/pages/landingpage/LandingPage.jsx  - Login/Register forms (1,269 lines)
src/utils/api.js                       - API helper & token refresh (323 lines)
src/components/ProtectedRoute.jsx      - Route protection
```

### Database
```
construction_platform.sql              - Complete schema
  - users table (line 639)
    - verification_token fields
    - reset_token fields
    - email_verified flag
  - refresh_tokens table
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/register                    Create account
POST   /api/auth/login                       Login
POST   /api/auth/google-login                Google OAuth login
POST   /api/auth/verify-email                Verify email (API)
GET    /api/auth/verify-email                Verify email (link)
POST   /api/auth/resend-verification         Resend verification
POST   /api/auth/request-password-reset      Request reset
POST   /api/auth/reset-password              Reset password
POST   /api/auth/refresh-token               Refresh JWT
POST   /api/auth/logout                      Logout
GET    /api/auth/me                          Get current user
PUT    /api/auth/me                          Update current user
```

---

## Token Lifetimes

| Token Type | Duration | Storage | Purpose |
|------------|----------|---------|---------|
| Verification | 24 hours | Database | Email verification |
| Reset Token | 1 hour | Database | Password reset |
| Access Token (JWT) | 15 minutes | localStorage | API requests |
| Refresh Token | 7 days | Database | Refresh access token |

---

## Database Fields for Authentication

### Users Table Key Fields
```
id                          UUID (Primary Key)
email                       VARCHAR (Unique)
password                    TEXT (bcryptjs hash)
email_verified              BOOLEAN (default: false)
verification_token          TEXT (64 chars)
verification_token_expires  TIMESTAMP
reset_token                 TEXT (64 chars)
reset_token_expires         TIMESTAMP
provider                    VARCHAR ('local' or 'google')
provider_id                 VARCHAR (Google ID)
```

### Refresh Tokens Table
```
id                          UUID (Primary Key)
user_id                     UUID (Foreign Key)
token                       VARCHAR (128 chars)
expires_at                  TIMESTAMP (7 days)
created_at                  TIMESTAMP
```

---

## Environment Variables Required

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Security
JWT_SECRET=your-secret-key

# Email (SendGrid)
SENDGRID_API_KEY=your-key
EMAIL_FROM=noreply@example.com

# URLs
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# OAuth
VITE_GOOGLE_CLIENT_ID=your-client-id

# Other
PORT=5000
```

---

## Missing Implementation - Password Reset Frontend

The frontend password reset page is NOT implemented. You need to create:

1. `/src/pages/auth/ResetPasswordPage.jsx`
   - Should show password reset form
   - Should extract token from URL query param
   - Should POST to `/api/auth/reset-password`
   - Should show success/error messages

2. Add route to `App.jsx`:
   ```jsx
   <Route path="/reset-password" element={<ResetPasswordPage />} />
   ```

3. Add "Forgot Password" link to login modal (currently hardcoded to "#forgot")

---

## Testing the Authentication Flow

### 1. Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "first_name": "John",
    "last_name": "Doe",
    "role": "entrepreneur"
  }'
```

### 2. Verify Email (after clicking link in email)
Email link: `http://localhost:5000/api/auth/verify-email?token=XXX`

### 3. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123"
  }'
```

### 4. Request Password Reset
```bash
curl -X POST http://localhost:5000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### 5. Reset Password
```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-from-email",
    "newPassword": "NewSecurePass123"
  }'
```

---

## Next Steps for Development

1. **Create Password Reset Page**
   - Extract token from URL
   - Show password form with validation
   - Call `/api/auth/reset-password`
   - Redirect to login on success

2. **Add Forgot Password Link**
   - Update login modal to show "Forgot Password?" link
   - Add click handler to show modal/navigate to reset page

3. **Add Remember Me**
   - Implement persistent login with refresh tokens
   - Auto-refresh tokens in background

4. **Add Email Change Verification**
   - Similar to password reset
   - Verify new email before updating

5. **Add Two-Factor Authentication** (Optional)
   - Add 2FA fields to users table
   - Implement TOTP or SMS verification

---

## Debugging Tips

### Check Token Validity
```javascript
// Frontend console
localStorage.getItem('token')
localStorage.getItem('refreshToken')
const decoded = jwtDecode(localStorage.getItem('token'))
console.log(decoded)
```

### Check Database
```sql
SELECT id, email, email_verified, verification_token, reset_token 
FROM users 
WHERE email = 'test@example.com';
```

### Enable Debug Logging
Add to auth controller:
```javascript
console.log('Token:', token)
console.log('Token expires:', tokenExpires)
console.log('User ID:', user.id)
```

### Test Email Delivery
Check SendGrid dashboard or use Mailtrap for testing emails

---

## Performance Considerations

- JWT tokens are stateless (good for scaling)
- Refresh tokens stored in DB (allows revocation)
- Email verification prevents spam registrations
- Rate limiting prevents brute force attacks
- Password hashing adds computational cost (~100ms per hash)

