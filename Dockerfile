FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies first for layer caching.
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source and build docs site.
COPY . .

# Incoming CI/CD build args (kept unchanged by name).
ARG VITE_SECRET_KEY
ARG VITE_PLATFORM_KEY
ARG VITE_PLATFORM_VERSION
ARG VITE_PLATFORM_NAME
ARG VITE_BASE_URL
ARG VITE_SOCKET_URL

# Legacy runtime aliases used by existing plugin/config code.
ARG SECRET_KEY
ARG PLATFORM_KEY
ARG PLATFORM_VERSION
ARG PLATFORM_NAME
ARG API_BASE_URL

ENV VITE_SECRET_KEY=$VITE_SECRET_KEY \
    VITE_PLATFORM_KEY=$VITE_PLATFORM_KEY \
    VITE_PLATFORM_VERSION=$VITE_PLATFORM_VERSION \
    VITE_PLATFORM_NAME=$VITE_PLATFORM_NAME \
    VITE_BASE_URL=$VITE_BASE_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    SECRET_KEY=${SECRET_KEY:-$VITE_SECRET_KEY} \
    PLATFORM_KEY=${PLATFORM_KEY:-$VITE_PLATFORM_KEY} \
    PLATFORM_VERSION=${PLATFORM_VERSION:-$VITE_PLATFORM_VERSION} \
    PLATFORM_NAME=${PLATFORM_NAME:-$VITE_PLATFORM_NAME} \
    API_BASE_URL=${API_BASE_URL:-$VITE_BASE_URL} \
    NODE_OPTIONS="--max-old-space-size=4096" \
    CI=false

RUN npm run build

FROM nginx:stable-alpine

COPY --from=builder /app/build /usr/share/nginx/html

RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
