FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --include=dev --workspaces --include-workspace-root

COPY client ./client
COPY server ./server
COPY shared ./shared
RUN npm --workspace client run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root \
    && npm cache clean --force

COPY --from=build /app/server/src ./server/src
COPY --from=build /app/shared ./shared
COPY --from=build /app/client/dist ./client/dist

USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
