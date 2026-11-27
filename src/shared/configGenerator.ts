import { BridgeConfig, GeneratedFile } from './bridgeTypes.js';

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  callsign: 'N0CALL',
  dmrId: '1234567',
  location: 'My Location',
  aslNode: '12345',
  aslPrivateYsfNode: '1998',
  aslPrivateP25Node: '1999',
  aslHost: '192.168.1.100',
  dockerHostIp: '192.168.1.200',
  ysfReflectorId: '10000',
  ysfReflectorName: 'MY-YSF',
  ysfReflectorDescription: 'My YSF Reflector',
  ysfReflectorHost: 'ysfreflector-with-dashboard',
  ysfReflectorPort: 42000,
  ysfDashboardPort: 42080,
  ysfMode: 'YSFN',
  ysfUsrpTxPort: 32001,
  ysfUsrpRxPort: 34001,
  ysfTlvTxPort: 31103,
  ysfTlvRxPort: 31100,
  p25ReflectorId: '10100',
  p25ReflectorHost: 'p25reflector',
  p25ReflectorPort: 41000,
  p25LogPath: '/var/log/P25Reflector',
  p25Nac: '293',
  p25UsrpTxPort: 32002,
  p25UsrpRxPort: 34002,
  p25TlvTxPort: 34103,
  p25TlvRxPort: 34100,
  vocoderEngine: 'md380-emu',
  ambeUsbDevice: '/dev/ttyUSB0',
  ambeBaudRate: 460800,
  md380EmuPort: 2470,
  aslGainYsf: 0.35,
  usrpGainYsf: 0.40,
  tlvGainYsf: 0.35,
  aslGainP25: 0.35,
  usrpGainP25: 0.45,
  tlvGainP25: 0.35,
  useAgc: true,
  jitterBufferMs: 40,
  timeoutTimerSec: 180,
  githubRepo: 'shawpbx/ASL-YSF-and-P25-Bridge',
  containerName: 'asl-crossmode-bridge',
  networkModeHost: false,
  includeReflectorContainers: true,
  includeCasaOsMetadata: true,
  dashboardPort: 3000,
  timezone: 'UTC',
};

export function generateAllBridgeFiles(cfg: BridgeConfig): GeneratedFile[] {
  const aslAudioMode = cfg.useAgc ? 'AUDIO_USE_AGC' : 'AUDIO_USE_GAIN';
  const usrpAudioMode = 'AUDIO_USE_GAIN';
  const decoderFallBack = cfg.vocoderEngine === 'md380-emu' ? 'true' : 'false';
  const useEmulator = cfg.vocoderEngine === 'md380-emu' ? 'true' : 'false';
  const ambeUsbBlock =
    cfg.vocoderEngine === 'ambe-usb'
      ? `    devices:\n      - "${cfg.ambeUsbDevice}:${cfg.ambeUsbDevice}"\n`
      : '';

  const repoSlug = (cfg.githubRepo || 'shawpbx/ASL-YSF-and-P25-Bridge')
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
  const ghcrImage = `ghcr.io/${repoSlug.toLowerCase()}:latest`;

  // Resolve reflector addresses cleanly for both Docker bridge network (Dockhand/CasaOS) and host networking
  const effectiveYsfHost =
    cfg.includeReflectorContainers && cfg.networkModeHost && cfg.ysfReflectorHost === 'ysfreflector-with-dashboard'
      ? '127.0.0.1'
      : cfg.includeReflectorContainers && !cfg.networkModeHost && cfg.ysfReflectorHost === '127.0.0.1'
      ? 'ysfreflector-with-dashboard'
      : cfg.ysfReflectorHost;

  const effectiveP25Host =
    cfg.includeReflectorContainers && cfg.networkModeHost && cfg.p25ReflectorHost === 'p25reflector'
      ? '127.0.0.1'
      : cfg.includeReflectorContainers && !cfg.networkModeHost && cfg.p25ReflectorHost === '127.0.0.1'
      ? 'p25reflector'
      : cfg.p25ReflectorHost;

  const ysfGatewayClientPort = cfg.ysfReflectorPort === 42000 ? 42001 : 42000;

  const networkBlock = cfg.networkModeHost
    ? `    network_mode: host`
    : `    networks:
      - default
    ports:
      - "${cfg.dashboardPort}:${cfg.dashboardPort}/tcp"
      - "${cfg.ysfUsrpRxPort}:${cfg.ysfUsrpRxPort}/udp"
      - "${cfg.p25UsrpRxPort}:${cfg.p25UsrpRxPort}/udp"`;

  const dependsOnBlock = cfg.includeReflectorContainers
    ? `    depends_on:
      - p25reflector
      - ysfreflector-with-dashboard
`
    : '';

  const reflectorServicesBlock = cfg.includeReflectorContainers
    ? `
  p25reflector:
    container_name: P25Reflector-${cfg.p25ReflectorId}
    image: corrosive/docker-p25reflector
    networks:
      - default
    ports:
      - "${cfg.p25ReflectorPort}:41000/udp"
    restart: unless-stopped
    stdin_open: true
    tty: true
    volumes:
      - ${cfg.p25LogPath}:/var/log/P25Reflector

  ysfreflector-with-dashboard:
    container_name: ysfreflector-with-dashboard
    image: ghcr.io/neilbartley/ysfreflector-with-dashboard:latest
    environment:
      REFLECTOR_DESCRIPTION: ${cfg.ysfReflectorDescription}
      REFLECTOR_NAME: ${cfg.ysfReflectorName}
    networks:
      - default
    ports:
      - mode: ingress
        protocol: udp
        published: "${cfg.ysfReflectorPort}"
        target: 42000
      - mode: ingress
        protocol: tcp
        published: "${cfg.ysfDashboardPort}"
        target: 80
    restart: unless-stopped
    volumes: []
`
    : '';

  const casaOsBlock = cfg.includeCasaOsMetadata
    ? `
x-casaos:
  is_uncontrolled: false
  main: ysfreflector-with-dashboard
  port_map: "${cfg.ysfDashboardPort}"
  store_app_id: upbeat_kurt
  title:
    custom: YSFReflector
`
    : '';

  const dockerfile = `# AllStarLink Remote Node ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName}) & P25 ${cfg.p25ReflectorId} Bridge
FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/${repoSlug}" \\
      org.opencontainers.image.title="ASL ${cfg.aslNode} to YSF ${cfg.ysfReflectorId} and P25 ${cfg.p25ReflectorId} Bridge" \\
      org.opencontainers.image.description="Dockerized cross-mode bridge for Remote AllStarLink Node ${cfg.aslNode}, YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName}), and P25 ${cfg.p25ReflectorId}"

ENV DEBIAN_FRONTEND=noninteractive \\
    NODE_ENV=production \\
    PORT=${cfg.dashboardPort} \\
    TZ=${cfg.timezone}

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates \\
    curl \\
    supervisor \\
    procps \\
    iproute2 \\
    tzdata \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/bridge/dashboard
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/shared ./src/shared
COPY --from=builder /app/docker ./docker

RUN mkdir -p /opt/bridge/config /var/log/dvswitch /var/lib/dvswitch /var/log/supervisor

EXPOSE ${cfg.dashboardPort}/tcp
EXPOSE ${cfg.ysfUsrpRxPort}/udp ${cfg.p25UsrpRxPort}/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -fsS http://127.0.0.1:${cfg.dashboardPort}/api/health || exit 1

CMD ["./node_modules/.bin/tsx", "server.ts"]
`;

  const dockerCompose = `# Repository: https://github.com/${repoSlug}
# Dockhand / CasaOS / Portainer ready — pulls prebuilt GHCR image (no local Dockerfile required)
# Connects over USRP UDP to Remote AllStarLink Node ${cfg.aslNode} at ${cfg.aslHost}

networks:
  default:
    external: false
    ipam: {}
    name: YSFReflector

services:
  asl-crossmode-bridge:
    image: ${ghcrImage}
    container_name: ${cfg.containerName}
    restart: unless-stopped
${dependsOnBlock}${networkBlock}
${ambeUsbBlock}    environment:
      - TZ=${cfg.timezone}
      - NODE_ENV=production
      - PORT=${cfg.dashboardPort}
      - REMOTE_ASL_HOST=${cfg.aslHost}
      - ASL_NODE=${cfg.aslNode}
      - YSF_REFLECTOR=${cfg.ysfReflectorId}
      - YSF_REFLECTOR_NAME=${cfg.ysfReflectorName}
      - P25_REFLECTOR=${cfg.p25ReflectorId}
      - BRIDGE_CALLSIGN=${cfg.callsign}
      - BRIDGE_DMR_ID=${cfg.dmrId}
    volumes:
      - bridge_config:/opt/bridge/config
      - bridge_logs:/var/log/dvswitch
      - bridge_data:/var/lib/dvswitch
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
${reflectorServicesBlock}
volumes:
  bridge_config:
  bridge_logs:
  bridge_data:
${casaOsBlock}`;

  const githubWorkflowYml = `name: Build and Publish ASL-YSF-P25 Bridge Image

on:
  push:
    branches: ["main"]
    tags: ["v*"]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${repoSlug.toLowerCase()}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up QEMU (multi-arch Raspberry Pi / x86_64)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}
            type=sha,prefix=sha-

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
`;

  const supervisordConf = `[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
user=root

[program:md380-emu]
command=/usr/bin/md380-emu -S ${cfg.md380EmuPort}
autostart=${cfg.vocoderEngine === 'md380-emu' ? 'true' : 'false'}
autorestart=true
priority=10
stdout_logfile=/var/log/dvswitch/md380-emu.log
stderr_logfile=/var/log/dvswitch/md380-emu.err.log

[program:mmdvm_bridge]
command=/opt/MMDVM_Bridge/MMDVM_Bridge /opt/bridge/config/MMDVM_Bridge.ini
environment=DVSWITCH="/opt/bridge/config/DVSwitch.ini"
autostart=true
autorestart=true
priority=20
stdout_logfile=/var/log/dvswitch/mmdvm_bridge.log
stderr_logfile=/var/log/dvswitch/mmdvm_bridge.err.log

[program:ysfgateway]
command=/opt/YSFGateway/YSFGateway /opt/bridge/config/YSFGateway.ini
autostart=true
autorestart=true
priority=30
stdout_logfile=/var/log/dvswitch/ysfgateway.log
stderr_logfile=/var/log/dvswitch/ysfgateway.err.log

[program:p25gateway]
command=/opt/P25Gateway/P25Gateway /opt/bridge/config/P25Gateway.ini
autostart=true
autorestart=true
priority=30
stdout_logfile=/var/log/dvswitch/p25gateway.log
stderr_logfile=/var/log/dvswitch/p25gateway.err.log

[program:analog_bridge_ysf]
command=/opt/Analog_Bridge/Analog_Bridge /opt/bridge/config/Analog_Bridge_YSF.ini
autostart=true
autorestart=true
priority=40
stdout_logfile=/var/log/dvswitch/analog_bridge_ysf.log
stderr_logfile=/var/log/dvswitch/analog_bridge_ysf.err.log

[program:analog_bridge_p25]
command=/opt/Analog_Bridge/Analog_Bridge /opt/bridge/config/Analog_Bridge_P25.ini
autostart=true
autorestart=true
priority=40
stdout_logfile=/var/log/dvswitch/analog_bridge_p25.log
stderr_logfile=/var/log/dvswitch/analog_bridge_p25.err.log

[program:bridge_dashboard]
command=/opt/bridge/dashboard/node_modules/.bin/tsx /opt/bridge/dashboard/server.ts
directory=/opt/bridge/dashboard
environment=PORT="${cfg.dashboardPort}",NODE_ENV="production"
autostart=true
autorestart=true
priority=50
stdout_logfile=/var/log/dvswitch/dashboard.log
stderr_logfile=/var/log/dvswitch/dashboard.err.log
`;

  const rptConfSnippet = `; ============================================================================
; REMOTE AllStarLink Server (${cfg.aslHost}) — /etc/asterisk/rpt.conf Stanzas
; AllStarLink runs on your remote server (Node ${cfg.aslNode}) and sends USRP UDP
; packets across the network to this Docker host (${cfg.dockerHostIp}):
;   Remote ASL ${cfg.aslNode} -> Private ${cfg.aslPrivateYsfNode} -> USRP ${cfg.dockerHostIp}:${cfg.ysfUsrpRxPort} (YSF ${cfg.ysfReflectorId})
;   Remote ASL ${cfg.aslNode} -> Private ${cfg.aslPrivateP25Node} -> USRP ${cfg.dockerHostIp}:${cfg.p25UsrpRxPort} (P25 TG${cfg.p25ReflectorId})
; Ensure firewall allows UDP ${cfg.ysfUsrpTxPort}/${cfg.p25UsrpTxPort} on ${cfg.aslHost} and UDP ${cfg.ysfUsrpRxPort}/${cfg.p25UsrpRxPort} on ${cfg.dockerHostIp}.
; ============================================================================

[${cfg.aslNode}](node-main)
; Main public AllStarLink hub node — links both remote USRP digital bridge legs on boot
startup_macro = *73${cfg.aslPrivateYsfNode}*73${cfg.aslPrivateP25Node}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
linktolink = no
nounkeyct = 1
holdofftelem = 1
telemdefault = 0

; Private Bridge Leg A: Remote ASL -> Docker Host ${cfg.dockerHostIp}:${cfg.ysfUsrpRxPort} (YSF ${cfg.ysfReflectorId} / ${cfg.ysfReflectorName})
[${cfg.aslPrivateYsfNode}](node-main)
rxchannel = USRP/${cfg.dockerHostIp}:${cfg.ysfUsrpRxPort}:${cfg.ysfUsrpTxPort}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
holdofftelem = 1
telemdefault = 0
nounkeyct = 1
statpost_program = /usr/bin/wget,-q,--timeout=15,--tries=1,--output-document=/dev/null

; Private Bridge Leg B: Remote ASL -> Docker Host ${cfg.dockerHostIp}:${cfg.p25UsrpRxPort} (P25 TG${cfg.p25ReflectorId})
[${cfg.aslPrivateP25Node}](node-main)
rxchannel = USRP/${cfg.dockerHostIp}:${cfg.p25UsrpRxPort}:${cfg.p25UsrpTxPort}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
holdofftelem = 1
telemdefault = 0
nounkeyct = 1

[nodes]
; Add local routing entries inside [nodes] on your Remote AllStarLink server
${cfg.aslPrivateYsfNode} = radio@127.0.0.1/${cfg.aslPrivateYsfNode},NONE
${cfg.aslPrivateP25Node} = radio@127.0.0.1/${cfg.aslPrivateP25Node},NONE
`;

  const analogBridgeYsf = `; Analog_Bridge_YSF.ini — Remote AllStarLink Node ${cfg.aslNode} (${cfg.aslHost}) <-> YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName})
; Transcodes 8kHz s16le PCM (USRP) <-> AMBE+2 (${cfg.ysfMode})

[GENERAL]
logLevel = 2
subscriberFile = /var/lib/dvswitch/subscriber_ids.csv
exportMetadata = true
transferRootDir = /tmp

[AMBE_AUDIO]
address = 127.0.0.1
txPort = ${cfg.ysfTlvTxPort}
rxPort = ${cfg.ysfTlvRxPort}
ambeMode = ${cfg.ysfMode}
minTxTimeMS = 2500
gatewayDmrId = ${cfg.dmrId}
gatewayCallsign = ${cfg.callsign}
repeaterID = ${cfg.dmrId}01
txTg = ${cfg.ysfReflectorId}
txTs = 2
colorCode = 1

[USRP]
; Remote AllStarLink server IP receiving outbound USRP audio on port ${cfg.ysfUsrpTxPort}
address = ${cfg.aslHost}
txPort = ${cfg.ysfUsrpTxPort}
rxPort = ${cfg.ysfUsrpRxPort}
usrpAudio = ${usrpAudioMode}
usrpGain = ${cfg.usrpGainYsf.toFixed(2)}
usrpAGC = -20,10,100
aslAudio = ${aslAudioMode}
aslAGC = -1000,10,100
aslGain = ${cfg.aslGainYsf.toFixed(2)}
tlvAudio = AUDIO_USE_GAIN
tlvGain = ${cfg.tlvGainYsf.toFixed(2)}

[DV3000]
address = 127.0.0.1
rxPort = ${cfg.md380EmuPort}
${cfg.vocoderEngine === 'ambe-usb' ? `serial = true\nbaud = ${cfg.ambeBaudRate}\ndevice = ${cfg.ambeUsbDevice}` : `; serial = false (using software md380-emu on UDP ${cfg.md380EmuPort})`}
decoderFallBack = ${decoderFallBack}
useEmulator = ${useEmulator}
emulatorAddress = 127.0.0.1:${cfg.md380EmuPort}
`;

  const analogBridgeP25 = `; Analog_Bridge_P25.ini — Remote AllStarLink Node ${cfg.aslNode} (${cfg.aslHost}) <-> P25 Reflector ${cfg.p25ReflectorId}
; Transcodes 8kHz s16le PCM (USRP) <-> IMBE 7200 bps (P25 Phase 1)

[GENERAL]
logLevel = 2
subscriberFile = /var/lib/dvswitch/subscriber_ids.csv
exportMetadata = true
transferRootDir = /tmp

[AMBE_AUDIO]
address = 127.0.0.1
txPort = ${cfg.p25TlvTxPort}
rxPort = ${cfg.p25TlvRxPort}
ambeMode = P25
minTxTimeMS = 2500
gatewayDmrId = ${cfg.dmrId}
gatewayCallsign = ${cfg.callsign}
repeaterID = ${cfg.dmrId}02
txTg = ${cfg.p25ReflectorId}
txTs = 2
colorCode = 1

[USRP]
; Remote AllStarLink server IP receiving outbound USRP audio on port ${cfg.p25UsrpTxPort}
address = ${cfg.aslHost}
txPort = ${cfg.p25UsrpTxPort}
rxPort = ${cfg.p25UsrpRxPort}
usrpAudio = ${usrpAudioMode}
usrpGain = ${cfg.usrpGainP25.toFixed(2)}
usrpAGC = -20,10,100
aslAudio = ${aslAudioMode}
aslAGC = -1000,10,100
aslGain = ${cfg.aslGainP25.toFixed(2)}
tlvAudio = AUDIO_USE_GAIN
tlvGain = ${cfg.tlvGainP25.toFixed(2)}

[DV3000]
; P25 IMBE transcoding uses Analog_Bridge native software IMBE vocoder
decoderFallBack = true
useEmulator = true
emulatorAddress = 127.0.0.1:${cfg.md380EmuPort}
`;

  const mmdvmBridgeIni = `[General]
Callsign=${cfg.callsign}
Id=${cfg.dmrId}
Timeout=${cfg.timeoutTimerSec}
Duplex=0

[Info]
RXFrequency=440000000
TXFrequency=440000000
Power=1
Latitude=0.0
Longitude=0.0
Height=0
Location=${cfg.location}
Description=Remote ASL ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName}) / P25 ${cfg.p25ReflectorId}
URL=https://github.com/${repoSlug}

[Log]
DisplayLevel=1
FileLevel=2
FilePath=/var/log/dvswitch
FileRoot=MMDVM_Bridge

[D-Star]
Enable=0

[DMR]
Enable=0

[System Fusion]
Enable=1

[P25]
Enable=1
NAC=${cfg.p25Nac}

[NXDN]
Enable=0

[System Fusion Network]
Enable=1
LocalAddress=127.0.0.1
LocalPort=3200
GatewayAddress=127.0.0.1
GatewayPort=4200
ModeHang=3
Debug=0

[P25 Network]
Enable=1
GatewayAddress=127.0.0.1
GatewayPort=42020
LocalPort=32010
ModeHang=3
Debug=0
`;

  const dvswitchIni = `; DVSwitch.ini — TLV Audio / Metadata Routing Table for MMDVM_Bridge

[DMR]
address = 127.0.0.1
txPort = 31100
rxPort = 31103

[DSTAR]
address = 127.0.0.1
txPort = 32100
rxPort = 32103

[YSF]
address = 127.0.0.1
txPort = ${cfg.ysfTlvRxPort}
rxPort = ${cfg.ysfTlvTxPort}
fallbackID = ${cfg.dmrId}
exportTG = ${cfg.ysfReflectorId}
slot = 2

[P25]
address = 127.0.0.1
txPort = ${cfg.p25TlvRxPort}
rxPort = ${cfg.p25TlvTxPort}
fallbackID = ${cfg.dmrId}
exportTG = ${cfg.p25ReflectorId}

[NXDN]
address = 127.0.0.1
txPort = 33100
rxPort = 33103
`;

  const ysfGatewayIni = `[General]
Callsign=${cfg.callsign}
Suffix=ND
Id=${cfg.dmrId}
RptAddress=127.0.0.1
RptPort=3200
LocalAddress=127.0.0.1
LocalPort=4200
WiresXMakeUpper=1
Daemon=0

[Info]
RXFrequency=440000000
TXFrequency=440000000
Power=1
Latitude=0.0
Longitude=0.0
Height=0
Name=${cfg.ysfReflectorName}
Description=${cfg.ysfReflectorDescription} ASL ${cfg.aslNode} Bridge

[Log]
DisplayLevel=1
FileLevel=2
FilePath=/var/log/dvswitch
FileRoot=YSFGateway

[Network]
Startup=${cfg.ysfReflectorId}
Options=
InactivityTimeout=0
Revert=1
Debug=0

[YSF Network]
Enable=1
; Local gateway socket uses UDP ${ysfGatewayClientPort} to avoid collision with ysfreflector-with-dashboard on UDP ${cfg.ysfReflectorPort}
Port=${ysfGatewayClientPort}
Hosts=/opt/bridge/config/YSFHosts.txt
ReloadTime=60
ParrotAddress=127.0.0.1
ParrotPort=42012
YSF2DMRAddress=127.0.0.1
YSF2DMRPort=42013
`;

  const p25GatewayIni = `[General]
Callsign=${cfg.callsign}
RptAddress=127.0.0.1
RptPort=32010
LocalPort=42020
Daemon=0

[Id Lookup]
Name=/var/lib/dvswitch/DMRIds.dat
Time=24

[Voice]
Enabled=0
Language=en_US
Directory=/opt/P25Gateway/Audio

[Log]
DisplayLevel=1
FileLevel=2
FilePath=/var/log/dvswitch
FileRoot=P25Gateway

[Network]
Port=42020
HostsFile1=/opt/bridge/config/P25Hosts.txt
HostsFile2=/var/lib/dvswitch/P25HostsLocal.txt
ReloadTime=60
ParrotAddress=127.0.0.1
ParrotPort=42011
Startup=${cfg.p25ReflectorId}
Static=${cfg.p25ReflectorId}
InactivityTimeout=0
Revert=1
Debug=0
`;

  const ysfHosts = `# YSFHosts.txt — Reflector Entry for YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName} / ${cfg.ysfReflectorDescription})
# Format: ReflectorID;Name;Description;Hostname/IP;Port;Count
${cfg.ysfReflectorId};${cfg.ysfReflectorName};${cfg.ysfReflectorDescription};${effectiveYsfHost};${cfg.ysfReflectorPort};001
`;

  const p25Hosts = `# P25Hosts.txt — Reflector Entry for P25 TG${cfg.p25ReflectorId} (corrosive/docker-p25reflector)
# Format: TG/ReflectorID<TAB>Hostname/IP<TAB>UDP_Port
${cfg.p25ReflectorId}\t${effectiveP25Host}\t${cfg.p25ReflectorPort}
`;

  const entrypointSh = `#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] Starting Bridge for Remote AllStarLink Node ${cfg.aslNode} (${cfg.aslHost}) <-> YSF ${cfg.ysfReflectorId}/${cfg.ysfReflectorName} + P25 ${cfg.p25ReflectorId}"

mkdir -p /var/log/dvswitch /var/lib/dvswitch /var/log/supervisor

touch /var/lib/dvswitch/subscriber_ids.csv
touch /var/lib/dvswitch/DMRIds.dat
touch /var/lib/dvswitch/P25HostsLocal.txt

if [ "${cfg.vocoderEngine}" = "ambe-usb" ]; then
  if [ -e "${cfg.ambeUsbDevice}" ]; then
    echo "[entrypoint] Hardware AMBE-3000 device detected at ${cfg.ambeUsbDevice}"
  else
    echo "[entrypoint] WARNING: ${cfg.ambeUsbDevice} not found; check Docker device passthrough."
  fi
else
  echo "[entrypoint] Using md380-emu software AMBE+2 vocoder on UDP 127.0.0.1:${cfg.md380EmuPort} and native P25 IMBE vocoder."
fi

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
`;

  const readme = `# Remote AllStarLink Node ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName}) & P25 ${cfg.p25ReflectorId} Docker Stack

Dockhand / CasaOS / Docker Compose stack for bridging a **Remote AllStarLink Server** (Node \`${cfg.aslNode}\` at \`${cfg.aslHost}\`) to local Dockerized **YSF Reflector ${cfg.ysfReflectorId}** and **P25 Reflector TG${cfg.p25ReflectorId}**.

## Containers Included (No Local AllStarLink Required)

- **\`asl-crossmode-bridge\`** (\`${ghcrImage}\`): Cross-mode audio bridge + Monitoring Dashboard (TCP \`${cfg.dashboardPort}\`, inbound USRP UDP \`${cfg.ysfUsrpRxPort}\` & \`${cfg.p25UsrpRxPort}\`)
- **\`ysfreflector-with-dashboard\`** (\`ghcr.io/neilbartley/ysfreflector-with-dashboard:latest\`): YSF Reflector \`${cfg.ysfReflectorId}\` (\`${cfg.ysfReflectorName}\` / \`${cfg.ysfReflectorDescription}\`, UDP \`${cfg.ysfReflectorPort}\`, Web UI TCP \`${cfg.ysfDashboardPort}\`)
- **\`p25reflector\`** (\`corrosive/docker-p25reflector\`): P25 Reflector \`TG${cfg.p25ReflectorId}\` (UDP \`${cfg.p25ReflectorPort}\`, logs at \`${cfg.p25LogPath}\`)

## Deploying in Dockhand / CasaOS / Portainer

1. Ensure GitHub Actions in \`github.com/${repoSlug}\` has built and published \`${ghcrImage}\` (and set the GHCR package visibility to Public, or log in to GHCR in Dockhand).
2. Paste \`docker-compose.yml\` directly into **Dockhand** and deploy — no local \`Dockerfile\` or \`./config\` directory is needed.
3. On your **Remote AllStarLink Server** (\`${cfg.aslHost}\`), merge \`asterisk/rpt.conf.snippet\` into \`/etc/asterisk/rpt.conf\` pointing USRP to this Docker host (\`${cfg.dockerHostIp}\`) and run:
   \`\`\`bash
   sudo asterisk -rx "rpt reload"
   \`\`\`
4. Dashboards:
   - Bridge Monitoring Dashboard: \`http://${cfg.dockerHostIp}:${cfg.dashboardPort}\`
   - YSF Reflector (${cfg.ysfReflectorName}) Dashboard: \`http://${cfg.dockerHostIp}:${cfg.ysfDashboardPort}\`
`;

  return [
    {
      path: 'docker-compose.yml',
      title: 'docker-compose.yml (Dockhand Ready)',
      category: 'Docker',
      language: 'yaml',
      description: `Pull-only 3-container Compose stack (${ghcrImage} + ysfreflector-with-dashboard + TG${cfg.p25ReflectorId}) ready to paste into Dockhand/CasaOS without a local Dockerfile.`,
      content: dockerCompose,
    },
    {
      path: '.github/workflows/docker-publish.yml',
      title: 'GitHub Actions (GHCR)',
      category: 'Docker',
      language: 'yaml',
      description: `Multi-arch (amd64/arm64) CI workflow publishing ${ghcrImage} from github.com/${repoSlug}.`,
      content: githubWorkflowYml,
    },
    {
      path: 'Dockerfile',
      title: 'Dockerfile',
      category: 'Docker',
      language: 'dockerfile',
      description: 'Multi-stage Node 22 Bookworm image using npm install --legacy-peer-deps to prevent esbuild/vite peer conflicts in GitHub Actions.',
      content: dockerfile,
    },
    {
      path: 'supervisord.conf',
      title: 'supervisord.conf',
      category: 'Docker',
      language: 'ini',
      description: 'Process supervisor managing md380-emu, MMDVM_Bridge, YSFGateway, P25Gateway, dual Analog_Bridge instances, and dashboard.',
      content: supervisordConf,
    },
    {
      path: 'entrypoint.sh',
      title: 'entrypoint.sh',
      category: 'Docker',
      language: 'bash',
      description: 'Container bootstrap script checking vocoder device/emulator availability and initializing subscriber databases.',
      content: entrypointSh,
    },
    {
      path: 'asterisk/rpt.conf.snippet',
      title: `Remote ASL rpt.conf (Node ${cfg.aslNode})`,
      category: 'AllStarLink',
      language: 'ini',
      description: `Stanzas for your Remote AllStarLink Server (${cfg.aslHost}) sending USRP audio to Docker host ${cfg.dockerHostIp}.`,
      content: rptConfSnippet,
    },
    {
      path: 'config/Analog_Bridge_YSF.ini',
      title: 'Analog_Bridge_YSF.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: `PCM <-> AMBE+2 (${cfg.ysfMode}) audio transcoder targeting remote ASL ${cfg.aslHost}:${cfg.ysfUsrpTxPort}.`,
      content: analogBridgeYsf,
    },
    {
      path: 'config/Analog_Bridge_P25.ini',
      title: 'Analog_Bridge_P25.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: `PCM <-> IMBE 7200 bps audio transcoder targeting remote ASL ${cfg.aslHost}:${cfg.p25UsrpTxPort}.`,
      content: analogBridgeP25,
    },
    {
      path: 'config/MMDVM_Bridge.ini',
      title: 'MMDVM_Bridge.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: `Dual-network MMDVM protocol bridge with System Fusion and P25 (NAC ${cfg.p25Nac}) enabled.`,
      content: mmdvmBridgeIni,
    },
    {
      path: 'config/DVSwitch.ini',
      title: 'DVSwitch.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: 'TLV port routing table mapping separate UDP channels for YSF and P25 Analog_Bridge instances.',
      content: dvswitchIni,
    },
    {
      path: 'config/YSFGateway.ini',
      title: 'YSFGateway.ini',
      category: 'Gateways',
      language: 'ini',
      description: `YSF network gateway pinned to Reflector ${cfg.ysfReflectorId} (${cfg.ysfReflectorName}) on client UDP ${ysfGatewayClientPort}.`,
      content: ysfGatewayIni,
    },
    {
      path: 'config/P25Gateway.ini',
      title: 'P25Gateway.ini',
      category: 'Gateways',
      language: 'ini',
      description: `P25 network gateway statically linked to Reflector TG${cfg.p25ReflectorId}.`,
      content: p25GatewayIni,
    },
    {
      path: 'config/YSFHosts.txt',
      title: 'YSFHosts.txt',
      category: 'Gateways',
      language: 'text',
      description: `Host entry pointing YSF ${cfg.ysfReflectorId} (${cfg.ysfReflectorName} / ${cfg.ysfReflectorDescription}) to ${effectiveYsfHost}:${cfg.ysfReflectorPort}.`,
      content: ysfHosts,
    },
    {
      path: 'config/P25Hosts.txt',
      title: 'P25Hosts.txt',
      category: 'Gateways',
      language: 'text',
      description: `Host entry pointing P25 TG${cfg.p25ReflectorId} to ${effectiveP25Host}:${cfg.p25ReflectorPort}.`,
      content: p25Hosts,
    },
    {
      path: 'README.md',
      title: 'README.md',
      category: 'Docker',
      language: 'markdown',
      description: 'Dockhand/CasaOS deployment guide and Remote AllStarLink USRP configuration instructions.',
      content: readme,
    },
  ];
}
