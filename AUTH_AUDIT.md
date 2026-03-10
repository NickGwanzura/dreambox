# 🔐 Authentication Audit: Password Reset & Account Creation

**Date:** March 10, 2026  
**Auditor:** Kimi Code CLI  
**Scope:** Password reset flow, new account registration, authentication security  
**Files Reviewed:**
- `services/authServiceSecure.ts`
- `services/authService.ts` (legacy)
- `components/Auth.tsx`
- `utils/validation.ts`
- `services/constants.ts`

---

## 🚨 CRITICAL SECURITY ISSUES

### 1. Legacy Hardcoded Backdoor Credentials (HIGH RISK)

**Location:** `services/authService.ts` (lines 14-80)

**Issue:** The legacy auth service contains hardcoded developer backdoors:

```typescript
// --- EMERGENCY DEVELOPER BACKDOOR ---
if ((identifier.toLowerCase() === 'dev' || identifier.toLowerCase() === 'dev@dreambox.com') 
    && password === 'dev123') { ... }

// --- SECONDARY DEVELOPER BACKDOOR (Nick) ---
if (identifier.toLowerCase() === 'nick@creamobmedia.co.zw' 
    && password === 'Nh@modzepasi9') { ... }
```

**Risk:** 
- Anyone with access to the source code can gain admin access
- Passwords exposed in plaintext in version control
- Bypasses all security controls

**Recommendation:** 
- [ ] Delete `services/authService.ts` immediately
- [ ] Rotate any production credentials that may have been exposed
- [ ] Review git history for any exposed credentials

---

## 🔴 HIGH PRIORITY ISSUES

### 2. Password Reset is Non-Functional (FAKE FEATURE)

**Location:** `services/authServiceSecure.ts` (lines 239-253)

**Current Implementation:**
```typescript
export const resetPassword = async (email: string): Promise<void> => {
  await delay(PASSWORD_RESET_DELAY_MS);
  const sanitizedEmail = sanitizers.email(email);
  const user = findUser(sanitizedEmail);
  
  if (!user) {
    logger.warn(`Password reset attempted for non-existent: ${sanitizedEmail}`);
    return;  // Silently fails - good practice
  }
  
  logger.info(`Password reset requested for: ${sanitizedEmail}`);
  // ❌ NO ACTUAL IMPLEMENTATION - Just logs!
};
```

**Issues:**
1. **No token generation** - No reset token is created
2. **No email sent** - No email infrastructure integrated
3. **No reset page** - User cannot actually reset their password
4. **No expiration** - Tokens don't expire (because none are created)
5. **UI Misleading** - Auth.tsx shows "Reset email sent" success message (line 103)

**User Impact:**
- User submits email for password reset
- Sees success message "Check your email for reset instructions"
- No email ever arrives
- User is permanently locked out if they forget password

**Recommendation:**
- [ ] Add Supabase Auth integration for password reset
- [ ] OR implement custom token system with email service
- [ ] OR remove the feature from UI until implemented

---

### 3. New Account Approval Workflow is Broken

**Location:** `components/Auth.tsx` (lines 93-100), `services/authServiceSecure.ts` (lines 192-237)

**Current Flow:**
1. User registers → Account created with `status: 'Pending'` ✓
2. Success message: "Account created! Your account is pending administrator approval." ✓
3. **NO NOTIFICATION** sent to administrators ❌
4. **NO WAY** for admin to see pending approvals ❌
5. User cannot use the app until manually approved by admin

**Issues:**
1. No admin notification system
2. No pending approvals UI in Settings
3. Admin must manually check each user's status
4. User gets no feedback on approval status

**Code Analysis:**
```typescript
// Auth.tsx line 93-100
await register(sanitizedFirstName, sanitizedLastName, sanitizedEmail, password);
setSuccessMessage("Account created! Your account is pending administrator approval.");
showToast('Account created — pending approval', 'success');
setMode('login');  // Redirects to login, but user can't login!
```

**User Impact:**
- User registers, sees "pending approval" message
- Admin is never notified
- User waits indefinitely
- User tries to login but gets "Account awaiting administrator approval" error

**Recommendation:**
- [ ] Add pending approvals section to Settings/Users page
- [ ] Add notification toast for admins when new user registers
- [ ] Add email notification to admin email
- [ ] Consider auto-approving with email verification instead

---

## 🟡 MEDIUM PRIORITY ISSUES

### 4. No Email Verification for New Accounts

**Location:** `services/authServiceSecure.ts` (register function)

**Issue:** New accounts are created immediately without verifying email ownership.

**Risk:**
- Anyone can create accounts with fake/spam emails
- No way to contact users for important updates
- Database pollution with invalid emails

**Recommendation:**
- [ ] Implement email verification flow
- [ ] Require verification before account approval
- [ ] Add resend verification email option

---

### 5. Password Hashing is Client-Side Only

**Location:** `services/authServiceSecure.ts` (lines 26-37)

**Current Implementation:**
```typescript
async function hashPassword(password: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // ...
  }
  return btoa(password.split('').reverse().join(''));  // Weak fallback!
}
```

**Issues:**
1. **SHA-256 is fast** - Vulnerable to brute force attacks
2. **No salt** - Same passwords = same hash (rainbow table attacks)
3. **Weak fallback** - Base64 reverse is trivially crackable
4. **Client-side hashing** - Server receives hash, not password (good)

**Risk Level:** Medium (better than plaintext, but not secure)

**Recommendation:**
- [ ] Use bcrypt or Argon2 with proper salting
- [ ] Implement server-side hashing with Supabase Auth
- [ ] Add minimum password strength requirements

---

### 6. Missing Rate Limiting

**Location:** All auth functions

**Issue:** No rate limiting on login, register, or password reset attempts.

**Risk:**
- Brute force attacks on passwords
- Registration spam
- Password reset abuse

**Recommendation:**
- [ ] Add exponential backoff for failed login attempts
- [ ] Limit registration attempts per IP
- [ ] Add CAPTCHA after failed attempts

---

## 🟢 LOW PRIORITY ISSUES

### 7. Dev Mode Bypass Still Exists

**Location:** `services/authServiceSecure.ts` (lines 96-121)

**Current Implementation:**
```typescript
export const devLogin = async (): Promise<Omit<User, 'password'> | null> => {
  await delay(300);
  const devUser: User = {
    id: 'dev-admin-001',
    firstName: 'Developer',
    lastName: 'Mode',
    email: 'dev@dreambox.local',
    username: 'dev',
    role: 'Admin',
    status: 'Active',
    password: ''
  };
  // ...
};
```

**Issue:** Dev login bypass is still available and creates an admin user.

**Recommendation:**
- [ ] Add environment variable check: `process.env.NODE_ENV === 'development'`
- [ ] Or remove entirely for production builds

---

## ✅ POSITIVE FINDINGS

### 1. Input Validation is Comprehensive
**File:** `utils/validation.ts`

- ✓ Email format validation
- ✓ Password minimum length (6 chars)
- ✓ XSS prevention in sanitizers
- ✓ Required field validation
- ✓ Custom ValidationError class

### 2. Account Status System is Implemented
**File:** `services/authServiceSecure.ts`

- ✓ New accounts default to `status: 'Pending'`
- ✓ Login checks status before authenticating
- ✓ Proper error messages for pending/rejected accounts

### 3. Session Management is Secure
**File:** `services/authServiceSecure.ts` (lines 68-90)

- ✓ Passwords excluded from session
- ✓ Proper session storage with error handling
- ✓ Storage cleanup on quota exceeded

### 4. No Plaintext Password Storage (Current)
**File:** `services/authServiceSecure.ts`

- ✓ Passwords hashed before storage
- ✓ Legacy plaintext passwords supported during migration
- ✓ Migration path from plaintext to hashed

---

## 📋 RECOMMENDED ACTION PLAN

### Phase 1: Critical Fixes (Immediate)
1. **Delete legacy auth service**
   ```bash
   rm services/authService.ts
   ```

2. **Hide password reset UI until functional**
   ```typescript
   // Auth.tsx - Comment out or conditionally render
   {/* <button onClick={() => toggleMode('forgot')}>
       Forgot password?
   </button> */}
   ```

### Phase 2: High Priority (This Week)
3. **Add pending approvals UI to Settings**
   - Create "Pending Approvals" tab in User Management
   - Show users with `status: 'Pending'`
   - Add Approve/Reject buttons

4. **Implement Supabase Auth**
   - Replace custom auth with Supabase Auth
   - Get password reset emails for free
   - Get email verification for free

### Phase 3: Medium Priority (Next Sprint)
5. **Improve password hashing**
   - Use bcryptjs or similar
   - Add proper salt
   - Enforce password strength

6. **Add rate limiting**
   - Implement in-memory rate limiting
   - Add CAPTCHA integration option

---

## 🔍 CODE REVIEW DETAILS

### Password Reset Flow (Current - BROKEN)

```
User clicks "Forgot password?"
    ↓
User enters email → Submit
    ↓
resetPassword(email) called
    ↓
System delays 1.5s (simulation)
    ↓
System checks if user exists
    ↓
If exists: Logs "Password reset requested"
    ↓
Returns void (success)
    ↓
UI shows: "Check your email for reset instructions"
    ↓
❌ NOTHING ACTUALLY HAPPENS
```

### New Account Flow (Current - PARTIAL)

```
User fills registration form → Submit
    ↓
register() validates inputs
    ↓
Checks for existing user
    ↓
Hashes password (SHA-256)
    ↓
Creates user with status: 'Pending', role: 'Staff'
    ↓
Saves to localStorage + Supabase
    ↓
UI shows: "Account created! Pending approval."
    ↓
❌ NO ADMIN NOTIFICATION
    ↓
User tries to login
    ↓
❌ "Account awaiting administrator approval"
```

---

## 📊 SECURITY RATING

| Component | Current Rating | Target Rating |
|-----------|---------------|---------------|
| Password Reset | ❌ F (Non-functional) | ✅ A |
| Account Creation | ⚠️ C (Partial) | ✅ A |
| Password Storage | ⚠️ C (Basic hashing) | ✅ A |
| Session Management | ✅ B (Good) | ✅ A |
| Input Validation | ✅ A (Excellent) | ✅ A |
| **Overall** | **⚠️ C** | **✅ A** |

---

*Audit completed. Immediate action required on critical and high priority issues.*
