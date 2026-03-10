# 🔐 Supabase Auth Setup Guide

This document explains how to configure Supabase Auth for Dreambox.

---

## ✅ What's Already Implemented

1. **Email/Password Signup** - With email verification
2. **Password Reset** - Via email link
3. **Email Verification** - Required before login
4. **Session Management** - Automatic token refresh

---

## 🔧 Supabase Dashboard Configuration

### Step 1: Enable Email Provider

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `iiphiigaksyshionjhmt`
3. Navigate to **Authentication** → **Providers**
4. Enable **Email** provider
5. Configure settings:
   - ✅ **Confirm email** - ON (required)
   - ✅ **Secure email change** - ON
   - ✅ **Secure password change** - ON
   - ⏱️ **JWT expiry** - 3600 (1 hour)

---

### Step 2: Configure Email Templates

Go to **Authentication** → **Email Templates**

#### 1. Confirm Signup Email

**Subject:** `Verify your Dreambox account`

```html
<h2>Welcome to Dreambox!</h2>
<p>Hi {{ .Data.first_name }},</p>
<p>Thanks for signing up. Please click the button below to verify your email address:</p>
<p><a href="{{ .ConfirmationURL }}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Verify Email</a></p>
<p>Or copy this link: {{ .ConfirmationURL }}</p>
<p>This link expires in 24 hours.</p>
<p>If you didn't create an account, you can safely ignore this email.</p>
```

#### 2. Reset Password Email

**Subject:** `Reset your Dreambox password`

```html
<h2>Reset Your Password</h2>
<p>Hi {{ .Data.first_name }},</p>
<p>We received a request to reset your password. Click the button below to create a new password:</p>
<p><a href="{{ .ConfirmationURL }}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a></p>
<p>Or copy this link: {{ .ConfirmationURL }}</p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

#### 3. Change Email Address

**Subject:** `Confirm your new email address`

```html
<h2>Confirm Email Change</h2>
<p>Hi {{ .Data.first_name }},</p>
<p>You requested to change your email address. Click the button to confirm:</p>
<p><a href="{{ .ConfirmationURL }}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Confirm New Email</a></p>
<p>This link expires in 24 hours.</p>
```

---

### Step 3: Configure Site URL

Go to **Authentication** → **URL Configuration**

| Setting | Value |
|---------|-------|
| **Site URL** | `https://dreambox-kappa.vercel.app` |
| **Redirect URLs** | `https://dreambox-kappa.vercel.app/auth/callback`<br>`https://dreambox-kappa.vercel.app/auth/verify`<br>`https://dreambox-kappa.vercel.app/auth/reset-password` |

---

### Step 4: Configure Email SMTP (Optional but Recommended)\n
For production, use a proper email service instead of Supabase's default:

Go to **Settings** → **Auth** → **SMTP**

**SendGrid Example:**
- **Host:** `smtp.sendgrid.net`
- **Port:** `587`
- **Username:** `apikey`
- **Password:** [Your SendGrid API Key]
- **Sender Name:** `Dreambox`
- **Sender Email:** `noreply@dreambox.com`

---

## 🧪 Testing the Flow

### 1. Test Registration
1. Go to login page
2. Click "Create an account"
3. Fill in details and submit
4. Check email for verification link
5. Click link → Should show "Email Verified!"
6. Wait for admin approval

### 2. Test Password Reset
1. Go to login page
2. Click "Forgot password?"
3. Enter email and submit
4. Check email for reset link
5. Click link → Should show password reset form
6. Enter new password
7. Login with new password

### 3. Test Email Verification
1. Register new account
2. Try to login before verifying → Should show "Please verify your email"
3. Click "Resend verification email"
4. Verify email
5. Login should work (if approved)

---

## 🔒 Security Notes

### Current Implementation
- ✅ Passwords hashed with bcrypt (Supabase handles this)
- ✅ Email verification required
- ✅ Secure token-based password reset
- ✅ Session management with JWT
- ✅ Automatic token refresh

### Admin Approval Still Required
Even after email verification, new users need admin approval:
1. User registers → Email verification sent
2. User verifies email → Can attempt login
3. Login fails with "Account awaiting administrator approval"
4. Admin approves in Settings → Users → Pending Approvals
5. User can now login

---

## 📧 Email Deliverability Tips

1. **Use custom domain** - Send from @dreambox.com instead of @supabase.co
2. **Set up SPF/DKIM** - Prevents emails going to spam
3. **Test with Mail Tester** - https://www.mail-tester.com
4. **Monitor bounce rate** - Remove invalid emails

---

## 🚨 Troubleshooting

### "Email not received"
- Check spam/junk folder
- Verify SMTP settings
- Check Supabase logs: **Logs** → **Auth**

### "Invalid or expired reset link"
- Reset links expire in 1 hour
- User must request new reset

### "Email already registered"
- User already has account
- Try password reset instead

### "User not found" on login
- Email not verified yet
- User doesn't exist
- Wrong email/password

---

## 📚 Useful Links

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [GoTrue JS Client](https://github.com/supabase/gotrue-js)
- [Email Templates Guide](https://supabase.com/docs/guides/auth/auth-email-templates)

---

*Last updated: March 10, 2026*
