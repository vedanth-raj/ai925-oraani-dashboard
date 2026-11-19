FROM node:20-alpine

WORKDIR /app

# Copy root and client package definitions
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm install
RUN npm --prefix client install

# Copy source code
COPY . .

# Build frontend PWA
RUN npm --prefix client run build

# Ensure uploads and data directories exist
RUN mkdir -p uploads data

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/server.js"]
