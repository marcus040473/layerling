# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 999 nodejs \
  && useradd --system --uid 999 --gid nodejs nextjs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# The start page keeps the preview pictures of the designs here; the folder must belong to the user the
# server runs as, or every picture is refused and the cards stay on "No preview yet".
RUN mkdir -p /app/.codex/project-thumbnails \
  && chown -R nextjs:nodejs /app/.codex

USER nextjs
EXPOSE 3000

CMD ["npm", "start"]
