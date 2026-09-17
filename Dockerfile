# build
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bunfig.toml bun.lock ./
COPY web/package.json ./web/
COPY web-extension/package.json ./web-extension/

# install deps
RUN bun install --frozen-lockfile


COPY web/ ./web/

# build using bun
RUN cd web && NODE_ENV=development bun run build

# runtime
FROM oven/bun:1-slim AS runner
WORKDIR /app

COPY --from=builder /app/web/build ./build

#run app on port 3000
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["bun", "./build/index.js"]
