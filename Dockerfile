# Supported Node LTS
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build && npm prune --omit=dev

RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000
CMD ["node", "dist/app.js"]
