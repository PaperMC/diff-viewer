# ---- Build stage ----
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests and lockfile
COPY package.json bunfig.toml bun.lock ./
COPY web/package.json ./web/
COPY web-extension/package.json ./web-extension/

# Install all dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY web/ ./web/

# Build using the bun adapter (selected when NODE_ENV=development)
RUN cd web && NODE_ENV=development bun run build

# ---- Runtime stage ----
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Copy only the built output
COPY --from=builder /app/web/build ./build

EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["bun", "./build/index.js"]
