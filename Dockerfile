FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/views ./dist/views

# Set up permissions for Hugging Face Spaces & non-root containers
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV PORT=7000
ENV NODE_ENV=production

EXPOSE 7000

CMD ["node", "dist/index.js"]
