# Multi-stage build: compile web + API, then run from a lean runtime image.
# VITE_* vars are baked into the frontend bundle at build time — pass them
# as build-args from docker-compose.prod.yml.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN mkdir -p packages
RUN npm ci

COPY . .

ARG VITE_API_URL=""
ARG VITE_LIVEKIT_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL

RUN cd apps/api && npx prisma generate
RUN npm run build --workspace=apps/web
RUN npm run build --workspace=apps/api

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN mkdir -p packages && npm ci --omit=dev

# Prisma needs the schema + generated client at runtime (for migrate deploy)
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && npx prisma generate

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

RUN mkdir -p recordings uploads

EXPOSE 4000

# Migrate DB on startup, then serve
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && cd /app && node apps/api/dist/server.js"]
