# Backend for Arkiapuri mobile app. Done with MongoDb, Express and Node JS

## Introduction

This is API for Arkiapuri mobile app. You will find mobile app project from here: https://github.com/annaruntti/arkiapuri. Arkiapuri is a mobile native app and done with React Native.

## How to run / use this project

- First clone or download this project.
- Use node version 18.
- Do install everything using `npm install`
- Make sure you created a `.env` file and include `MONGO_URI` and secret key for `JWT_SECRET` and CLOUDINARY_USER_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_KEY_SECRET for Cloudinary. Jsonwebtoken is a package for web tokens.
- run `npm start` -> you should get log text "port is listening" and when database is connected: "our db is connected".
