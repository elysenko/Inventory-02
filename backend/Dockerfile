# node:22-slim (Debian), not alpine: Prisma's query engine is built against
# glibc/OpenSSL 3, and musl images need extra handling to load it at all.
FROM node:22-slim AS builder
WORKDIR /app

# A syntactically valid dummy URL is enough for `prisma generate` — it reads the
# schema, never the database.
ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build \
    && test -f /app/dist/main.js \
    || (echo 'ERROR: dist/main.js missing after build — check tsconfig.build.json rootDir: src' && exit 1)

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# .prisma holds the generated client + query-engine binary; @prisma/client is the
# thin package that loads it. `npm ci` installs only the latter, so both must be
# copied from the builder or the app dies on its first query.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000

# Migrations run before the server binds. A failed migration exits non-zero, so
# Kubernetes never routes traffic to a pod whose schema is behind the code.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
