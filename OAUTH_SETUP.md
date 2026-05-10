# OAuth Login Setup Guide — XO Duelist

This guide walks through enabling **Google**, **GitHub**, and **Discord** OAuth login for XO Duelist.

---

## Prerequisites

- A [Supabase](https://supabase.com) project (already set up)
- Access to the Supabase Dashboard → **Authentication → Providers**

---

## 1. Google OAuth

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth Client ID**
5. Choose **Web application**
6. Under **Authorized redirect URIs**, add:
   ```
   https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
   > Find your project ref in Supabase Dashboard → Settings → General
7. Copy the **Client ID** and **Client Secret**

### Step 2: Configure in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers → Google**
2. Toggle **Enable** on
3. Paste your **Client ID** and **Client Secret**
4. Save

---

## 2. GitHub OAuth

### Step 1: Create GitHub OAuth App

1. Go to [GitHub → Settings → Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `XO Duelist`
   - **Homepage URL**: `https://your-app-domain.com` (or `http://localhost:3000` for dev)
   - **Authorization callback URL**:
     ```
     https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
     ```
4. Click **Register application**
5. Copy the **Client ID**, then click **Generate a new client secret** and copy it

### Step 2: Configure in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers → GitHub**
2. Toggle **Enable** on
3. Paste your **Client ID** and **Client Secret**
4. Save

---

## 3. Discord OAuth

### Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → name it `XO Duelist`
3. Go to **OAuth2** tab
4. Under **Redirects**, add:
   ```
   https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
5. Copy the **Client ID** and **Client Secret**

### Step 2: Configure in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers → Discord**
2. Toggle **Enable** on
3. Paste your **Client ID** and **Client Secret**
4. Save

---

## 4. Configure Redirect URLs in Supabase

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Set **Site URL**:
   ```
   http://localhost:3000
   ```
   _(or your production URL)_
3. Add to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://your-production-domain.com/auth/callback
   ```
4. Save

---

## 5. Verify

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000`
3. You should see three OAuth buttons: **Google**, **GitHub**, **Discord**
4. Clicking any button will redirect to the provider's login page
5. After login, you'll be redirected back to `/dashboard`
6. A profile is automatically created with the username extracted from the provider

---

## How It Works

### Auth Flow
```
User clicks OAuth button
  → Supabase redirects to provider login
  → User grants permission
  → Provider redirects to Supabase callback
  → Supabase redirects to /auth/callback
  → App exchanges code for session
  → User redirected to /dashboard
```

### Username Extraction
The `handle_new_user` database trigger automatically extracts usernames:

| Provider | Source Field | Example |
|----------|-------------|---------|
| Email/Password | `username` (from registration form) | `player123` |
| GitHub | `user_name` | `octocat` |
| Google | `full_name` | `John_Doe` |
| Discord | `full_name` or `name` | `GamerTag` |
| Fallback | Email prefix | `john` (from john@gmail.com) |

Spaces in names are automatically converted to underscores.

### Avatar
OAuth provider profile pictures are automatically saved as the user's avatar.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "OAuth callback failed" | Check that the redirect URL in both the provider AND Supabase match exactly |
| User created without username | The `handle_new_user` trigger needs the migration `038_oauth_handle_new_user.sql` applied |
| Provider button not working | Ensure the provider is enabled in Supabase Dashboard → Authentication → Providers |
| Redirect loop | Check that Site URL in Supabase matches your app's URL |
