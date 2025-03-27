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
3. The API will be available at `http://localhost:3001`

### Production Deployment

- Deployed on Railway
- MongoDB Atlas for database
- Health check: `GET /health`
- Monitoring: `GET /monitor`

## API Documentation

- Development: `http://localhost:3001/api-docs`
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
