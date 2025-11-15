# Google OAuth Setup Guide

## ✅ Current Status

- ✅ **Google OAuth is FULLY WORKING!**
- ✅ Backend OAuth endpoints are set up
- ✅ Frontend uses localStorage for popup communication
- ✅ Users can log in with their real Google accounts
- ✅ JWT tokens are generated and stored
- ✅ Streamlined flow - no extra steps

## 🔧 Setup Real Google OAuth

### Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**

   - Visit: https://console.cloud.google.com/

2. **Create a new project** (or select existing)

   - Click "Select a project" → "New Project"
   - Name it "Arkiapuri" or similar

3. **Enable Google+ API**

   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" or "Google Identity"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
5. **Configure OAuth consent screen** (if prompted)

   - User Type: External
   - App name: Arkiapuri
   - User support email: your email
   - Developer contact: your email
   - Add scopes: `email`, `profile`, `openid`

6. **Set Authorized redirect URIs**
   Add these URIs:

   ```
   http://localhost:3000/auth/google/callback
   ```

7. **Set Authorized JavaScript origins**
   Add these origins:

   ```
   http://localhost:3000
   http://localhost:8081
   ```

8. **Copy credentials**
   - You'll get a **Client ID** and **Client Secret**
   - Save these securely!

### Step 2: Configure Backend Environment Variables

Add these to your `/Users/anna.tiala/Projects/Personal/arkiapuri-API/.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
APP_URL=http://localhost:3000

# JWT Secret (if not already set)
JWT_SECRET=your_super_secret_jwt_key_here

# MongoDB (if not already set)
MONGO_URI=mongodb://localhost:27017/arkiapuri

# Port
PORT=3000
```

### Step 3: Test the OAuth Flow

1. **Start your backend**:

   ```bash
   cd /Users/anna.tiala/Projects/Personal/arkiapuri-API
   npm run dev
   ```

2. **Start your frontend**:

   ```bash
   cd /Users/anna.tiala/Projects/Personal/arkiapuri
   npm start
   ```

3. **Test in web browser**:
   - Go to sign-in screen
   - Click "Google-tilillä" button
   - Popup opens with Google login
   - Select your Google account
   - Popup closes automatically
   - You are logged in and redirected to home screen! 🎉

### Step 4: Production Setup

When deploying to production, update:

1. **Google Cloud Console**:

   - Add production URL to authorized redirect URIs:

   ```
   https://your-production-domain.com/auth/google/callback
   ```

2. **Backend .env** (production):

   ```env
   APP_URL=https://your-production-domain.com
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

3. **Frontend** (no changes needed - production URL is handled by backend redirect)

## 🧪 Testing

### Test Google OAuth Login

- Click "Google-tilillä" button
- Popup opens with Google login
- Select your Google account
- Popup shows "Kirjautuminen onnistui!" and closes after 3 seconds
- You are logged in to the home screen! 🎉

## 📝 Current Implementation

### Frontend: `src/components/SocialSignInButtons.js`

- Direct Google OAuth flow (no modal)
- `handleRealGoogleLogin()`: Opens Google OAuth in popup
- Uses localStorage to communicate between popup and main window
- Polls localStorage every 500ms for auth result

### Frontend: `src/screens/AuthCallbackScreen.js`

- React component that handles OAuth callback
- Stores JWT token and user data in localStorage
- Automatically closes popup after 3 seconds

### Backend: `src/routes/auth.js`

- `GET /auth/google`: Redirects to Google OAuth
- `GET /auth/google/callback`: Handles OAuth callback, creates/finds user, generates JWT
- Redirects to frontend `AuthCallback` route with token and user data

## 🐛 Troubleshooting

### "redirect_uri_mismatch" error

- Check that redirect URI in Google Console matches exactly: `http://localhost:3000/auth/google/callback`
- Must include protocol (http:// or https://)
- No trailing slashes
- Verify `APP_URL=http://localhost:3000` in your `.env` file

### Popup doesn't close automatically

- This is normal - some browsers prevent popups from closing themselves due to security
- Users can close it manually after seeing "Kirjautuminen onnistui!"
- Popup tries to close after 3 seconds

### Login doesn't complete

- Check browser console in both main window and popup for errors
- Verify backend logs show successful token generation
- Check that localStorage is not blocked in browser settings

### Backend errors

- Check that `.env` file has all required variables
- Verify MongoDB is running
- Check backend console for detailed errors
- Ensure `APP_URL` matches your backend server URL (port 3000, not 8081)

## 🔐 Security Notes

- Never commit `.env` file to git
- Use strong JWT_SECRET (32+ characters, random)
- In production, use HTTPS only
- Consider adding rate limiting to OAuth endpoints
