import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import {
  ActiveTransmission,
  AudioLevels,
  BridgeConfig,
  BridgeStatePayload,
  DaemonProcess,
  LogEntry,
  NetworkMode,
  QsoRecord,
} from './src/shared/bridgeTypes.js';
import { DEFAULT_BRIDGE_CONFIG, generateAllBridgeFiles } from './src/shared/configGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Runtime state of the Dockerized cross-mode bridge controller
let config: BridgeConfig = { ...DEFAULT_BRIDGE_CONFIG };
const bootTimeMs = Date.now() - 1000 * (3 * 86400 + 14 * 3600 + 22 * 60 + 18); // 3d 14h 22m
let totalRelays24h = 148;

let daemons: DaemonProcess[] = [
  {
    id: 'asterisk-usrp',
    name: 'Asterisk app_rpt (USRP)',
    binary: '/usr/sbin/asterisk',
    role: 'AllStarLink Node 20800 PCM mixer & USRP channels 1998/1999',
    leg: 'ASL',
    status: 'running',
    pid: 1042,
    uptimeSec: 310938,
    cpuPercent: 1.4,
    memMb: 46.2,
    ports: 'UDP 32001/34001, 32002/34002',
    configFile: 'asterisk/rpt.conf.snippet',
  },
  {
    id: 'md380-emu',
    name: 'md380-emu Vocoder',
    binary: '/usr/bin/md380-emu',
    role: 'Software AMBE+2 2450bps transcoder daemon for YSF',
    leg: 'CORE',
    status: 'running',
    pid: 1108,
    uptimeSec: 310935,
    cpuPercent: 2.8,
    memMb: 18.4,
    ports: 'UDP 127.0.0.1:2470',
    configFile: 'supervisord.conf',
  },
  {
    id: 'analog_bridge_ysf',
    name: 'Analog_Bridge (YSF)',
    binary: '/opt/Analog_Bridge/Analog_Bridge',
    role: '8kHz PCM <-> AMBE+2 (YSFN) audio transcoder for YSF 95100',
    leg: 'YSF',
    status: 'running',
    pid: 1145,
    uptimeSec: 310930,
    cpuPercent: 1.9,
    memMb: 14.8,
    ports: 'USRP 32001/34001 · TLV 31103/31100',
    configFile: 'config/Analog_Bridge_YSF.ini',
  },
  {
    id: 'analog_bridge_p25',
    name: 'Analog_Bridge (P25)',
    binary: '/opt/Analog_Bridge/Analog_Bridge',
    role: '8kHz PCM <-> IMBE 7200bps audio transcoder for P25 9510',
    leg: 'P25',
    status: 'running',
    pid: 1152,
    uptimeSec: 310930,
    cpuPercent: 2.1,
    memMb: 16.1,
    ports: 'USRP 32002/34002 · TLV 34103/34100',
    configFile: 'config/Analog_Bridge_P25.ini',
  },
  {
    id: 'mmdvm_bridge',
    name: 'MMDVM_Bridge',
    binary: '/opt/MMDVM_Bridge/MMDVM_Bridge',
    role: 'Multi-mode digital voice protocol router (YSF + P25 NAC 293)',
    leg: 'CORE',
    status: 'running',
    pid: 1126,
    uptimeSec: 310933,
    cpuPercent: 1.1,
    memMb: 12.6,
    ports: 'UDP 3200/4200, 32010/42020',
    configFile: 'config/MMDVM_Bridge.ini',
  },
  {
    id: 'ysfgateway',
    name: 'YSFGateway',
    binary: '/opt/YSFGateway/YSFGateway',
    role: 'Yaesu System Fusion reflector link pinned to YSF 95100',
    leg: 'YSF',
    status: 'running',
    pid: 1134,
    uptimeSec: 310932,
    cpuPercent: 0.6,
    memMb: 9.2,
    ports: 'UDP 4200 -> 42000',
    configFile: 'config/YSFGateway.ini',
  },
  {
    id: 'p25gateway',
    name: 'P25Gateway',
    binary: '/opt/P25Gateway/P25Gateway',
    role: 'APCO Project 25 reflector link statically pinned to P25 9510',
    leg: 'P25',
    status: 'running',
    pid: 1139,
    uptimeSec: 310932,
    cpuPercent: 0.5,
    memMb: 8.8,
    ports: 'UDP 42020 -> 41000',
    configFile: 'config/P25Gateway.ini',
  },
  {
    id: 'ysfreflector-with-dashboard',
    name: 'YSFReflector Container (IEARG)',
    binary: 'ghcr.io/neilbartley/ysfreflector-with-dashboard:latest',
    role: 'YSF Reflector 95100 (IEARG / KE6UPI) + Web Dashboard on port 42080',
    leg: 'YSF',
    status: 'running',
    pid: 2041,
    uptimeSec: 310940,
    cpuPercent: 0.8,
    memMb: 32.4,
    ports: 'UDP 42000 · TCP 42080->80',
    configFile: 'docker-compose.yml',
  },
  {
    id: 'tg9510',
    name: 'P25Reflector Container (TG9510)',
    binary: 'corrosive/docker-p25reflector',
    role: 'P25 Reflector TG9510 container with /var/log/P25Reflector volume',
    leg: 'P25',
    status: 'running',
    pid: 2058,
    uptimeSec: 310940,
    cpuPercent: 0.4,
    memMb: 14.2,
    ports: 'UDP 41000->41000',
    configFile: 'docker-compose.yml',
  },
];

let activeTx: ActiveTransmission | null = null;
let audioLevels: AudioLevels = {
  aslDb: -60,
  ysfDb: -60,
  p25Db: -60,
  vocoderLatencyMs: 24.6,
  usrpPacketsPerSec: 0,
};

const now = Date.now();
function formatIsoTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

let qsoHistory: QsoRecord[] = [
  {
    id: 'qso-101',
    timestamp: formatIsoTime(now - 1000 * 145),
    sourceMode: 'ASL',
    callsign: 'K2NVO',
    radioId: 'Node 54210 -> 20800',
    targetSummary: 'YSF 95100 · P25 9510',
    transcodePath: 'PCM 8kHz -> AMBE+2 & IMBE',
    durationSec: 28.4,
    peakDb: -4.2,
    berPct: 0.0,
    status: 'Completed',
  },
  {
    id: 'qso-102',
    timestamp: formatIsoTime(now - 1000 * 412),
    sourceMode: 'YSF',
    callsign: 'N7TRK',
    radioId: '3148221',
    targetSummary: 'ASL 20800 · P25 9510',
    transcodePath: 'AMBE+2 (DN) -> PCM -> IMBE',
    durationSec: 19.7,
    peakDb: -5.8,
    berPct: 0.4,
    status: 'Completed',
  },
  {
    id: 'qso-103',
    timestamp: formatIsoTime(now - 1000 * 980),
    sourceMode: 'P25',
    callsign: 'W9P25',
    radioId: '3117402',
    targetSummary: 'ASL 20800 · YSF 95100',
    transcodePath: 'IMBE 7200 -> PCM -> AMBE+2',
    durationSec: 41.2,
    peakDb: -3.6,
    berPct: 0.2,
    status: 'Completed',
  },
  {
    id: 'qso-104',
    timestamp: formatIsoTime(now - 1000 * 1640),
    sourceMode: 'ASL',
    callsign: 'KD8MQR',
    radioId: 'Node 20800 Local',
    targetSummary: 'YSF 95100 · P25 9510',
    transcodePath: 'PCM 8kHz -> AMBE+2 & IMBE',
    durationSec: 12.1,
    peakDb: -6.1,
    berPct: 0.0,
    status: 'Completed',
  },
  {
    id: 'qso-105',
    timestamp: formatIsoTime(now - 1000 * 2710),
    sourceMode: 'YSF',
    callsign: 'VE3BXR',
    radioId: '3024119',
    targetSummary: 'ASL 20800 · P25 9510',
    transcodePath: 'AMBE+2 (DN) -> PCM -> IMBE',
    durationSec: 34.8,
    peakDb: -4.9,
    berPct: 0.7,
    status: 'Completed',
  },
  {
    id: 'qso-106',
    timestamp: formatIsoTime(now - 1000 * 3920),
    sourceMode: 'P25',
    callsign: 'AA4JX',
    radioId: '3112980',
    targetSummary: 'ASL 20800 · YSF 95100',
    transcodePath: 'IMBE 7200 -> PCM -> AMBE+2',
    durationSec: 16.5,
    peakDb: -5.2,
    berPct: 0.3,
    status: 'Completed',
  },
];

let logs: LogEntry[] = [
  {
    id: 'log-1',
    timestamp: formatIsoTime(now - 1000 * 300),
    service: 'supervisord',
    level: 'INFO',
    message: `Container ${config.containerName} initialized (7 managed bridge processes)`,
  },
  {
    id: 'log-2',
    timestamp: formatIsoTime(now - 1000 * 295),
    service: 'ysfgateway',
    level: 'INFO',
    message: `Linked to YSF Reflector ${config.ysfReflectorId} (${config.ysfReflectorHost}:${config.ysfReflectorPort}) · InactivityTimeout=0`,
  },
  {
    id: 'log-3',
    timestamp: formatIsoTime(now - 1000 * 294),
    service: 'p25gateway',
    level: 'INFO',
    message: `Statically linked to P25 Reflector ${config.p25ReflectorId} (${config.p25ReflectorHost}:${config.p25ReflectorPort}) · NAC=${config.p25Nac}`,
  },
  {
    id: 'log-4',
    timestamp: formatIsoTime(now - 1000 * 292),
    service: 'analog_bridge_ysf',
    level: 'INFO',
    message: `USRP ${config.aslHost}:${config.ysfUsrpTxPort}/${config.ysfUsrpRxPort} <-> TLV ${config.ysfTlvTxPort}/${config.ysfTlvRxPort} (${config.ysfMode})`,
  },
  {
    id: 'log-5',
    timestamp: formatIsoTime(now - 1000 * 291),
    service: 'analog_bridge_p25',
    level: 'INFO',
    message: `USRP ${config.aslHost}:${config.p25UsrpTxPort}/${config.p25UsrpRxPort} <-> TLV ${config.p25TlvTxPort}/${config.p25TlvRxPort} (IMBE 7200)`,
  },
  {
    id: 'log-6',
    timestamp: formatIsoTime(now - 1000 * 145),
    service: 'mmdvm_bridge',
    level: 'INFO',
    message: `Relayed ASL Node ${config.aslNode} transmission from K2NVO -> YSF ${config.ysfReflectorId} & P25 ${config.p25ReflectorId} (28.4s)`,
  },
];

function appendLog(service: string, level: LogEntry['level'], message: string): void {
  const entry: LogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: formatIsoTime(Date.now()),
    service,
    level,
    message,
  };
  logs = [entry, ...logs].slice(0, 120);
}

function isDaemonRunning(id: string): boolean {
  const d = daemons.find((item) => item.id === id);
  return d?.status === 'running';
}

function getActiveLegHealth(): { asl: boolean; ysf: boolean; p25: boolean } {
  const coreOk = isDaemonRunning('mmdvm_bridge');
  const aslOk = isDaemonRunning('asterisk-usrp');
  const vocoderOk = config.vocoderEngine === 'ambe-usb' || isDaemonRunning('md380-emu');
  const ysfContainerOk = !config.includeReflectorContainers || isDaemonRunning('ysfreflector-with-dashboard');
  const p25ContainerOk = !config.includeReflectorContainers || isDaemonRunning('tg9510');
  const ysfOk =
    coreOk && vocoderOk && ysfContainerOk && isDaemonRunning('analog_bridge_ysf') && isDaemonRunning('ysfgateway');
  const p25Ok = coreOk && p25ContainerOk && isDaemonRunning('analog_bridge_p25') && isDaemonRunning('p25gateway');
  return { asl: aslOk, ysf: ysfOk, p25: p25Ok };
}

function buildStatePayload(): BridgeStatePayload {
  const legHealth = getActiveLegHealth();
  const linkedLegs = [legHealth.asl, legHealth.ysf, legHealth.p25].filter(Boolean).length;
  return {
    config,
    daemons,
    activeTx,
    audioLevels,
    qsoHistory,
    logs,
    metrics: {
      totalRelays24h,
      avgLatencyMs: Number(audioLevels.vocoderLatencyMs.toFixed(1)),
      containerUptimeSec: Math.floor((Date.now() - bootTimeMs) / 1000),
      linkedLegs,
    },
  };
}

// SSE client registry
const sseClients = new Set<Response>();

function broadcastState(): void {
  if (sseClients.size === 0) return;
  const data = `data: ${JSON.stringify(buildStatePayload())}\n\n`;
  for (const res of sseClients) {
    res.write(data);
  }
}

function finalizeActiveTx(status: QsoRecord['status'] = 'Completed'): void {
  if (!activeTx) return;
  const tx = activeTx;
  const durationSec = Math.max(0.5, Number(((Date.now() - tx.startedAt) / 1000).toFixed(1)));
  const targets = tx.targetModes
    .map((m) =>
      m === 'ASL'
        ? `ASL ${config.aslNode}`
        : m === 'YSF'
        ? `YSF ${config.ysfReflectorId}`
        : `P25 ${config.p25ReflectorId}`,
    )
    .join(' · ');

  const record: QsoRecord = {
    id: `qso-${Date.now()}`,
    timestamp: formatIsoTime(Date.now()),
    sourceMode: tx.sourceMode,
    callsign: tx.sourceCallsign,
    radioId: tx.sourceId,
    targetSummary: targets || 'No active target leg',
    transcodePath: `${tx.codecIn} -> ${tx.codecOut.join(' & ') || 'None'}`,
    durationSec,
    peakDb: Number((-3.2 - Math.random() * 4.5).toFixed(1)),
    berPct: Number(tx.berPct.toFixed(1)),
    status: tx.targetModes.length === 0 ? 'Partial' : status,
  };

  qsoHistory = [record, ...qsoHistory].slice(0, 50);
  totalRelays24h += 1;
  appendLog(
    'mmdvm_bridge',
    'INFO',
    `End of transmission from ${tx.sourceCallsign} (${tx.sourceMode}) · ${durationSec}s · ${tx.packetCount} frames relayed`,
  );

  activeTx = null;
  audioLevels = {
    aslDb: -60,
    ysfDb: -60,
    p25Db: -60,
    vocoderLatencyMs: config.vocoderEngine === 'ambe-usb' ? 16.4 : 24.6,
    usrpPacketsPerSec: 0,
  };
  broadcastState();
}

// Real-time telemetry tick (250ms) when transmitting, and uptime increment every second
let tickCount = 0;
setInterval(() => {
  tickCount += 1;

  if (tickCount % 4 === 0) {
    daemons = daemons.map((d) =>
      d.status === 'running'
        ? {
            ...d,
            uptimeSec: d.uptimeSec + 1,
            cpuPercent: Number(
              Math.max(
                0.2,
                (activeTx ? d.cpuPercent * 0.6 + (2.5 + Math.random() * 2.5) * 0.4 : d.cpuPercent * 0.85 + (0.4 + Math.random() * 1.4) * 0.15),
              ).toFixed(1),
            ),
          }
        : d,
    );
  }

  if (activeTx) {
    const elapsed = Date.now() - activeTx.startedAt;
    activeTx = {
      ...activeTx,
      durationMs: elapsed,
      packetCount: Math.floor(elapsed / 20), // 20ms USRP / AMBE / IMBE audio frames (50 fps)
      berPct: activeTx.sourceMode === 'ASL' ? 0.0 : Number((0.15 + Math.random() * 0.45).toFixed(2)),
    };

    const legHealth = getActiveLegHealth();
    const baseSpeech = -14 + Math.sin(Date.now() / 160) * 6 + (Math.random() * 4 - 2);
    const ysfGainOffset = (config.usrpGainYsf - 0.35) * 14;
    const p25GainOffset = (config.usrpGainP25 - 0.35) * 14;
    const aslGainOffset = (config.aslGainYsf - 0.35) * 12;

    audioLevels = {
      aslDb: legHealth.asl ? Math.min(-0.5, Math.max(-48, Number((baseSpeech + aslGainOffset).toFixed(1)))) : -60,
      ysfDb: legHealth.ysf ? Math.min(-0.5, Math.max(-48, Number((baseSpeech + ysfGainOffset - 1.2).toFixed(1)))) : -60,
      p25Db: legHealth.p25 ? Math.min(-0.5, Math.max(-48, Number((baseSpeech + p25GainOffset - 0.8).toFixed(1)))) : -60,
      vocoderLatencyMs: Number(
        ((config.vocoderEngine === 'ambe-usb' ? 15.8 : 23.4) + config.jitterBufferMs * 0.12 + Math.random() * 1.8).toFixed(1),
      ),
      usrpPacketsPerSec: 50,
    };

    if (elapsed >= activeTx.maxDurationMs) {
      finalizeActiveTx('Completed');
      return;
    }

    broadcastState();
  } else if (tickCount % 4 === 0) {
    // Heartbeat update once per second when idle
    broadcastState();
  }
}, 250);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', aslNode: config.aslNode, ysfReflector: config.ysfReflectorId, p25Reflector: config.p25ReflectorId });
  });

  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(buildStatePayload());
  });

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify(buildStatePayload())}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.put('/api/config', (req: Request, res: Response) => {
    const incoming = req.body as Partial<BridgeConfig>;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Invalid configuration payload' });
      return;
    }

    const sanitizedCallsign =
      typeof incoming.callsign === 'string' && incoming.callsign.trim().length > 0
        ? incoming.callsign.trim().toUpperCase().slice(0, 10)
        : config.callsign;

    config = {
      ...config,
      ...incoming,
      callsign: sanitizedCallsign,
      ysfReflectorPort: Number(incoming.ysfReflectorPort ?? config.ysfReflectorPort) || 42000,
      p25ReflectorPort: Number(incoming.p25ReflectorPort ?? config.p25ReflectorPort) || 41000,
      ysfUsrpTxPort: Number(incoming.ysfUsrpTxPort ?? config.ysfUsrpTxPort) || 32001,
      ysfUsrpRxPort: Number(incoming.ysfUsrpRxPort ?? config.ysfUsrpRxPort) || 34001,
      p25UsrpTxPort: Number(incoming.p25UsrpTxPort ?? config.p25UsrpTxPort) || 32002,
      p25UsrpRxPort: Number(incoming.p25UsrpRxPort ?? config.p25UsrpRxPort) || 34002,
      aslGainYsf: Math.min(1.5, Math.max(0.05, Number(incoming.aslGainYsf ?? config.aslGainYsf))),
      usrpGainYsf: Math.min(1.5, Math.max(0.05, Number(incoming.usrpGainYsf ?? config.usrpGainYsf))),
      tlvGainYsf: Math.min(1.5, Math.max(0.05, Number(incoming.tlvGainYsf ?? config.tlvGainYsf))),
      aslGainP25: Math.min(1.5, Math.max(0.05, Number(incoming.aslGainP25 ?? config.aslGainP25))),
      usrpGainP25: Math.min(1.5, Math.max(0.05, Number(incoming.usrpGainP25 ?? config.usrpGainP25))),
      tlvGainP25: Math.min(1.5, Math.max(0.05, Number(incoming.tlvGainP25 ?? config.tlvGainP25))),
      jitterBufferMs: Math.min(160, Math.max(20, Number(incoming.jitterBufferMs ?? config.jitterBufferMs))),
      timeoutTimerSec: Math.min(600, Math.max(30, Number(incoming.timeoutTimerSec ?? config.timeoutTimerSec))),
    };

    // Keep daemon port metadata synchronized with live config
    daemons = daemons.map((d) => {
      if (d.id === 'asterisk-usrp') {
        return {
          ...d,
          role: `AllStarLink Node ${config.aslNode} PCM mixer & USRP channels ${config.aslPrivateYsfNode}/${config.aslPrivateP25Node}`,
          ports: `UDP ${config.ysfUsrpTxPort}/${config.ysfUsrpRxPort}, ${config.p25UsrpTxPort}/${config.p25UsrpRxPort}`,
        };
      }
      if (d.id === 'md380-emu') {
        return {
          ...d,
          status: config.vocoderEngine === 'md380-emu' ? (d.status === 'stopped' ? 'running' : d.status) : 'stopped',
          ports: `UDP 127.0.0.1:${config.md380EmuPort}`,
        };
      }
      if (d.id === 'analog_bridge_ysf') {
        return {
          ...d,
          role: `8kHz PCM <-> AMBE+2 (${config.ysfMode}) audio transcoder for YSF ${config.ysfReflectorId}`,
          ports: `USRP ${config.ysfUsrpTxPort}/${config.ysfUsrpRxPort} · TLV ${config.ysfTlvTxPort}/${config.ysfTlvRxPort}`,
        };
      }
      if (d.id === 'analog_bridge_p25') {
        return {
          ...d,
          role: `8kHz PCM <-> IMBE 7200bps audio transcoder for P25 ${config.p25ReflectorId}`,
          ports: `USRP ${config.p25UsrpTxPort}/${config.p25UsrpRxPort} · TLV ${config.p25TlvTxPort}/${config.p25TlvRxPort}`,
        };
      }
      if (d.id === 'mmdvm_bridge') {
        return {
          ...d,
          role: `Multi-mode digital voice protocol router (YSF + P25 NAC ${config.p25Nac})`,
        };
      }
      if (d.id === 'ysfgateway') {
        return {
          ...d,
          role: `Yaesu System Fusion reflector link pinned to YSF ${config.ysfReflectorId}`,
          ports: `UDP 4200 -> ${config.ysfReflectorPort}`,
        };
      }
      if (d.id === 'p25gateway') {
        return {
          ...d,
          role: `APCO Project 25 reflector link statically pinned to P25 ${config.p25ReflectorId}`,
          ports: `UDP 42020 -> ${config.p25ReflectorPort}`,
        };
      }
      if (d.id === 'ysfreflector-with-dashboard') {
        return {
          ...d,
          name: `YSFReflector Container (${config.ysfReflectorName})`,
          role: `YSF Reflector ${config.ysfReflectorId} (${config.ysfReflectorName} / ${config.ysfReflectorDescription}) + Web Dashboard on port ${config.ysfDashboardPort}`,
          ports: `UDP ${config.ysfReflectorPort} · TCP ${config.ysfDashboardPort}->80`,
        };
      }
      if (d.id === 'tg9510') {
        return {
          ...d,
          name: `P25Reflector Container (TG${config.p25ReflectorId})`,
          role: `P25 Reflector TG${config.p25ReflectorId} container with ${config.p25LogPath} volume`,
          ports: `UDP ${config.p25ReflectorPort}->41000`,
        };
      }
      return d;
    });

    appendLog(
      'bridge_controller',
      'INFO',
      `Applied configuration: ASL ${config.aslNode} <-> YSF ${config.ysfReflectorId} (${config.ysfMode}) & P25 ${config.p25ReflectorId} (NAC ${config.p25Nac}) · Vocoder=${config.vocoderEngine}`,
    );
    broadcastState();
    res.json(buildStatePayload());
  });

  app.post('/api/daemons/:id/:action', (req: Request, res: Response) => {
    const { id, action } = req.params;
    const target = daemons.find((d) => d.id === id);
    if (!target) {
      res.status(404).json({ error: `Unknown daemon: ${id}` });
      return;
    }
    if (!['start', 'stop', 'restart'].includes(action)) {
      res.status(400).json({ error: `Unsupported action: ${action}` });
      return;
    }

    if (action === 'stop') {
      daemons = daemons.map((d) =>
        d.id === id ? { ...d, status: 'stopped', pid: null, uptimeSec: 0, cpuPercent: 0 } : d,
      );
      appendLog('supervisord', 'WARN', `Stopped process ${id}`);
    } else if (action === 'start') {
      daemons = daemons.map((d) =>
        d.id === id
          ? {
              ...d,
              status: 'running',
              pid: Math.floor(1400 + Math.random() * 8000),
              uptimeSec: 1,
              cpuPercent: 1.2,
            }
          : d,
      );
      appendLog('supervisord', 'INFO', `Started process ${id}`);
    } else if (action === 'restart') {
      daemons = daemons.map((d) =>
        d.id === id
          ? {
              ...d,
              status: 'running',
              pid: Math.floor(1400 + Math.random() * 8000),
              uptimeSec: 1,
              cpuPercent: 1.8,
            }
          : d,
      );
      appendLog('supervisord', 'INFO', `Restarted process ${id} with updated configuration`);
    }

    broadcastState();
    res.json(buildStatePayload());
  });

  app.post('/api/ptt/test', (req: Request, res: Response) => {
    const { sourceMode, callsign, durationSec } = req.body as {
      sourceMode?: NetworkMode;
      callsign?: string;
      durationSec?: number;
    };

    const mode: NetworkMode = sourceMode === 'YSF' || sourceMode === 'P25' ? sourceMode : 'ASL';
    const cleanCall = (callsign || config.callsign || 'W1AW').trim().toUpperCase().slice(0, 10);
    const durMs = Math.min(20000, Math.max(2000, (Number(durationSec) || 6) * 1000));

    const legHealth = getActiveLegHealth();
    if (
      (mode === 'ASL' && !legHealth.asl) ||
      (mode === 'YSF' && !legHealth.ysf) ||
      (mode === 'P25' && !legHealth.p25)
    ) {
      appendLog(
        'bridge_controller',
        'ERROR',
        `PTT test rejected: source leg ${mode} has stopped daemons. Start required processes first.`,
      );
      broadcastState();
      res.status(409).json({
        error: `Source leg ${mode} is currently offline. Start its required daemons in Docker Stack first.`,
      });
      return;
    }

    if (activeTx) {
      finalizeActiveTx('Completed');
    }

    const targetModes: NetworkMode[] = [];
    if (mode !== 'ASL' && legHealth.asl) targetModes.push('ASL');
    if (mode !== 'YSF' && legHealth.ysf && legHealth.asl) targetModes.push('YSF');
    if (mode !== 'P25' && legHealth.p25 && legHealth.asl) targetModes.push('P25');

    const codecIn =
      mode === 'ASL' ? 'PCM 8kHz (USRP)' : mode === 'YSF' ? `AMBE+2 (${config.ysfMode})` : 'IMBE 7200 bps';
    const codecOut = targetModes.map((m) =>
      m === 'ASL' ? 'PCM 8kHz' : m === 'YSF' ? `AMBE+2 (${config.ysfMode})` : 'IMBE 7200',
    );

    const sourceId =
      mode === 'ASL'
        ? `Node ${config.aslNode}`
        : mode === 'YSF'
        ? `YSF ${config.ysfReflectorId} / ${config.dmrId}`
        : `P25 ${config.p25ReflectorId} / ${config.dmrId}`;

    activeTx = {
      id: `tx-${Date.now()}`,
      sourceMode: mode,
      sourceCallsign: cleanCall,
      sourceId,
      targetModes,
      codecIn,
      codecOut,
      startedAt: Date.now(),
      durationMs: 0,
      maxDurationMs: durMs,
      packetCount: 0,
      packetLossPct: 0,
      berPct: mode === 'ASL' ? 0 : 0.25,
    };

    appendLog(
      mode === 'ASL' ? 'asterisk-usrp' : mode === 'YSF' ? 'ysfgateway' : 'p25gateway',
      'INFO',
      `Key-up detected from ${cleanCall} on ${sourceId} -> transcoding ${codecIn} to ${codecOut.join(' & ') || 'no active targets'}`,
    );

    broadcastState();
    res.json(buildStatePayload());
  });

  app.post('/api/ptt/stop', (_req: Request, res: Response) => {
    finalizeActiveTx('Completed');
    res.json(buildStatePayload());
  });

  app.post('/api/logs/clear', (_req: Request, res: Response) => {
    logs = [];
    appendLog('bridge_controller', 'INFO', 'Log buffer cleared by operator');
    broadcastState();
    res.json(buildStatePayload());
  });

  app.get('/api/export/bundle', async (_req: Request, res: Response) => {
    try {
      const files = generateAllBridgeFiles(config);
      const zip = new JSZip();
      const rootFolder = zip.folder(config.containerName || 'asl20800-crossmode-bridge');
      if (rootFolder) {
        for (const file of files) {
          rootFolder.file(file.path, file.content);
        }
      }
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const filename = `${config.containerName || 'asl20800-bridge'}-docker.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate Docker deployment bundle' });
    }
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ASL ${config.aslNode} Cross-Mode Bridge dashboard listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start bridge server:', err);
  process.exit(1);
});
