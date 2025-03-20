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

- First clone or download this project.
- Use node version 18.
- Do install everything using `npm install`
- Make sure you created a `.env` file and include `MONGO_URI` and secret key for `JWT_SECRET` and CLOUDINARY_USER_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_KEY_SECRET for Cloudinary. Jsonwebtoken is a package for web tokens.
- run `npm start` -> you should get log text "port is listening" and when database is connected: "our db is connected".

## Production Deployment

- Deployed on Railway
- MongoDB Atlas for database
- Health check: `GET /health`
- Monitoring: `GET /monitor`

## API Documentation

(Add your API endpoints and usage here)

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
