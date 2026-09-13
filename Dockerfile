# =============================================================================
# IDP Frontend — multi-stage Dockerfile
# Builds the Vite app, then serves it with nginx (which proxies the API to
# the `backend` service defined in docker-compose.yml).
# =============================================================================

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Same-origin API calls (proxied by nginx) + realtime WebSocket
ARG VITE_API_URL=
ARG VITE_USE_API=true
ARG VITE_WS_URL=ws://localhost:5173
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_API=$VITE_USE_API
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ── Stage 2: nginx ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]