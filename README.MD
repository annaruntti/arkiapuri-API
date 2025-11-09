# Backend for Arkiapuri mobile app. Done with MongoDb, Express and Node JS

## Introduction

This is API for Arkiapuri mobile app. You will find mobile app project from here: https://github.com/annaruntti/arkiapuri. Arkiapuri is a mobile native app and done with React Native.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and update with your credentials
4. Run development server: `npm run dev`

## Environment Variables

### Required Variables

#### Core Configuration
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens

#### Cloudinary (Image Uploads)
- `CLOUDINARY_USER_NAME` - Cloudinary username
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_KEY_SECRET` - Cloudinary API secret

#### Email Service (Family Invitations)
- `EMAIL_SERVICE` - Email service provider (e.g., 'gmail', 'sendgrid', 'mailgun')
- `EMAIL_USER` - Email username/address
- `EMAIL_PASSWORD` - Email password or API key
- `EMAIL_FROM_ADDRESS` - Sender email address (e.g., noreply@arkiapuri.fi)
- `FRONTEND_URL` - Mobile app deep link scheme (e.g., arkiapuri://)
- `WEB_URL` - Web app URL for email links (e.g., http://localhost:8081 or https://yourdomain.com)

#### Optional
- `CORS_ORIGIN` - Allowed CORS origins
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Vision API credentials

### Email Service Setup

#### Using Gmail
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Set environment variables:
   ```
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-specific-password
   EMAIL_FROM_ADDRESS=your-email@gmail.com
   ```

#### Using SendGrid
1. Sign up for SendGrid account
2. Create an API key
3. Set environment variables:
   ```
   EMAIL_SERVICE=sendgrid
   EMAIL_USER=apikey
   EMAIL_PASSWORD=your-sendgrid-api-key
   EMAIL_FROM_ADDRESS=noreply@yourdomain.com
   ```
   Note: Verify your sender email in SendGrid dashboard

#### For Development/Testing
Use Mailtrap (https://mailtrap.io) to test emails without sending real ones:
```
EMAIL_SERVICE=smtp
EMAIL_USER=your-mailtrap-username
EMAIL_PASSWORD=your-mailtrap-password
```

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
- POST `/household/join` - Join household with code (legacy support)

### Household Members
- POST `/household/leave` - Leave current household
- DELETE `/household/members/:memberId` - Remove member (admin/owner only)
- PUT `/household/members/:memberId/role` - Update member role (owner only)

### Meals, Shopping Lists, Pantry, etc.
For complete API documentation, see the Swagger docs at `/api-docs`

## Security

- Rate limiting enabled
- CORS configured
- Helmet security headers
- JWT authentication

## How to run / use this project

### Development Mode

1. First clone or download this project
2. Use node version 18
3. Install dependencies: `npm install`
4. Create `.env` file with required variables:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CLOUDINARY_USER_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_KEY_SECRET`
5. Run the server:
   - `npm run dev` for development with nodemon
   - `npm start` for production mode

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
