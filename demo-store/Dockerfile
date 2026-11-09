# Ardisa on its own: the image for this repository, with npm.
#
#   docker build -t ardisa .
#   docker run -p 3003:3003 --env-file .env.local -v ardisa-data:/data ardisa
#
# Nothing Selwise-specific is baked in at build time: the site key, API keys
# and URLs are read at REQUEST time from the environment
# (src/lib/selwise/config.ts), so one image serves any channel.

# ---------- Builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 ships musl prebuilds; the toolchain is the fallback.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

# ---------- Runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# font-dejavu: product pictures are rasterised to PNG with resvg (feed images,
# e-mail, push) and the labels drawn on bottles and candles need a font.
RUN apk add --no-cache dumb-init font-dejavu python3 make g++ \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && apk del python3 make g++

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/examples ./examples

RUN mkdir -p /data .next/cache && chown nodejs:nodejs /data .next/cache

ENV DEMO_STORE_DATA_DIR=/data
USER nodejs
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3003/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["dumb-init", "npm", "start"]
