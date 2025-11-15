# Apple OAuth Setup Guide

This guide explains how to set up Sign in with Apple for the Arkiapuri application.

## Current Status

✅ **Fully implemented and ready for testing!**

- Frontend: Apple OAuth flow implemented in `SocialSignInButtons.js`
- Backend: Apple OAuth routes (`/auth/apple` and `/auth/apple/callback`)
- Callback handling: `AuthCallbackScreen.js` handles Apple auth results
- User model: `appleId` field added to store Apple user identifiers

## Prerequisites

1. An Apple Developer account (requires enrollment in the Apple Developer Program - $99/year)
2. A registered App ID in the Apple Developer portal
3. A Services ID configured for Sign in with Apple
4. Access to Apple Developer portal to create keys and certificates

## Apple Developer Console Setup

### Step 1: Create an App ID

1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click on **Identifiers** → **App IDs**
4. Click the **+** button to create a new App ID
5. Select **App** and click **Continue**
6. Configure:
   - **Description**: Arkiapuri App
   - **Bundle ID**: com.yourcompany.arkiapuri (explicit)
   - **Capabilities**: Check **Sign In with Apple**
7. Click **Continue** and **Register**

### Step 2: Create a Services ID

1. In **Identifiers**, click the **+** button
2. Select **Services IDs** and click **Continue**
3. Configure:
   - **Description**: Arkiapuri Web Service
   - **Identifier**: com.yourcompany.arkiapuri.service (must be different from App ID)
4. Click **Continue** and **Register**
5. Click on your newly created Services ID
6. Check **Sign In with Apple** and click **Configure**
7. In the configuration:
   - **Primary App ID**: Select your App ID from Step 1
   - **Domains and Subdomains**: Add:
     - `localhost` (for development)
     - Your production domain (e.g., `arkiapuri.com`)
   - **Return URLs**: Add:
     - `http://localhost:3000/auth/apple/callback` (backend dev)
     - Your production callback URL (e.g., `https://api.arkiapuri.com/auth/apple/callback`)
8. Click **Next**, **Done**, then **Continue** and **Save**

### Step 3: Create a Key for Sign in with Apple

1. Go to **Keys** section
2. Click the **+** button
3. Configure:
   - **Key Name**: Arkiapuri Sign in with Apple Key
   - Check **Sign in with Apple**
   - Click **Configure** next to Sign in with Apple
   - Select your **Primary App ID** from Step 1
   - Click **Save**
4. Click **Continue** and **Register**
5. **Download the key file (.p8)** - You can only download this once!
6. Note down:
   - **Key ID** (10-character string)
   - **Team ID** (found in the top right of the Apple Developer portal)

### Step 4: Generate Client Secret

Apple doesn't use a static client secret. Instead, you need to generate a JWT (JSON Web Token) signed with your private key. This needs to be regenerated periodically (valid for max 6 months).

You can use a script to generate it or use online tools. Here's a Node.js example:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('path/to/AuthKey_XXXXXXXXXX.p8', 'utf8');

const token = jwt.sign(
  {},
  privateKey,
  {
    algorithm: 'ES256',
    expiresIn: '180d', // 6 months
    audience: 'https://appleid.apple.com',
    issuer: 'YOUR_TEAM_ID', // 10-character Team ID
    subject: 'com.yourcompany.arkiapuri.service', // Your Services ID
    header: {
      alg: 'ES256',
      kid: 'YOUR_KEY_ID' // 10-character Key ID
    }
  }
);

console.log(token);
```

Save this token - it's your `APPLE_CLIENT_SECRET`.

## Environment Variables

Add these to your backend `.env` file:

```bash
# Apple OAuth
APPLE_CLIENT_ID=com.yourcompany.arkiapuri.service  # Your Services ID
APPLE_SERVICE_ID=com.yourcompany.arkiapuri.service  # Same as APPLE_CLIENT_ID
APPLE_CLIENT_SECRET=eyJhbGc...  # The JWT token you generated
APPLE_TEAM_ID=XXXXXXXXXX  # Your 10-character Team ID
APPLE_KEY_ID=XXXXXXXXXX  # Your 10-character Key ID

# Existing variables (required)
APP_URL=http://localhost:3000  # Backend URL
JWT_SECRET=your-jwt-secret-key
```

## How It Works

### Authentication Flow

1. **User clicks "Sign in with Apple" button**
   - Frontend opens a popup window to `http://localhost:3000/auth/apple`

2. **Backend redirects to Apple**
   - Backend (`GET /auth/apple`) constructs Apple OAuth URL
   - Redirects user to `appleid.apple.com` with:
     - `client_id`: Your Services ID
     - `redirect_uri`: `http://localhost:3000/auth/apple/callback`
     - `response_type`: `code`
     - `scope`: `name email`
     - `response_mode`: `form_post` (Apple POSTs the response)

3. **User authorizes with Apple**
   - User signs in with their Apple ID
   - Apple POSTs authorization code back to redirect_uri

4. **Backend exchanges code for tokens**
   - Backend (`POST /auth/apple/callback`) receives the code
   - Exchanges code for `id_token` using:
     - Client ID
     - Client Secret (JWT)
     - Authorization code
   - Decodes `id_token` to get user info (email, sub)

5. **Backend creates/updates user**
   - Finds user by email or creates new user
   - Stores `appleId` (the `sub` claim from token)
   - Marks email as verified
   - Generates app JWT token

6. **Backend redirects to frontend callback**
   - Redirects to `http://localhost:8081/AuthCallback` with:
     - `provider=apple`
     - `token`: Your app's JWT token
     - `user`: JSON-encoded user data

7. **Frontend completes authentication**
   - `AuthCallbackScreen` stores data in `localStorage` with key `apple_auth_result`
   - Main window polls `localStorage` and finds the auth result
   - Calls `onSocialSignIn('apple', { token, user })`
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

3. **Click "Apple ID:llä" button**
   - A popup should open
   - You should be redirected to Apple's sign-in page

4. **Sign in with your Apple ID**
   - Use your Apple ID credentials
   - First time: You'll be asked to authorize the app
   - You can choose to hide or share your email

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
  email: "user@privaterelay.appleid.com" or user's real email,
  name: "User Name" or email prefix,
  appleId: "001234.567890abcdef....", // Apple's unique user identifier
  isEmailVerified: true
}
```

## Important Notes

### Apple-Specific Behaviors

1. **Email Privacy**: Users can choose to hide their email. Apple will provide a relay email like `abc123@privaterelay.appleid.com` that forwards to the user's real email.

2. **User Name**: Apple only provides the user's name on the FIRST sign-in. Store it immediately! Subsequent sign-ins won't include name data.

3. **Client Secret Expiration**: The JWT-based client secret expires (max 6 months). You'll need to regenerate it periodically.

4. **POST Callback**: Unlike Google (which uses GET), Apple uses POST for the callback. Make sure your route is `router.post("/apple/callback", ...)`.

5. **Testing with Same Apple ID**: Apple remembers authorization. To test the flow again with the same Apple ID:
   - Go to [appleid.apple.com](https://appleid.apple.com)
   - Sign in → Security → Apps Using Apple ID
   - Remove Arkiapuri
   - Now you can test the first-time flow again

### Security Considerations

1. **Validate ID Token**: The backend should validate the `id_token` signature in production. Use Apple's public keys to verify.

2. **Client Secret Security**: Never commit your `.p8` key file or the generated client secret to version control.

3. **HTTPS in Production**: Apple requires HTTPS for production domains and redirect URIs.

4. **Token Expiration**: Implement client secret rotation before the 6-month expiration.

## Troubleshooting

### "Invalid client" error

- **Cause**: Wrong Services ID or client secret
- **Fix**: 
  - Verify `APPLE_CLIENT_ID` matches your Services ID
  - Regenerate the client secret JWT with correct Team ID, Key ID, and Services ID

### "Invalid redirect_uri" error

- **Cause**: Redirect URI not registered in Services ID configuration
- **Fix**: 
  - Go to Apple Developer Portal → Services ID
  - Click Configure on Sign in with Apple
  - Add `http://localhost:3000/auth/apple/callback` to Return URLs
  - Save changes

### Popup doesn't close

- **Cause**: Browser blocking `window.close()`
- **Fix**: This is expected behavior for security. Users see "You can now close this window" message.

### No user name received

- **Cause**: Apple only sends name on first authorization
- **Fix**: 
  - Revoke app access at appleid.apple.com
  - Test again with first-time flow
  - Or use email prefix as fallback name

### Token validation fails

- **Cause**: Incorrectly decoded or expired ID token
- **Fix**: 
  - Check that you're decoding the JWT correctly
  - Verify the token hasn't expired
  - In production, validate signature with Apple's public keys

## Production Deployment

Before deploying to production:

1. ✅ Register your production domain in Services ID
2. ✅ Add production redirect URI (`https://api.yourapp.com/auth/apple/callback`)
3. ✅ Update `APP_URL` environment variable to production backend URL
4. ✅ Regenerate client secret if close to expiration
5. ✅ Implement proper ID token signature validation
6. ✅ Set up monitoring for failed auth attempts
7. ✅ Implement client secret rotation strategy

## Additional Resources

- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Apple ID Token Validation](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)

## Support

If you encounter issues:
1. Check backend console logs for detailed error messages
2. Check frontend browser console for auth flow debugging
3. Verify all environment variables are set correctly
4. Ensure Apple Developer account is in good standing
5. Check that Services ID and App ID are properly configured

