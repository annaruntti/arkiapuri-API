# Backend for Arkiapuri mobile app. Done with MongoDb, Express and Node JS

## Introduction

This is API for Arkiapuri mobile app. You will find mobile app project from here: https://github.com/annaruntti/arkiapuri. Arkiapuri is a mobile native app and done with React Native.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and update with your credentials
4. Run development server: `npm run dev`

## Environment Variables

Canonical docs (local / staging / production, AWS secrets, `app.arkiapuri.fi`):

- Template: [`.env.example`](./.env.example) → copy to `.env`
- Matrix & ops: [`docs/ENV.md`](./docs/ENV.md)

Minimum to boot locally: `MONGODB_URI`, `JWT_SECRET` (≥32 chars), `CORS_ORIGIN`, and Cloudinary keys. Generate a secret with `openssl rand -hex 32`. Never set `AI_GRANT_PREMIUM=true` when `NODE_ENV=production`.

## API Endpoints

### Authentication
- POST `/sign-in` - User login
- POST `/create-user` - User registration
- POST `/sign-out` - User logout

### User Profile
- GET `/profile` - Get user profile
- POST `/upload-profile` - Upload profile data
- POST `/profile/image` - Upload profile image

### Household Management
- POST `/household` - Create a new household
- GET `/household` - Get household information
- PUT `/household` - Update household settings
- DELETE `/household` - Delete household (owner only)

### Family Invitations
- POST `/household/invite` - Send email invitation to join household
- GET `/household/invitation/:token` - Get invitation details (no auth required)
- POST `/household/accept-invite` - Accept invitation using token

### Household Members
- POST `/household/leave` - Leave current household
- DELETE `/household/members/:memberId` - Remove member (admin/owner only)
- PUT `/household/members/:memberId/role` - Update member role (owner only)

### Meals, Shopping Lists, Pantry, etc.
For complete API documentation, see the Swagger docs at `/api-docs`

### Gemini AI (pantry scanner)

The pantry (pentteri) can be filled from a photo, and a saved meal can be drafted from a dish photo. The app sends a compressed JPEG to Gemini (`gemini-3.5-flash-lite` by default). The model returns structured candidates. The API does **not** write pantry items or meals automatically: the user reviews and confirms in the app.

After names are set, the API looks up extra fields from the household catalog and Open Food Facts (categories and macros per 100 g). Scan uses a shared monthly credit pool on the household (or the solo user). Default limit is 40 credits; one pantry scan costs 2 and one dish-from-photo draft costs 3.

| Method | Path | Auth | Credits | Description |
| --- | --- | --- | --- | --- |
| GET | `/ai/entitlement` | JWT | — | Plan, remaining credits, and feature costs |
| POST | `/ai/pantry-scan` | JWT + premium | 2 | Detect products from a pantry photo |
| POST | `/ai/dish-from-photo` | JWT + premium | 3 | Draft a meal (name, recipe, ingredients) from a dish photo |
| POST | `/food-items/lookup-by-name` | JWT | — | Prefill category and nutrition by product name |

`POST /ai/pantry-scan` and `POST /ai/dish-from-photo` body:

```json
{
  "image": "<base64 JPEG/PNG/WebP>",
  "mimeType": "image/jpeg"
}
```

Successful pantry scan returns `items` (candidates) and `usage` (`creditsCharged`, `remainingCredits`, `creditLimit`). The client then `POST /pantry/items` for the products the user selected.

Successful dish-from-photo returns `meal` (name, recipe, servings, cooking time, difficulty, roles, categories), `ingredients` (candidates with catalog/OFF matches) and `usage`. The client then creates the meal with `POST /meals`.

Reserved for later (not implemented yet): `recipe_suggest` (1 credit).

To improve how accurately pantry scan names products in the app, run `npm run eval:pantry-scan` from this repository. How to run it, how scores are defined, and how to compare changes are in `scripts/eval/pantry-scan/README.md`.

## Security

- Rate limiting enabled
- CORS configured
- Helmet security headers
- JWT authentication

## How to run / use this project

### Development Mode

1. First clone or download this project
2. Use Node.js 22 LTS (see Dockerfile)
3. Install dependencies: `npm install`
4. Copy `.env.example` → `.env` and fill secrets (see [`docs/ENV.md`](./docs/ENV.md)).
5. Run the server:
   - `npm run dev` for development
   - `npm start` for production (`node dist/app.js` after `npm run build`)

### Docker Development

1. Make sure Docker is installed
2. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```
3. The API will be available at `http://localhost:3000`

### Production Deployment

- Deployed on Railway
- MongoDB Atlas for database
- Health check: `GET /health`
- Monitoring: `GET /monitor`

## Production Build and Deployment

### Prerequisites

1. Railway account and CLI installed
2. MongoDB Atlas account
3. Git repository connected to Railway

### Deployment Steps

1. **Push your changes to Git**

   ```bash
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```

2. **Deploy to Railway**

   ```bash
   railway up
   ```

3. **Verify deployment**
   - Check the deployment logs in Railway dashboard
   - Test the health endpoint: `https://your-railway-url/health`
   - Verify API functionality through the Swagger docs: `https://your-railway-url/api-docs`

### Environment Variables for Production

Ensure these environment variables are set in Railway project:

- `NODE_ENV`: Set to "production"
- `PORT`: Set to "3000"
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: Your JWT secret key
- `CLOUDINARY_USER_NAME`: Your Cloudinary username
- `CLOUDINARY_API_KEY`: Your Cloudinary API key
- `CLOUDINARY_API_KEY_SECRET`: Your Cloudinary API secret
- `CORS_ORIGIN`: Set to your frontend URL (e.g., "https://your-frontend-url.com")
- `EMAIL_SERVICE`: Your email service provider (e.g., "sendgrid", "ses")
- `EMAIL_USER`: Email service username/API key
- `EMAIL_PASSWORD`: Email service password/secret
- `EMAIL_FROM_ADDRESS`: Sender email address (e.g., "noreply@arkiapuri.fi")
- `FRONTEND_URL`: Your mobile app deep link or web URL (e.g., "arkiapuri://app")
- `GOOGLE_CALLBACK_URL`: Set to "https://your-railway-url/auth/google/callback"
- `GEMINI_API_KEY`: Google AI Studio key for pantry scan and dish-from-photo (optional; AI routes are disabled without it)
- `AI_MODEL`: Gemini model id (default `gemini-3.5-flash-lite`)
- `AI_MONTHLY_CREDIT_LIMIT`: Shared household/user monthly AI credits (default `40`)
- `AI_MONTHLY_BUDGET_USD`: Global monthly spend cap (default `20`)

### Troubleshooting Production Deployment

1. **Check deployment logs** in Railway dashboard for errors
2. **Verify environment variables** are correctly set
3. **Test MongoDB connection** by checking the health endpoint
4. **Check CORS configuration** if frontend can't connect to the API
5. **Verify port configuration** in `railway.toml` and `app.js`

## API Documentation

- Development: `http://localhost:3000/api-docs`
- Production: `https://your-railway-url/api-docs`

## Deployment URLs

- API: https://your-railway-url
- API Documentation: https://your-railway-url/api-docs
- Health Check: https://your-railway-url/health

## Environment Setup

### Development

1. Copy `.env.example` to `.env`
2. Update credentials
3. Run `npm run dev`

### Production

- Deployed via Railway
- MongoDB Atlas for database
- Auto-deploys from main branch
