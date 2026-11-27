# Remote AllStarLink <-> YSF & P25 Cross-Mode Bridge + Dashboard
FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/shawpbx/ASL-YSF-and-P25-Bridge" \
      org.opencontainers.image.title="AllStarLink to YSF and P25 Cross-Mode Bridge" \
      org.opencontainers.image.description="Dockerized cross-mode bridge for Remote AllStarLink, YSF Reflector, and P25 Reflector"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=3000 \
    TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    supervisor \
    procps \
    iproute2 \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/bridge/dashboard
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/shared ./src/shared
COPY --from=builder /app/docker ./docker

RUN mkdir -p /opt/bridge/config /var/log/dvswitch /var/lib/dvswitch /var/log/supervisor

EXPOSE 3000/tcp
EXPOSE 34001/udp 34002/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["./node_modules/.bin/tsx", "server.ts"]
