# Facebook OAuth Setup Guide

This guide explains how to set up Facebook Login for the Arkiapuri application.

## Current Status

✅ **Fully implemented and ready for testing!**

- Frontend: Facebook OAuth flow implemented in `SocialSignInButtons.js`
- Backend: Facebook OAuth routes (`/auth/facebook` and `/auth/facebook/callback`)
- Callback handling: `AuthCallbackScreen.js` handles Facebook auth results
- User model: `facebookId` field added to store Facebook user identifiers

## Prerequisites

1. A Facebook account
2. Access to [Facebook for Developers](https://developers.facebook.com/)
3. No paid subscription required! (Unlike Apple Developer Program)

## Facebook Developer Console Setup

### Step 1: Create a Facebook App

1. Go to [Facebook for Developers](https://developers.facebook.com/)
2. Click **My Apps** in the top right
3. Click **Create App**
4. Choose **Consumer** as the app type (or **Other** if Consumer is not available)
5. Click **Next**

### Step 2: Configure Basic Settings

1. **App Display Name**: Arkiapuri
2. **App Contact Email**: Your email address
3. Click **Create App**
4. Complete the security check if prompted

### Step 3: Add Facebook Login Product

1. In your app dashboard, find **Add a Product** section
2. Find **Facebook Login** and click **Set Up**
3. Choose **Web** as the platform
4. Enter your site URL: `http://localhost:8081` (for development)
5. Click **Save** and **Continue**

### Step 4: Configure OAuth Settings

1. In the left sidebar, go to **Facebook Login** → **Settings**
2. Configure the following:

   **Valid OAuth Redirect URIs**:
   ```
   http://localhost:3000/auth/facebook/callback
   ```
   
   For production, also add:
   ```
   https://api.yourapp.com/auth/facebook/callback
   ```

3. **Client OAuth Login**: `Yes` (enabled)
4. **Web OAuth Login**: `Yes` (enabled)
5. **Enforce HTTPS**: `No` (for development), `Yes` (for production)
6. **Login from Devices**: `No` (not needed for web)
7. Click **Save Changes**

### Step 5: Get App Credentials

1. In the left sidebar, go to **Settings** → **Basic**
2. Find your **App ID** (this is your `FACEBOOK_APP_ID`)
3. Click **Show** next to **App Secret** (this is your `FACEBOOK_APP_SECRET`)
4. Copy both values - you'll need them for environment variables

### Step 6: Configure App Domains

1. Still in **Settings** → **Basic**
2. Find **App Domains**
3. Add:
   ```
   localhost
   ```
   
   For production, add your domain:
   ```
   yourapp.com
   ```
4. Click **Save Changes**

### Step 7: Make App Live (When Ready for Production)

By default, your app is in **Development Mode**, which means only you and testers you add can use it.

**For Development/Testing**:
- App stays in Development Mode
- Only you and added testers can sign in
- To add testers: **Roles** → **Add Testers** → Enter their Facebook email/ID

**For Production**:
1. Complete **Data Use Checkup** (explains how you use user data)
2. Provide **Privacy Policy URL** (required)
3. Choose an **App Category**
4. In the top bar, toggle **App Mode** from Development to Live
5. Facebook may review your app before approval

## Environment Variables

Add these to your backend `.env` file:

```bash
# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Existing variables (required)
APP_URL=http://localhost:3000  # Backend URL
JWT_SECRET=your-jwt-secret-key
```

## How It Works

### Authentication Flow

1. **User clicks "Facebook-tilillä" button**
   - Frontend opens a popup window to `http://localhost:3000/auth/facebook`

2. **Backend redirects to Facebook**
   - Backend (`GET /auth/facebook`) constructs Facebook OAuth URL
   - Redirects user to `facebook.com/dialog/oauth` with:
     - `client_id`: Your Facebook App ID
     - `redirect_uri`: `http://localhost:3000/auth/facebook/callback`
     - `response_type`: `code`
     - `scope`: `email,public_profile`
     - `state`: Random CSRF token

3. **User authorizes with Facebook**
   - User signs in with their Facebook account
   - Facebook redirects back to redirect_uri with authorization code

4. **Backend exchanges code for tokens**
   - Backend (`GET /auth/facebook/callback`) receives the code
   - Exchanges code for `access_token` using:
     - App ID
     - App Secret
     - Authorization code
   - Uses access token to fetch user info from Facebook Graph API

5. **Backend creates/updates user**
   - Requests user data: `id, name, email, picture`
   - Finds user by email or creates new user
   - Stores `facebookId` (the Facebook user ID)
   - Stores profile picture URL
   - Marks email as verified
   - Generates app JWT token

6. **Backend redirects to frontend callback**
   - Redirects to `http://localhost:8081/AuthCallback` with:
     - `provider=facebook`
     - `token`: Your app's JWT token
     - `user`: JSON-encoded user data

7. **Frontend completes authentication**
   - `AuthCallbackScreen` stores data in `localStorage` with key `facebook_auth_result`
   - Main window polls `localStorage` and finds the auth result
   - Calls `onSocialSignIn('facebook', { token, user })`
   - `SignInScreen` saves token and logs user in
   - Popup closes automatically

## Testing the Implementation

### Development Testing

1. **Start both servers**:
   ```bash
   # Backend (in arkiapuri-API directory)
   npm start  # Should run on http://localhost:3000
   
   # Frontend (in arkiapuri directory)
   npm start  # Should run on http://localhost:8081
   ```

2. **Navigate to sign-in page** in your browser

3. **Click "Facebook-tilillä" button**
   - A popup should open
   - You should be redirected to Facebook's login page

4. **Sign in with your Facebook account**
   - Use your Facebook credentials
   - First time: You'll be asked to authorize the app
   - You'll see what data the app requests (email, public profile)

5. **After successful sign-in**:
   - Popup should show "Kirjautuminen onnistui!"
   - Popup closes automatically after 3 seconds
   - Main window should redirect to home screen
   - You should be logged in

### Verify User Created

Check your MongoDB database:

```javascript
// User should have these fields populated:
{
  email: "user@example.com",
  name: "User Name",
  profilePicture: "https://platform-lookaside.fbsbx.com/...",
  facebookId: "1234567890", // Facebook's unique user identifier
  isEmailVerified: true
}
```

### Adding Test Users (Development Mode)

If you want to test with other accounts while in Development Mode:

1. Go to your app in Facebook Developers
2. Click **Roles** → **Roles**
3. Click **Add Testers**
4. Enter their Facebook username, user ID, or email
5. They'll receive an invitation to test your app
6. Once they accept, they can sign in

## Important Notes

### Facebook-Specific Behaviors

1. **Email Requirement**: Users MUST grant email permission. If they decline, the login will fail with "Email permission is required" error.

2. **Profile Picture**: Facebook provides a profile picture URL that's accessible via `picture.data.url` in the Graph API response.

3. **App Review**: For production, if you need permissions beyond `email` and `public_profile`, you'll need Facebook's approval through App Review.

4. **Rate Limits**: Facebook has API rate limits. For most apps, this won't be an issue during authentication.

5. **Access Token Expiration**: Facebook access tokens expire (short-lived: ~2 hours, long-lived: ~60 days). We only use the token during authentication, so this doesn't affect logged-in users.

### Security Considerations

1. **App Secret**: Keep your `FACEBOOK_APP_SECRET` secure. Never commit it to version control or expose it in client-side code.

2. **CSRF Protection**: The implementation includes a `state` parameter for CSRF protection (random token).

3. **HTTPS in Production**: Facebook requires HTTPS for production OAuth redirect URIs.

4. **Scope Minimization**: Only request the permissions you actually need. Current scope: `email,public_profile`.

## Troubleshooting

### "URL Blocked: This redirect failed" error

- **Cause**: Redirect URI not registered in Facebook app settings
- **Fix**: 
  - Go to Facebook Login → Settings
  - Add `http://localhost:3000/auth/facebook/callback` to Valid OAuth Redirect URIs
  - Click Save Changes

### "App Not Set Up" error

- **Cause**: Facebook Login product not added or configured
- **Fix**: 
  - Go to your app dashboard
  - Add Facebook Login product
  - Complete the web platform setup

### "Can't Load URL" in popup

- **Cause**: Backend not running or wrong URL
- **Fix**: 
  - Ensure backend is running on port 3000
  - Check `APP_URL` in `.env` is `http://localhost:3000`

### "Email permission is required" error

- **Cause**: User declined to share email with the app
- **Fix**: 
  - User needs to authorize again and grant email permission
  - Or use a different login method

### Users can't sign in (App in Development Mode)

- **Cause**: App is in Development Mode, only added testers can sign in
- **Fix**: 
  - Add users as Testers in Facebook App → Roles
  - Or switch app to Live mode (requires completing app review)

### Popup doesn't close

- **Cause**: Browser blocking `window.close()`
- **Fix**: This is expected behavior for security. Users see "You can now close this window" message.

## Production Deployment

Before deploying to production:

1. ✅ Add production redirect URI in Facebook Login settings
2. ✅ Add production domain in App Domains
3. ✅ Update `APP_URL` environment variable to production backend URL
4. ✅ Enable HTTPS for all redirect URIs
5. ✅ Complete Data Use Checkup in Facebook Developers
6. ✅ Provide a Privacy Policy URL
7. ✅ Switch app from Development to Live mode
8. ✅ Complete App Review if using additional permissions
9. ✅ Set up monitoring for failed auth attempts
10. ✅ Consider implementing token refresh for long-lived sessions

## Permissions and Privacy

### Currently Requested Permissions

- **email**: To create user accounts and identify users
- **public_profile**: To get user's name and profile picture

### Adding More Permissions

If you need additional data (like friends list, posts, etc.):

1. Update the `scope` parameter in `/auth/facebook` route
2. Submit your app for App Review
3. Explain why you need each permission
4. Implement the data usage as described in your review submission

### Privacy Policy Requirements

For production, you MUST provide a privacy policy that explains:
- What user data you collect
- How you use the data
- How users can delete their data
- Your contact information

## API Version

This implementation uses **Facebook Graph API v18.0**. Facebook regularly releases new versions and deprecates old ones. Check the [Facebook Platform Changelog](https://developers.facebook.com/docs/graph-api/changelog) for updates.

To update the API version:
- Change `v18.0` to the desired version in `/auth/facebook` route
- Test thoroughly as API changes may affect user data structure

## Additional Resources

- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/web)
- [Graph API Reference](https://developers.facebook.com/docs/graph-api/reference/)
- [Facebook App Review](https://developers.facebook.com/docs/app-review)
- [Privacy Policy Guidelines](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-use-checkup/)

## Support

If you encounter issues:
1. Check backend console logs for detailed error messages
2. Check frontend browser console for auth flow debugging
3. Verify all environment variables are set correctly
4. Ensure Facebook app is properly configured
5. Check that you're added as a tester if app is in Development Mode
6. Review Facebook's [Common Errors](https://developers.facebook.com/docs/facebook-login/web/errors/)

