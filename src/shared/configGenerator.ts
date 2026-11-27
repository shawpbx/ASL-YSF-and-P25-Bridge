import { BridgeConfig, GeneratedFile } from './bridgeTypes.js';

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  callsign: 'W1AW',
  dmrId: '3100001',
  location: 'US Bridge Hub',
  aslNode: '20800',
  aslPrivateYsfNode: '1998',
  aslPrivateP25Node: '1999',
  aslHost: '127.0.0.1',
  ysfReflectorId: '95100',
  ysfReflectorName: 'US-ASL20800-YSF',
  ysfReflectorHost: 'ysf95100.example.net',
  ysfReflectorPort: 42000,
  ysfMode: 'YSFN',
  ysfUsrpTxPort: 32001,
  ysfUsrpRxPort: 34001,
  ysfTlvTxPort: 31103,
  ysfTlvRxPort: 31100,
  p25ReflectorId: '9510',
  p25ReflectorHost: 'p25-9510.example.net',
  p25ReflectorPort: 41000,
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
  containerName: 'asl20800-crossmode-bridge',
  networkModeHost: true,
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

  const networkBlock = cfg.networkModeHost
    ? `    network_mode: host`
    : `    ports:
      - "${cfg.dashboardPort}:${cfg.dashboardPort}/tcp"
      - "${cfg.ysfUsrpTxPort}:${cfg.ysfUsrpTxPort}/udp"
      - "${cfg.ysfUsrpRxPort}:${cfg.ysfUsrpRxPort}/udp"
      - "${cfg.p25UsrpTxPort}:${cfg.p25UsrpTxPort}/udp"
      - "${cfg.p25UsrpRxPort}:${cfg.p25UsrpRxPort}/udp"
      - "${cfg.ysfReflectorPort}:${cfg.ysfReflectorPort}/udp"
      - "${cfg.p25ReflectorPort}:${cfg.p25ReflectorPort}/udp"`;

  const repoSlug = (cfg.githubRepo || 'shawpbx/ASL-YSF-and-P25-Bridge').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const ghcrImage = `ghcr.io/${repoSlug.toLowerCase()}:latest`;

  const dockerfile = `# AllStarLink Node ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} & P25 ${cfg.p25ReflectorId} Cross-Mode Bridge
FROM debian:bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/${repoSlug}" \\
      org.opencontainers.image.title="ASL ${cfg.aslNode} to YSF ${cfg.ysfReflectorId} and P25 ${cfg.p25ReflectorId} Bridge" \\
      org.opencontainers.image.description="Dockerized AllStarLink Node ${cfg.aslNode} cross-mode bridge for YSF ${cfg.ysfReflectorId} and P25 ${cfg.p25ReflectorId}"

ENV DEBIAN_FRONTEND=noninteractive \\
    TZ=${cfg.timezone}

# Install system prerequisites, supervisor, and Node.js 20 for the monitoring dashboard
RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates \\
    curl \\
    gnupg \\
    supervisor \\
    procps \\
    iproute2 \\
    netcat-openbsd \\
    tzdata \\
    qemu-user-static \\
    && mkdir -p /etc/apt/keyrings \\
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \\
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \\
    && apt-get update && apt-get install -y --no-install-recommends nodejs \\
    && rm -rf /var/lib/apt/lists/*

# Install DVSwitch repository & cross-mode bridge binaries
RUN curl -fsSL http://dvswitch.org/bookworm -o /tmp/bookworm \\
    && chmod +x /tmp/bookworm \\
    && /tmp/bookworm \\
    && apt-get update \\
    && apt-get install -y --no-install-recommends \\
       analog-bridge \\
       mmdvm-bridge \\
       md380-emu \\
       ysfgateway \\
       p25gateway \\
       dvswitch \\
    && rm -rf /var/lib/apt/lists/* /tmp/bookworm

# Create runtime directories for separate YSF and P25 Analog_Bridge instances and logs
RUN mkdir -p /opt/bridge/config /opt/bridge/dashboard /var/log/dvswitch /var/log/supervisor /var/lib/dvswitch

# Copy bridge configurations, supervisor manifest, and entrypoint
COPY config/ /opt/bridge/config/
COPY supervisord.conf /etc/supervisor/conf.d/bridge.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Healthcheck verifies DVSwitch gateways and monitoring dashboard are responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \\
  CMD supervisorctl status | grep -q "RUNNING" && curl -fsS http://127.0.0.1:${cfg.dashboardPort}/api/health || exit 1

EXPOSE ${cfg.dashboardPort}/tcp
EXPOSE ${cfg.ysfUsrpTxPort}/udp ${cfg.ysfUsrpRxPort}/udp
EXPOSE ${cfg.p25UsrpTxPort}/udp ${cfg.p25UsrpRxPort}/udp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
`;

  const dockerCompose = `# Repository: https://github.com/${repoSlug}
services:
  asl-crossmode-bridge:
    image: ${ghcrImage}
    build:
      context: .
      dockerfile: Dockerfile
      # Or build directly from GitHub without cloning:
      # context: https://github.com/${repoSlug}.git#main
    container_name: ${cfg.containerName}
    restart: unless-stopped
${networkBlock}
${ambeUsbBlock}    environment:
      - TZ=${cfg.timezone}
      - ASL_NODE=${cfg.aslNode}
      - YSF_REFLECTOR=${cfg.ysfReflectorId}
      - P25_REFLECTOR=${cfg.p25ReflectorId}
      - BRIDGE_CALLSIGN=${cfg.callsign}
      - BRIDGE_DMR_ID=${cfg.dmrId}
      - PORT=${cfg.dashboardPort}
    volumes:
      - ./config:/opt/bridge/config:ro
      - bridge_logs:/var/log/dvswitch
      - bridge_data:/var/lib/dvswitch
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  bridge_logs:
  bridge_data:
`;

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
command=/usr/bin/node /opt/bridge/dashboard/server.ts
directory=/opt/bridge/dashboard
environment=PORT="${cfg.dashboardPort}",NODE_ENV="production"
autostart=true
autorestart=true
priority=50
stdout_logfile=/var/log/dvswitch/dashboard.log
stderr_logfile=/var/log/dvswitch/dashboard.err.log
`;

  const rptConfSnippet = `; ============================================================================
; AllStarLink /etc/asterisk/rpt.conf — Node ${cfg.aslNode} Cross-Mode Bridge Stanzas
; Star topology prevents audio feedback loops while transcoding full 3-way:
;   ASL Node ${cfg.aslNode} <-> Private USRP ${cfg.aslPrivateYsfNode} (YSF ${cfg.ysfReflectorId})
;   ASL Node ${cfg.aslNode} <-> Private USRP ${cfg.aslPrivateP25Node} (P25 ${cfg.p25ReflectorId})
; ============================================================================

[${cfg.aslNode}](node-main)
; Main public AllStarLink hub node — permanently links both digital bridge legs on boot
startup_macro = *73${cfg.aslPrivateYsfNode}*73${cfg.aslPrivateP25Node}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
linktolink = no
nounkeyct = 1
holdofftelem = 1
telemdefault = 0

; Private Bridge Leg A: USRP -> Analog_Bridge_YSF -> YSF Reflector ${cfg.ysfReflectorId}
[${cfg.aslPrivateYsfNode}](node-main)
rxchannel = USRP/${cfg.aslHost}:${cfg.ysfUsrpRxPort}:${cfg.ysfUsrpTxPort}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
holdofftelem = 1
telemdefault = 0
nounkeyct = 1
statpost_program = /usr/bin/wget,-q,--timeout=15,--tries=1,--output-document=/dev/null

; Private Bridge Leg B: USRP -> Analog_Bridge_P25 -> P25 Reflector ${cfg.p25ReflectorId}
[${cfg.aslPrivateP25Node}](node-main)
rxchannel = USRP/${cfg.aslHost}:${cfg.p25UsrpRxPort}:${cfg.p25UsrpTxPort}
duplex = 0
hangtime = 0
althangtime = 0
totime = ${cfg.timeoutTimerSec * 1000}
holdofftelem = 1
telemdefault = 0
nounkeyct = 1

[nodes]
; Add local routing entries inside [nodes] in /etc/asterisk/rpt.conf
${cfg.aslPrivateYsfNode} = radio@127.0.0.1/${cfg.aslPrivateYsfNode},NONE
${cfg.aslPrivateP25Node} = radio@127.0.0.1/${cfg.aslPrivateP25Node},NONE
`;

  const analogBridgeYsf = `; Analog_Bridge_YSF.ini — AllStarLink Node ${cfg.aslNode} (via ${cfg.aslPrivateYsfNode}) <-> YSF Reflector ${cfg.ysfReflectorId}
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

  const analogBridgeP25 = `; Analog_Bridge_P25.ini — AllStarLink Node ${cfg.aslNode} (via ${cfg.aslPrivateP25Node}) <-> P25 Reflector ${cfg.p25ReflectorId}
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
Description=ASL ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} / P25 ${cfg.p25ReflectorId}
URL=https://allstarlink.org

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
Name=ASL${cfg.aslNode}-YSF${cfg.ysfReflectorId}
Description=AllStarLink ${cfg.aslNode} Cross-Mode Bridge

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
Port=42000
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

  const ysfHosts = `# YSFHosts.txt — Custom Reflector Entry for YSF ${cfg.ysfReflectorId}
# Format: ReflectorID;Name;Description;Hostname/IP;Port;Count
${cfg.ysfReflectorId};${cfg.ysfReflectorName};ASL ${cfg.aslNode} Bridge Reflector;${cfg.ysfReflectorHost};${cfg.ysfReflectorPort};001
`;

  const p25Hosts = `# P25Hosts.txt — Custom Reflector Entry for P25 ${cfg.p25ReflectorId}
# Format: TG/ReflectorID<TAB>Hostname/IP<TAB>UDP_Port
${cfg.p25ReflectorId}\t${cfg.p25ReflectorHost}\t${cfg.p25ReflectorPort}
`;

  const entrypointSh = `#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] Starting AllStarLink Node ${cfg.aslNode} Cross-Mode Bridge (YSF ${cfg.ysfReflectorId} + P25 ${cfg.p25ReflectorId})"

mkdir -p /var/log/dvswitch /var/lib/dvswitch /var/log/supervisor

# Ensure subscriber ID databases exist to avoid startup warnings
touch /var/lib/dvswitch/subscriber_ids.csv
touch /var/lib/dvswitch/DMRIds.dat
touch /var/lib/dvswitch/P25HostsLocal.txt

# Verify vocoder configuration
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

  const readme = `# AllStarLink Node ${cfg.aslNode} <-> YSF ${cfg.ysfReflectorId} & P25 ${cfg.p25ReflectorId} Docker Bridge

Production Docker stack for bridging **AllStarLink Node ${cfg.aslNode}** to **YSF Reflector ${cfg.ysfReflectorId}** and **P25 Reflector ${cfg.p25ReflectorId}** with full cross-mode audio transcoding (8kHz PCM <-> AMBE+2 <-> IMBE 7200 bps) and integrated monitoring dashboard.

## Signal & Audio Architecture

- **Central Audio Mixer**: AllStarLink Node \`${cfg.aslNode}\` (\`app_rpt\`) permanently links private \`chan_usrp\` nodes \`${cfg.aslPrivateYsfNode}\` (YSF leg) and \`${cfg.aslPrivateP25Node}\` (P25 leg) via \`startup_macro = *73${cfg.aslPrivateYsfNode}*73${cfg.aslPrivateP25Node}\`.
- **YSF Leg (${cfg.ysfReflectorId})**: \`chan_usrp\` (UDP \`${cfg.ysfUsrpTxPort}/${cfg.ysfUsrpRxPort}\`) <-> \`Analog_Bridge_YSF\` (${cfg.ysfMode} AMBE+2 via \`${cfg.vocoderEngine}\`) <-> TLV (\`${cfg.ysfTlvTxPort}/${cfg.ysfTlvRxPort}\`) <-> \`MMDVM_Bridge\` <-> \`YSFGateway\` <-> YSF Reflector \`${cfg.ysfReflectorId}\` (\`${cfg.ysfReflectorHost}:${cfg.ysfReflectorPort}\`).
- **P25 Leg (${cfg.p25ReflectorId})**: \`chan_usrp\` (UDP \`${cfg.p25UsrpTxPort}/${cfg.p25UsrpRxPort}\`) <-> \`Analog_Bridge_P25\` (IMBE 7200bps) <-> TLV (\`${cfg.p25TlvTxPort}/${cfg.p25TlvRxPort}\`) <-> \`MMDVM_Bridge\` (NAC \`${cfg.p25Nac}\`) <-> \`P25Gateway\` <-> P25 Reflector \`${cfg.p25ReflectorId}\` (\`${cfg.p25ReflectorHost}:${cfg.p25ReflectorPort}\`).

## Deployment Steps

1. Clone the repository on your AllStarLink Node ${cfg.aslNode} host:
   \`\`\`bash
   git clone https://github.com/${repoSlug}.git
   cd ${repoSlug.split('/').pop() || 'ASL-YSF-and-P25-Bridge'}
   \`\`\`
2. Merge \`asterisk/rpt.conf.snippet\` into \`/etc/asterisk/rpt.conf\` on your AllStarLink Node ${cfg.aslNode} host and run:
   \`\`\`bash
   sudo asterisk -rx "rpt reload"
   \`\`\`
3. Confirm your YSF (\`${cfg.ysfReflectorHost}:${cfg.ysfReflectorPort}\`) and P25 (\`${cfg.p25ReflectorHost}:${cfg.p25ReflectorPort}\`) reflector hostnames in \`config/YSFHosts.txt\` and \`config/P25Hosts.txt\`.
4. Pull from GHCR (\`${ghcrImage}\`) or build locally and start the container:
   \`\`\`bash
   docker compose up -d --build
   \`\`\`
5. Verify all daemons are running:
   \`\`\`bash
   docker exec ${cfg.containerName} supervisorctl status
   \`\`\`
6. Open the monitoring dashboard at \`http://<host-ip>:${cfg.dashboardPort}\`.
`;

  return [
    {
      path: 'docker-compose.yml',
      title: 'docker-compose.yml',
      category: 'Docker',
      language: 'yaml',
      description: `Compose stack linked to ${ghcrImage} with host networking or explicit UDP USRP/reflector port mappings.`,
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
      description: 'Debian Bookworm container bundling DVSwitch, md380-emu, YSFGateway, P25Gateway, supervisor, and dashboard.',
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
      title: 'rpt.conf (Node 20800)',
      category: 'AllStarLink',
      language: 'ini',
      description: `AllStarLink Node ${cfg.aslNode} star-hub stanzas linking private USRP bridge nodes ${cfg.aslPrivateYsfNode} (YSF) and ${cfg.aslPrivateP25Node} (P25).`,
      content: rptConfSnippet,
    },
    {
      path: 'config/Analog_Bridge_YSF.ini',
      title: 'Analog_Bridge_YSF.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: `PCM <-> AMBE+2 (${cfg.ysfMode}) audio transcoder for YSF Reflector ${cfg.ysfReflectorId}.`,
      content: analogBridgeYsf,
    },
    {
      path: 'config/Analog_Bridge_P25.ini',
      title: 'Analog_Bridge_P25.ini',
      category: 'DVSwitch',
      language: 'ini',
      description: `PCM <-> IMBE 7200 bps audio transcoder for P25 Reflector ${cfg.p25ReflectorId}.`,
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
      description: `YSF network gateway pinned to Reflector ${cfg.ysfReflectorId} with zero inactivity timeout.`,
      content: ysfGatewayIni,
    },
    {
      path: 'config/P25Gateway.ini',
      title: 'P25Gateway.ini',
      category: 'Gateways',
      language: 'ini',
      description: `P25 network gateway statically linked to Reflector ${cfg.p25ReflectorId}.`,
      content: p25GatewayIni,
    },
    {
      path: 'config/YSFHosts.txt',
      title: 'YSFHosts.txt',
      category: 'Gateways',
      language: 'text',
      description: `Host mapping entry resolving YSF Reflector ${cfg.ysfReflectorId}.`,
      content: ysfHosts,
    },
    {
      path: 'config/P25Hosts.txt',
      title: 'P25Hosts.txt',
      category: 'Gateways',
      language: 'text',
      description: `Host mapping entry resolving P25 Reflector ${cfg.p25ReflectorId}.`,
      content: p25Hosts,
    },
    {
      path: 'README.md',
      title: 'README.md',
      category: 'Docker',
      language: 'markdown',
      description: 'Deployment instructions and port reference for host AllStarLink integration.',
      content: readme,
    },
  ];
}
