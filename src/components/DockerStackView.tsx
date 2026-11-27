import React, { useMemo, useState } from 'react';
import { Play, Square, RotateCw, Pause, Trash2, Search } from 'lucide-react';
import { BridgeStatePayload } from '../shared/bridgeTypes';

interface DockerStackViewProps {
  state: BridgeStatePayload;
  onDaemonAction: (id: string, action: 'start' | 'stop' | 'restart') => Promise<void>;
  onClearLogs: () => Promise<void>;
}

function formatUptime(sec: number): string {
  if (sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export const DockerStackView: React.FC<DockerStackViewProps> = ({
  state,
  onDaemonAction,
  onClearLogs,
}) => {
  const { config, daemons, logs } = state;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [logsPaused, setLogsPaused] = useState(false);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setBusyId(`${id}:${action}`);
    try {
      await onDaemonAction(id, action);
    } finally {
      setBusyId(null);
    }
  };

  const pausedSnapshotRef = React.useRef(logs);
  if (!logsPaused) {
    pausedSnapshotRef.current = logs;
  }
  const activeLogs = logsPaused ? pausedSnapshotRef.current : logs;

  const serviceOptions = useMemo(() => {
    const names = new Set<string>(['supervisord', 'bridge_controller']);
    daemons.forEach((d) => names.add(d.id));
    return Array.from(names);
  }, [daemons]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return activeLogs.filter((entry) => {
      if (serviceFilter !== 'ALL' && entry.service !== serviceFilter) return false;
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.service.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q)
      );
    });
  }, [activeLogs, serviceFilter, logSearch]);

  const portMatrix = [
    {
      channel: `ASL ${config.aslNode} (${config.aslPrivateYsfNode}) <-> Analog_Bridge_YSF`,
      protocol: 'USRP UDP',
      binding: `${config.aslHost}:${config.ysfUsrpTxPort} / ${config.ysfUsrpRxPort}`,
      purpose: '8kHz s16le PCM voice stream for YSF leg',
    },
    {
      channel: `ASL ${config.aslNode} (${config.aslPrivateP25Node}) <-> Analog_Bridge_P25`,
      protocol: 'USRP UDP',
      binding: `${config.aslHost}:${config.p25UsrpTxPort} / ${config.p25UsrpRxPort}`,
      purpose: '8kHz s16le PCM voice stream for P25 leg',
    },
    {
      channel: 'Analog_Bridge_YSF <-> MMDVM_Bridge',
      protocol: 'TLV UDP',
      binding: `127.0.0.1:${config.ysfTlvTxPort} / ${config.ysfTlvRxPort}`,
      purpose: `AMBE+2 (${config.ysfMode}) vocoder frames & metadata`,
    },
    {
      channel: 'Analog_Bridge_P25 <-> MMDVM_Bridge',
      protocol: 'TLV UDP',
      binding: `127.0.0.1:${config.p25TlvTxPort} / ${config.p25TlvRxPort}`,
      purpose: 'IMBE 7200 bps frames & P25 TG routing',
    },
    {
      channel: `YSFGateway <-> ysfreflector-with-dashboard (${config.ysfReflectorName})`,
      protocol: 'YSF UDP',
      binding: `Client ${config.ysfReflectorPort === 42000 ? 42001 : 42000} -> ${config.ysfReflectorHost}:${config.ysfReflectorPort}`,
      purpose: `Yaesu System Fusion reflector ${config.ysfReflectorId} (${config.ysfReflectorDescription})`,
    },
    {
      channel: `YSF Reflector Web Dashboard (${config.ysfReflectorName})`,
      protocol: 'HTTP TCP',
      binding: `0.0.0.0:${config.ysfDashboardPort} -> 80`,
      purpose: 'ghcr.io/neilbartley/ysfreflector-with-dashboard UI (CasaOS port_map)',
    },
    {
      channel: `P25Gateway <-> TG${config.p25ReflectorId} (corrosive/docker-p25reflector)`,
      protocol: 'P25 UDP',
      binding: `42020 -> ${config.p25ReflectorHost}:${config.p25ReflectorPort}`,
      purpose: `APCO P25 static TG ${config.p25ReflectorId} (NAC ${config.p25Nac}) · logs ${config.p25LogPath}`,
    },
    {
      channel: 'md380-emu Vocoder Server',
      protocol: 'AMBE UDP',
      binding: `127.0.0.1:${config.md380EmuPort}`,
      purpose: config.vocoderEngine === 'md380-emu' ? 'Active software AMBE+2 vocoder' : 'Standby (USB AMBE-3000 active)',
    },
    {
      channel: 'Monitoring Dashboard Web UI & API',
      protocol: 'HTTP TCP',
      binding: `0.0.0.0:${config.dashboardPort}`,
      purpose: 'Live telemetry SSE stream, config & Docker bundle export',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Managed Container Daemons */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Container Processes (supervisord)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Image: <span className="font-mono text-slate-700">debian:bookworm-slim</span> · Container:{' '}
              <span className="font-mono text-slate-700">{config.containerName}</span> · Network:{' '}
              <span className="font-mono text-slate-700">{config.networkModeHost ? 'host' : 'bridge'}</span>
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600">
            {daemons.filter((d) => d.status === 'running').length} / {daemons.length} Processes Running
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6 whitespace-nowrap">Process</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Leg</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">PID</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Uptime</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">CPU / RAM</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Port Binding</th>
                <th className="py-2.5 px-6 text-right whitespace-nowrap">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {daemons.map((proc) => {
                const running = proc.status === 'running';
                return (
                  <tr key={proc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-6">
                      <div className="font-medium text-slate-900 whitespace-nowrap">{proc.name}</div>
                      <div className="text-xs text-slate-500 max-w-md truncate">{proc.role}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {proc.leg}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                      <span className={running ? 'text-emerald-700' : 'text-red-700'}>
                        {running ? 'Running' : 'Stopped'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {proc.pid ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {formatUptime(proc.uptimeSec)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {running ? `${proc.cpuPercent.toFixed(1)}% · ${proc.memMb.toFixed(1)} MB` : '0.0% · 0 MB'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {proc.ports}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {running ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleAction(proc.id, 'stop')}
                            className="h-7 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-red-700 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            <Square className="h-3 w-3" aria-hidden="true" />
                            Stop
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleAction(proc.id, 'start')}
                            className="h-7 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" aria-hidden="true" />
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => handleAction(proc.id, 'restart')}
                          className="h-7 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                        >
                          <RotateCw className="h-3 w-3" aria-hidden="true" />
                          Restart
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Network Port & Loopback Routing Reference */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">UDP / TCP Socket & Port Matrix</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active loopback and external UDP socket assignments verified for conflict-free dual-mode transcoding.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6 whitespace-nowrap">Channel</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Protocol</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Socket Binding</th>
                <th className="py-2.5 px-6 whitespace-nowrap">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {portMatrix.map((row) => (
                <tr key={row.channel} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-6 font-medium text-slate-900 whitespace-nowrap">{row.channel}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">{row.protocol}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-900 tabular-nums whitespace-nowrap">
                    {row.binding}
                  </td>
                  <td className="py-2.5 px-6 text-xs text-slate-600">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live Container Log Stream */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Container Stdout & Gateway Logs</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregated logs from <code className="font-mono">/var/log/dvswitch/*.log</code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              aria-label="Filter logs by service"
              className="h-8 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-800"
            >
              <option value="ALL">All services</option>
              {serviceOptions.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search
                className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search logs..."
                className="h-8 pl-8 pr-3 w-44 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setLogsPaused((p) => !p)}
              className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0"
            >
              {logsPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {logsPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="bg-[#0F172A] text-slate-200 font-mono text-xs p-4 max-h-80 overflow-y-auto space-y-1.5">
          {filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400">No log entries match the current filter.</div>
          ) : (
            filteredLogs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 leading-relaxed">
                <span className="text-slate-500 shrink-0 tabular-nums">{entry.timestamp}</span>
                <span
                  className={`shrink-0 w-12 font-semibold ${
                    entry.level === 'ERROR'
                      ? 'text-red-400'
                      : entry.level === 'WARN'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {entry.level}
                </span>
                <span className="text-sky-300 shrink-0 w-36 truncate">{entry.service}</span>
                <span className="text-slate-200 break-words min-w-0">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
