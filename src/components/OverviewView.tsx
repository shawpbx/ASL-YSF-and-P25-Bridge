import React, { useMemo, useState } from 'react';
import { Play, Square, Search, ArrowRightLeft } from 'lucide-react';
import { BridgeStatePayload, NetworkMode } from '../shared/bridgeTypes';

interface OverviewViewProps {
  state: BridgeStatePayload;
  onStartPtt: (sourceMode: NetworkMode, callsign: string, durationSec: number) => Promise<void>;
  onStopPtt: () => Promise<void>;
  pttError: string | null;
}

function formatDuration(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m ${sec % 60}s`;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  state,
  onStartPtt,
  onStopPtt,
  pttError,
}) => {
  const { config, daemons, activeTx, audioLevels, qsoHistory, metrics } = state;

  const [testSource, setTestSource] = useState<NetworkMode>('ASL');
  const [testCallsign, setTestCallsign] = useState<string>(config.callsign || 'W1AW');
  const [testDuration, setTestDuration] = useState<number>(6);
  const [submittingPtt, setSubmittingPtt] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'ALL' | NetworkMode>('ALL');

  const isRunning = (id: string) => daemons.find((d) => d.id === id)?.status === 'running';
  const aslReady = isRunning('asterisk-usrp');
  const mmdvmReady = isRunning('mmdvm_bridge');
  const vocoderReady = config.vocoderEngine === 'ambe-usb' || isRunning('md380-emu');
  const ysfReady = mmdvmReady && vocoderReady && isRunning('analog_bridge_ysf') && isRunning('ysfgateway');
  const p25Ready = mmdvmReady && isRunning('analog_bridge_p25') && isRunning('p25gateway');

  const filteredQsos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return qsoHistory.filter((row) => {
      if (modeFilter !== 'ALL' && row.sourceMode !== modeFilter) return false;
      if (!q) return true;
      return (
        row.callsign.toLowerCase().includes(q) ||
        row.radioId.toLowerCase().includes(q) ||
        row.targetSummary.toLowerCase().includes(q) ||
        row.transcodePath.toLowerCase().includes(q)
      );
    });
  }, [qsoHistory, searchQuery, modeFilter]);

  const handleTriggerPtt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPtt(true);
    try {
      await onStartPtt(testSource, testCallsign, testDuration);
    } finally {
      setSubmittingPtt(false);
    }
  };

  const ysfPathActive =
    activeTx !== null && (activeTx.sourceMode === 'YSF' || activeTx.targetModes.includes('YSF'));
  const p25PathActive =
    activeTx !== null && (activeTx.sourceMode === 'P25' || activeTx.targetModes.includes('P25'));
  const aslPathActive =
    activeTx !== null && (activeTx.sourceMode === 'ASL' || activeTx.targetModes.includes('ASL'));

  return (
    <div className="space-y-6">
      {/* 4-column top metric strip in one clean flat bordered band */}
      <section
        aria-label="Bridge metrics summary"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Bridge Legs Ready</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {metrics.linkedLegs} / 3
            </span>
            <span
              className={`text-xs font-medium ${
                metrics.linkedLegs === 3 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {metrics.linkedLegs === 3 ? 'Full 3-way mesh' : 'Degraded leg'}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            ASL {config.aslNode} · YSF {config.ysfReflectorId} · P25 {config.p25ReflectorId}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Transcoding Engine</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900">
              {config.vocoderEngine === 'md380-emu' ? 'md380-emu' : 'AMBE-3000'}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            PCM 8kHz · {config.ysfMode} AMBE+2 · IMBE 7200
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Vocoder Loop Latency</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {metrics.avgLatencyMs.toFixed(1)} ms
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {audioLevels.usrpPacketsPerSec} pkt/s
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Jitter buffer {config.jitterBufferMs} ms · {config.useAgc ? 'AGC on' : 'Fixed gain'}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">24h Cross-Mode Relays</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {metrics.totalRelays24h}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Uptime {formatDuration(metrics.containerUptimeSec)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Container: <span className="font-mono text-slate-700">{config.containerName}</span>
          </div>
        </div>
      </section>

      {/* Primary Focal Anchor: Cross-Mode Topology & Real-Time Signal Flow */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cross-Mode Signal & Audio Transcoding Topology
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Star-hub architecture on AllStarLink Node {config.aslNode} eliminates echo loops across YSF{' '}
              {config.ysfReflectorId} and P25 {config.p25ReflectorId}.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600">
            {activeTx ? (
              <span className="inline-flex items-center gap-2 font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
                TX Active · {activeTx.sourceCallsign} ({activeTx.sourceMode}) ·{' '}
                {(activeTx.durationMs / 1000).toFixed(1)}s · {activeTx.packetCount} frames
              </span>
            ) : (
              <span className="text-slate-500">Channel Idle · Standby 50Hz USRP</span>
            )}
          </div>
        </div>

        {/* Clean SVG Engineering Signal Diagram */}
        <div className="p-6 overflow-x-auto">
          <svg
            viewBox="0 0 1040 296"
            className="w-full min-w-[780px] h-auto block"
            role="img"
            aria-label={`Signal flow diagram bridging AllStarLink Node ${config.aslNode} to YSF Reflector ${config.ysfReflectorId} and P25 Reflector ${config.p25ReflectorId}`}
          >
            {/* Background subtle technical grid lines */}
            <defs>
              <marker id="arrow-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#D97706" />
              </marker>
              <marker id="arrow-ready" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#1D4ED8" />
              </marker>
            </defs>

            {/* Docker Container Boundary Box */}
            <rect
              x="278"
              y="12"
              width="484"
              height="272"
              rx="8"
              fill="#F8FAFC"
              stroke="#CBD5E1"
              strokeDasharray="5 4"
              strokeWidth="1.2"
            />
            <text x="294" y="33" fontSize="11" fontWeight="600" fill="#475569" fontFamily="DM Sans, sans-serif">
              Docker Container: {config.containerName}
            </text>

            {/* Connecting Lines: ASL Node 20800 -> Analog_Bridge_YSF */}
            <path
              d="M 232 122 C 268 122, 272 92, 304 92"
              fill="none"
              stroke={ysfPathActive && aslPathActive ? '#D97706' : aslReady && ysfReady ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={ysfPathActive && aslPathActive ? 2.5 : 1.75}
              markerEnd={ysfPathActive && aslPathActive ? 'url(#arrow-active)' : aslReady && ysfReady ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
              markerStart={ysfPathActive && aslPathActive ? 'url(#arrow-active)' : aslReady && ysfReady ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
            />
            <text x="240" y="76" fontSize="10" fill="#64748B" fontFamily="JetBrains Mono, monospace">
              USRP {config.ysfUsrpTxPort}/{config.ysfUsrpRxPort}
            </text>

            {/* Connecting Lines: ASL Node 20800 -> Analog_Bridge_P25 */}
            <path
              d="M 232 174 C 268 174, 272 204, 304 204"
              fill="none"
              stroke={p25PathActive && aslPathActive ? '#D97706' : aslReady && p25Ready ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={p25PathActive && aslPathActive ? 2.5 : 1.75}
              markerEnd={p25PathActive && aslPathActive ? 'url(#arrow-active)' : aslReady && p25Ready ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
              markerStart={p25PathActive && aslPathActive ? 'url(#arrow-active)' : aslReady && p25Ready ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
            />
            <text x="240" y="232" fontSize="10" fill="#64748B" fontFamily="JetBrains Mono, monospace">
              USRP {config.p25UsrpTxPort}/{config.p25UsrpRxPort}
            </text>

            {/* Analog_Bridge_YSF -> MMDVM_Bridge */}
            <line
              x1="486"
              y1="92"
              x2="546"
              y2="132"
              stroke={ysfPathActive ? '#D97706' : ysfReady ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={ysfPathActive ? 2.5 : 1.75}
            />
            <text x="488" y="83" fontSize="10" fill="#64748B" fontFamily="JetBrains Mono, monospace">
              TLV {config.ysfTlvTxPort}
            </text>

            {/* Analog_Bridge_P25 -> MMDVM_Bridge */}
            <line
              x1="486"
              y1="204"
              x2="546"
              y2="164"
              stroke={p25PathActive ? '#D97706' : p25Ready ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={p25PathActive ? 2.5 : 1.75}
            />
            <text x="488" y="220" fontSize="10" fill="#64748B" fontFamily="JetBrains Mono, monospace">
              TLV {config.p25TlvTxPort}
            </text>

            {/* MMDVM_Bridge -> YSFGateway -> YSF 95100 */}
            <path
              d="M 730 128 C 764 128, 766 92, 796 92"
              fill="none"
              stroke={ysfPathActive ? '#D97706' : ysfReady ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={ysfPathActive ? 2.5 : 1.75}
              markerEnd={ysfPathActive ? 'url(#arrow-active)' : ysfReady ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
            />

            {/* MMDVM_Bridge -> P25Gateway -> P25 9510 */}
            <path
              d="M 730 168 C 764 168, 766 204, 796 204"
              fill="none"
              stroke={p25PathActive ? '#D97706' : p25Ready ? '#1D4ED8' : '#CBD5E1'}
              strokeWidth={p25PathActive ? 2.5 : 1.75}
              markerEnd={p25PathActive ? 'url(#arrow-active)' : p25Ready ? 'url(#arrow-ready)' : 'url(#arrow-idle)'}
            />

            {/* NODE 1: AllStarLink Node 20800 (Left) */}
            <g transform="translate(16, 86)">
              <rect
                width="216"
                height="124"
                rx="6"
                fill="#FFFFFF"
                stroke={aslPathActive ? '#D97706' : aslReady ? '#1E293B' : '#DC2626'}
                strokeWidth={aslPathActive ? 2 : 1.2}
              />
              <text x="14" y="24" fontSize="11" fontWeight="600" fill="#475569" fontFamily="DM Sans, sans-serif">
                AllStarLink Hub (app_rpt)
              </text>
              <text x="14" y="48" fontSize="18" fontWeight="700" fill="#0F172A" fontFamily="JetBrains Mono, monospace">
                Node {config.aslNode}
              </text>
              <text x="14" y="68" fontSize="11" fill="#475569" fontFamily="JetBrains Mono, monospace">
                PCM 8kHz s16le Mixer
              </text>
              <text x="14" y="88" fontSize="11" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                Links: {config.aslPrivateYsfNode} (YSF) · {config.aslPrivateP25Node} (P25)
              </text>
              <text
                x="14"
                y="109"
                fontSize="11"
                fontWeight="600"
                fill={aslPathActive ? '#B45309' : aslReady ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {aslPathActive
                  ? activeTx?.sourceMode === 'ASL'
                    ? 'TX Source · Active'
                    : 'RX Relay · Active'
                  : aslReady
                  ? 'Linked · Nominal'
                  : 'Offline · Stopped'}
              </text>
            </g>

            {/* NODE 2A: Analog_Bridge_YSF */}
            <g transform="translate(304, 48)">
              <rect
                width="182"
                height="88"
                rx="6"
                fill="#FFFFFF"
                stroke={ysfPathActive ? '#D97706' : ysfReady ? '#CBD5E1' : '#FCA5A5'}
                strokeWidth={ysfPathActive ? 2 : 1.2}
              />
              <text x="12" y="22" fontSize="12" fontWeight="600" fill="#0F172A" fontFamily="Plus Jakarta Sans, sans-serif">
                Analog_Bridge YSF
              </text>
              <text x="12" y="42" fontSize="11" fill="#475569" fontFamily="JetBrains Mono, monospace">
                PCM ↔ AMBE+2 ({config.ysfMode})
              </text>
              <text x="12" y="60" fontSize="10.5" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                Vocoder: {config.vocoderEngine}
              </text>
              <text
                x="12"
                y="77"
                fontSize="10.5"
                fontWeight="600"
                fill={ysfPathActive ? '#B45309' : ysfReady ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {ysfPathActive ? 'Transcoding Active' : ysfReady ? 'Ready' : 'Degraded'}
              </text>
            </g>

            {/* NODE 2B: Analog_Bridge_P25 */}
            <g transform="translate(304, 160)">
              <rect
                width="182"
                height="88"
                rx="6"
                fill="#FFFFFF"
                stroke={p25PathActive ? '#D97706' : p25Ready ? '#CBD5E1' : '#FCA5A5'}
                strokeWidth={p25PathActive ? 2 : 1.2}
              />
              <text x="12" y="22" fontSize="12" fontWeight="600" fill="#0F172A" fontFamily="Plus Jakarta Sans, sans-serif">
                Analog_Bridge P25
              </text>
              <text x="12" y="42" fontSize="11" fill="#475569" fontFamily="JetBrains Mono, monospace">
                PCM ↔ IMBE 7200 bps
              </text>
              <text x="12" y="60" fontSize="10.5" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                Native Software IMBE
              </text>
              <text
                x="12"
                y="77"
                fontSize="10.5"
                fontWeight="600"
                fill={p25PathActive ? '#B45309' : p25Ready ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {p25PathActive ? 'Transcoding Active' : p25Ready ? 'Ready' : 'Degraded'}
              </text>
            </g>

            {/* NODE 3: MMDVM_Bridge + Gateways */}
            <g transform="translate(546, 94)">
              <rect
                width="184"
                height="108"
                rx="6"
                fill="#FFFFFF"
                stroke={activeTx ? '#D97706' : mmdvmReady ? '#CBD5E1' : '#FCA5A5'}
                strokeWidth={activeTx ? 2 : 1.2}
              />
              <text x="12" y="24" fontSize="12" fontWeight="600" fill="#0F172A" fontFamily="Plus Jakarta Sans, sans-serif">
                MMDVM_Bridge
              </text>
              <text x="12" y="44" fontSize="10.5" fill="#475569" fontFamily="JetBrains Mono, monospace">
                YSFGateway · UDP 4200
              </text>
              <text x="12" y="62" fontSize="10.5" fill="#475569" fontFamily="JetBrains Mono, monospace">
                P25Gateway · UDP 42020
              </text>
              <text x="12" y="80" fontSize="10.5" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                ID {config.dmrId} · NAC {config.p25Nac}
              </text>
              <text
                x="12"
                y="97"
                fontSize="10.5"
                fontWeight="600"
                fill={mmdvmReady ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {mmdvmReady ? 'Dual-Mode Routing' : 'Stopped'}
              </text>
            </g>

            {/* NODE 4A: YSF Reflector 95100 */}
            <g transform="translate(796, 48)">
              <rect
                width="228"
                height="88"
                rx="6"
                fill="#FFFFFF"
                stroke={ysfPathActive ? '#D97706' : ysfReady ? '#1E293B' : '#DC2626'}
                strokeWidth={ysfPathActive ? 2 : 1.2}
              />
              <text x="14" y="22" fontSize="11" fontWeight="600" fill="#475569" fontFamily="DM Sans, sans-serif">
                Yaesu System Fusion
              </text>
              <text x="14" y="44" fontSize="16" fontWeight="700" fill="#0F172A" fontFamily="JetBrains Mono, monospace">
                YSF {config.ysfReflectorId}
              </text>
              <text x="14" y="62" fontSize="10.5" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                UDP {config.ysfReflectorPort} · {config.ysfMode}
              </text>
              <text
                x="14"
                y="78"
                fontSize="10.5"
                fontWeight="600"
                fill={ysfPathActive ? '#B45309' : ysfReady ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {ysfPathActive
                  ? activeTx?.sourceMode === 'YSF'
                    ? 'TX Source · Active'
                    : 'RX Relay · Active'
                  : ysfReady
                  ? 'Pinned · InactivityTimeout=0'
                  : 'Unlinked'}
              </text>
            </g>

            {/* NODE 4B: P25 Reflector 9510 */}
            <g transform="translate(796, 160)">
              <rect
                width="228"
                height="88"
                rx="6"
                fill="#FFFFFF"
                stroke={p25PathActive ? '#D97706' : p25Ready ? '#1E293B' : '#DC2626'}
                strokeWidth={p25PathActive ? 2 : 1.2}
              />
              <text x="14" y="22" fontSize="11" fontWeight="600" fill="#475569" fontFamily="DM Sans, sans-serif">
                APCO Project 25
              </text>
              <text x="14" y="44" fontSize="16" fontWeight="700" fill="#0F172A" fontFamily="JetBrains Mono, monospace">
                P25 {config.p25ReflectorId}
              </text>
              <text x="14" y="62" fontSize="10.5" fill="#64748B" fontFamily="JetBrains Mono, monospace">
                UDP {config.p25ReflectorPort} · NAC {config.p25Nac}
              </text>
              <text
                x="14"
                y="78"
                fontSize="10.5"
                fontWeight="600"
                fill={p25PathActive ? '#B45309' : p25Ready ? '#15803D' : '#B91C1C'}
                fontFamily="DM Sans, sans-serif"
              >
                {p25PathActive
                  ? activeTx?.sourceMode === 'P25'
                    ? 'TX Source · Active'
                    : 'RX Relay · Active'
                  : p25Ready
                  ? 'Static TG · InactivityTimeout=0'
                  : 'Unlinked'}
              </text>
            </g>
          </svg>
        </div>

        {/* Interactive Cross-Mode PTT Signal Test Bench */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50/70">
          <form onSubmit={handleTriggerPtt} className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Inject Test Key-Up From
              </label>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                {(['ASL', 'YSF', 'P25'] as NetworkMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTestSource(mode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      testSource === mode
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'ASL'
                      ? `ASL ${config.aslNode}`
                      : mode === 'YSF'
                      ? `YSF ${config.ysfReflectorId}`
                      : `P25 ${config.p25ReflectorId}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-36">
              <label htmlFor="ptt-callsign" className="block text-xs font-medium text-slate-700 mb-1.5">
                Test Callsign
              </label>
              <input
                id="ptt-callsign"
                type="text"
                value={testCallsign}
                onChange={(e) => setTestCallsign(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full h-9 px-3 text-xs font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="w-28">
              <label htmlFor="ptt-duration" className="block text-xs font-medium text-slate-700 mb-1.5">
                Duration (s)
              </label>
              <select
                id="ptt-duration"
                value={testDuration}
                onChange={(e) => setTestDuration(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value={4}>4 sec</option>
                <option value={6}>6 sec</option>
                <option value={10}>10 sec</option>
                <option value={15}>15 sec</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingPtt}
                className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Test Cross-Mode TX
              </button>

              {activeTx && (
                <button
                  type="button"
                  onClick={onStopPtt}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  Drop Carrier
                </button>
              )}
            </div>

            <div className="ml-auto hidden xl:flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
              <span>ASL: {audioLevels.aslDb > -59 ? `${audioLevels.aslDb.toFixed(1)} dB` : 'Idle'}</span>
              <span>·</span>
              <span>YSF: {audioLevels.ysfDb > -59 ? `${audioLevels.ysfDb.toFixed(1)} dB` : 'Idle'}</span>
              <span>·</span>
              <span>P25: {audioLevels.p25Db > -59 ? `${audioLevels.p25Db.toFixed(1)} dB` : 'Idle'}</span>
            </div>
          </form>

          {pttError && (
            <div className="mt-3 text-xs text-red-700 font-medium" role="alert">
              {pttError}
            </div>
          )}
        </div>
      </section>

      {/* Last Heard Cross-Mode QSO Table */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Last Heard Cross-Mode Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recent relayed transmissions bridged across AllStarLink, System Fusion, and P25.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Mode Filter */}
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5">
              {(['ALL', 'ASL', 'YSF', 'P25'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setModeFilter(mode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    modeFilter === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'ALL' ? 'All Modes' : mode}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search
                className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter callsign or codec..."
                className="h-8 pl-8 pr-3 w-52 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredQsos.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <ArrowRightLeft className="h-6 w-6 text-slate-300 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-900">No matching transmissions</p>
              <p className="text-xs text-slate-500 mt-1">
                Clear your search filter or run a cross-mode PTT test above to record a new relay.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Source</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Callsign / ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Bridged Targets</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Transcode Path</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Duration</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Peak dBFS</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">BER</th>
                  <th className="py-2.5 px-6 text-right whitespace-nowrap">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {filteredQsos.map((qso) => (
                  <tr key={qso.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {qso.timestamp}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {qso.sourceMode}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-slate-900">{qso.callsign}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">{qso.radioId}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {qso.targetSummary}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {qso.transcodePath}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-900 tabular-nums whitespace-nowrap">
                      {qso.durationSec.toFixed(1)}s
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {qso.peakDb.toFixed(1)} dB
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {qso.berPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-6 text-right text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          qso.status === 'Completed'
                            ? 'text-emerald-700'
                            : qso.status === 'Partial'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }
                      >
                        {qso.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
