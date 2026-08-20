# Node/Express gateway
FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Cloud Run injects PORT (8080); the app reads process.env.PORT.
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "index.js"]
