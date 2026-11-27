# AllStarLink Node 20800 <-> YSF 95100 & P25 9510 Cross-Mode Bridge
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    supervisor \
    procps \
    iproute2 \
    netcat-openbsd \
    tzdata \
    qemu-user-static \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL http://dvswitch.org/bookworm -o /tmp/bookworm \
    && chmod +x /tmp/bookworm \
    && /tmp/bookworm \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       analog-bridge \
       mmdvm-bridge \
       md380-emu \
       ysfgateway \
       p25gateway \
       dvswitch \
    && rm -rf /var/lib/apt/lists/* /tmp/bookworm

RUN mkdir -p /opt/bridge/config /opt/bridge/dashboard /var/log/dvswitch /var/log/supervisor /var/lib/dvswitch

COPY config/ /opt/bridge/config/
COPY supervisord.conf /etc/supervisor/conf.d/bridge.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD supervisorctl status | grep -q "RUNNING" && curl -fsS http://127.0.0.1:3000/api/health || exit 1

EXPOSE 3000/tcp
EXPOSE 32001/udp 34001/udp
EXPOSE 32002/udp 34002/udp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
