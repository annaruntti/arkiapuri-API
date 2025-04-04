# Backend for Arkiapuri mobile app. Done with MongoDb, Express and Node JS

## Introduction

This is API for Arkiapuri mobile app. You will find mobile app project from here: https://github.com/annaruntti/arkiapuri. Arkiapuri is a mobile native app and done with React Native.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and update with your credentials
4. Run development server: `npm run dev`

## Environment Variables

See `.env.example` for required environment variables.

## API Endpoints

- Auth
  - POST /sign-in
  - POST /create-user
  - POST /sign-out
- User Profile
  - GET /profile
  - POST /upload-profile
  - POST /profile/image
    ...

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
