# API + web (single origin). Builds the React app, then runs Fastify which serves
# both the static build and the API routes. Build context = repo root.
FROM node:22-alpine
WORKDIR /repo

# Install all workspace deps (incl dev: vite, tsx, typescript) for the build.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

# Source + build the web app with a same-origin API base.
COPY . .
ENV VITE_API_URL=""
RUN npm run build --workspace=apps/web

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "apps/api/src/server.ts"]
