export type NetworkMode = 'ASL' | 'YSF' | 'P25';

export type VocoderEngine = 'md380-emu' | 'ambe-usb';

export type YsfMode = 'YSFN' | 'YSFW';

export interface BridgeConfig {
  callsign: string;
  dmrId: string;
  location: string;
  // AllStarLink Node 20800 + Private USRP bridge nodes
  aslNode: string;
  aslPrivateYsfNode: string;
  aslPrivateP25Node: string;
  aslHost: string;
  // YSF Reflector 95100
  ysfReflectorId: string;
  ysfReflectorName: string;
  ysfReflectorHost: string;
  ysfReflectorPort: number;
  ysfMode: YsfMode;
  ysfUsrpTxPort: number;
  ysfUsrpRxPort: number;
  ysfTlvTxPort: number;
  ysfTlvRxPort: number;
  // P25 Reflector 9510
  p25ReflectorId: string;
  p25ReflectorHost: string;
  p25ReflectorPort: number;
  p25Nac: string;
  p25UsrpTxPort: number;
  p25UsrpRxPort: number;
  p25TlvTxPort: number;
  p25TlvRxPort: number;
  // Cross-Mode Audio & Vocoder
  vocoderEngine: VocoderEngine;
  ambeUsbDevice: string;
  ambeBaudRate: number;
  md380EmuPort: number;
  aslGainYsf: number;
  usrpGainYsf: number;
  tlvGainYsf: number;
  aslGainP25: number;
  usrpGainP25: number;
  tlvGainP25: number;
  useAgc: boolean;
  jitterBufferMs: number;
  timeoutTimerSec: number;
  // Docker Container Settings
  containerName: string;
  networkModeHost: boolean;
  dashboardPort: number;
  timezone: string;
}

export type DaemonState = 'running' | 'stopped' | 'restarting' | 'degraded';

export interface DaemonProcess {
  id: string;
  name: string;
  binary: string;
  role: string;
  leg: 'CORE' | 'ASL' | 'YSF' | 'P25';
  status: DaemonState;
  pid: number | null;
  uptimeSec: number;
  cpuPercent: number;
  memMb: number;
  ports: string;
  configFile: string;
}

export interface ActiveTransmission {
  id: string;
  sourceMode: NetworkMode;
  sourceCallsign: string;
  sourceId: string;
  targetModes: NetworkMode[];
  codecIn: string;
  codecOut: string[];
  startedAt: number;
  durationMs: number;
  maxDurationMs: number;
  packetCount: number;
  packetLossPct: number;
  berPct: number;
}

export interface QsoRecord {
  id: string;
  timestamp: string;
  sourceMode: NetworkMode;
  callsign: string;
  radioId: string;
  targetSummary: string;
  transcodePath: string;
  durationSec: number;
  peakDb: number;
  berPct: number;
  status: 'Completed' | 'Timeout' | 'Partial';
}

export interface AudioLevels {
  aslDb: number;
  ysfDb: number;
  p25Db: number;
  vocoderLatencyMs: number;
  usrpPacketsPerSec: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  service: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface BridgeStatePayload {
  config: BridgeConfig;
  daemons: DaemonProcess[];
  activeTx: ActiveTransmission | null;
  audioLevels: AudioLevels;
  qsoHistory: QsoRecord[];
  logs: LogEntry[];
  metrics: {
    totalRelays24h: number;
    avgLatencyMs: number;
    containerUptimeSec: number;
    linkedLegs: number;
  };
}

export interface GeneratedFile {
  path: string;
  title: string;
  category: 'Docker' | 'AllStarLink' | 'DVSwitch' | 'Gateways';
  language: 'dockerfile' | 'yaml' | 'ini' | 'bash' | 'markdown' | 'text';
  description: string;
  content: string;
}
