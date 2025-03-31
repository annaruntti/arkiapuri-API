const swaggerJsdoc = require("swagger-jsdoc")

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Arkiapuri API",
      version: "1.0.0",
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? "https://your-production-url"
            : `http://localhost:${process.env.PORT || 3000}`,
      },
      {
        url: process.env.CORS_ORIGIN || "http://localhost:8081",
        description: "Frontend Server",
      },
    ],
  },
  apis: ["./src/routes/*.js"],
}

module.exports = swaggerJsdoc(options)
