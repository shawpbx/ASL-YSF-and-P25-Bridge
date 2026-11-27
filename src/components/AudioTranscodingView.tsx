import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Save, RotateCcw } from 'lucide-react';
import { BridgeConfig, BridgeStatePayload, NetworkMode, VocoderEngine, YsfMode } from '../shared/bridgeTypes';

interface AudioTranscodingViewProps {
  state: BridgeStatePayload;
  onSaveConfig: (patch: Partial<BridgeConfig>) => Promise<void>;
  onStartPtt: (sourceMode: NetworkMode, callsign: string, durationSec: number) => Promise<void>;
  onStopPtt: () => Promise<void>;
}

export const AudioTranscodingView: React.FC<AudioTranscodingViewProps> = ({
  state,
  onSaveConfig,
  onStartPtt,
  onStopPtt,
}) => {
  const { config, audioLevels, activeTx } = state;

  const [vocoderEngine, setVocoderEngine] = useState<VocoderEngine>(config.vocoderEngine);
  const [ambeUsbDevice, setAmbeUsbDevice] = useState(config.ambeUsbDevice);
  const [ambeBaudRate, setAmbeBaudRate] = useState(config.ambeBaudRate);
  const [md380EmuPort, setMd380EmuPort] = useState(config.md380EmuPort);
  const [ysfMode, setYsfMode] = useState<YsfMode>(config.ysfMode);
  const [p25Nac, setP25Nac] = useState(config.p25Nac);

  const [aslGainYsf, setAslGainYsf] = useState(config.aslGainYsf);
  const [usrpGainYsf, setUsrpGainYsf] = useState(config.usrpGainYsf);
  const [tlvGainYsf, setTlvGainYsf] = useState(config.tlvGainYsf);
  const [aslGainP25, setAslGainP25] = useState(config.aslGainP25);
  const [usrpGainP25, setUsrpGainP25] = useState(config.usrpGainP25);
  const [tlvGainP25, setTlvGainP25] = useState(config.tlvGainP25);
  const [useAgc, setUseAgc] = useState(config.useAgc);
  const [jitterBufferMs, setJitterBufferMs] = useState(config.jitterBufferMs);
  const [timeoutTimerSec, setTimeoutTimerSec] = useState(config.timeoutTimerSec);

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync local form if server config updates externally
  useEffect(() => {
    setVocoderEngine(config.vocoderEngine);
    setAmbeUsbDevice(config.ambeUsbDevice);
    setAmbeBaudRate(config.ambeBaudRate);
    setMd380EmuPort(config.md380EmuPort);
    setYsfMode(config.ysfMode);
    setP25Nac(config.p25Nac);
    setAslGainYsf(config.aslGainYsf);
    setUsrpGainYsf(config.usrpGainYsf);
    setTlvGainYsf(config.tlvGainYsf);
    setAslGainP25(config.aslGainP25);
    setUsrpGainP25(config.usrpGainP25);
    setTlvGainP25(config.tlvGainP25);
    setUseAgc(config.useAgc);
    setJitterBufferMs(config.jitterBufferMs);
    setTimeoutTimerSec(config.timeoutTimerSec);
  }, [config]);

  // Calibrated 3-channel dBFS Audio Level Meter Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef(audioLevels);
  levelsRef.current = audioLevels;
  const peaksRef = useRef({ asl: -60, ysf: -60, p25: -60 });

  useEffect(() => {
    let rafId = 0;
    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const w = rect.width;
          const h = rect.height;

          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, w, h);

          const channels = [
            { label: `ASL ${config.aslNode} · PCM 8kHz`, db: levelsRef.current.aslDb, key: 'asl' as const },
            { label: `YSF ${config.ysfReflectorId} · AMBE+2`, db: levelsRef.current.ysfDb, key: 'ysf' as const },
            { label: `P25 ${config.p25ReflectorId} · IMBE 7200`, db: levelsRef.current.p25Db, key: 'p25' as const },
          ];

          const leftPad = 180;
          const rightPad = 76;
          const barW = Math.max(120, w - leftPad - rightPad);

          // Scale grid lines (-60, -40, -20, -10, -3, 0 dBFS)
          const marks = [-60, -40, -20, -10, -3, 0];
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          for (const dbMark of marks) {
            const norm = (dbMark + 60) / 60;
            const x = leftPad + norm * barW;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.beginPath();
            ctx.moveTo(x, 14);
            ctx.lineTo(x, h - 24);
            ctx.stroke();

            ctx.fillStyle = '#94A3B8';
            ctx.fillText(`${dbMark}`, x, h - 8);
          }

          channels.forEach((ch, idx) => {
            const y = 24 + idx * 44;
            const barH = 20;

            // Update decaying peak hold
            if (ch.db > peaksRef.current[ch.key]) {
              peaksRef.current[ch.key] = ch.db;
            } else {
              peaksRef.current[ch.key] = Math.max(-60, peaksRef.current[ch.key] - 0.18);
            }

            // Channel label
            ctx.textAlign = 'left';
            ctx.fillStyle = '#E2E8F0';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillText(ch.label, 16, y + 14);

            // Track background
            ctx.fillStyle = '#1E293B';
            ctx.fillRect(leftPad, y, barW, barH);

            // Segmented LED bar
            const segments = 48;
            const segGap = 2;
            const segW = (barW - segGap * (segments - 1)) / segments;
            const activeRatio = Math.max(0, Math.min(1, (ch.db + 60) / 60));
            const litCount = Math.round(activeRatio * segments);

            for (let s = 0; s < segments; s++) {
              const sx = leftPad + s * (segW + segGap);
              const segDb = -60 + ((s + 1) / segments) * 60;
              if (s < litCount) {
                if (segDb > -3) ctx.fillStyle = '#EF4444';
                else if (segDb > -12) ctx.fillStyle = '#F59E0B';
                else ctx.fillStyle = '#22C55E';
              } else {
                ctx.fillStyle = '#293548';
              }
              ctx.fillRect(sx, y + 2, segW, barH - 4);
            }

            // Peak hold tick
            const peakNorm = Math.max(0, Math.min(1, (peaksRef.current[ch.key] + 60) / 60));
            if (peaksRef.current[ch.key] > -58) {
              const px = leftPad + peakNorm * barW;
              ctx.fillStyle = '#F8FAFC';
              ctx.fillRect(px - 1, y, 2, barH);
            }

            // Numeric readout
            ctx.textAlign = 'right';
            ctx.fillStyle = ch.db > -59 ? '#F8FAFC' : '#64748B';
            ctx.fillText(ch.db > -59 ? `${ch.db.toFixed(1)} dB` : '-inf', w - 14, y + 14);
          });

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [config.aslNode, config.ysfReflectorId, config.p25ReflectorId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveConfig({
        vocoderEngine,
        ambeUsbDevice,
        ambeBaudRate,
        md380EmuPort,
        ysfMode,
        p25Nac,
        aslGainYsf,
        usrpGainYsf,
        tlvGainYsf,
        aslGainP25,
        usrpGainP25,
        tlvGainP25,
        useAgc,
        jitterBufferMs,
        timeoutTimerSec,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetGains = () => {
    setAslGainYsf(0.35);
    setUsrpGainYsf(0.4);
    setTlvGainYsf(0.35);
    setAslGainP25(0.35);
    setUsrpGainP25(0.45);
    setTlvGainP25(0.35);
    setUseAgc(true);
    setJitterBufferMs(40);
  };

  return (
    <div className="space-y-6">
      {/* Live Calibrated 3-Channel dBFS Audio Meter */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Real-Time Cross-Mode Audio Level Monitor (dBFS)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Target nominal speech peaks between -12 dBFS and -4 dBFS to prevent AMBE+2 / IMBE vocoder clipping.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!activeTx ? (
              <button
                type="button"
                onClick={() => onStartPtt('ASL', config.callsign, 8)}
                className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Key 8s Tone / Speech Test
              </button>
            ) : (
              <button
                type="button"
                onClick={onStopPtt}
                className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Stop Test TX
              </button>
            )}
          </div>
        </div>
        <div className="p-4 bg-[#0F172A]">
          <canvas
            ref={canvasRef}
            className="w-full h-[176px] block"
            aria-label="Live calibrated dBFS audio level meter for ASL 20800, YSF 95100, and P25 9510"
          />
        </div>
      </section>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vocoder Engine & Digital Mode Settings */}
          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Vocoder & Codec Pipeline</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure AMBE+2 transcoding for YSF {config.ysfReflectorId} and IMBE parameters for P25{' '}
                {config.p25ReflectorId}.
              </p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  AMBE+2 Vocoder Backend (YSF Leg)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVocoderEngine('md380-emu')}
                    className={`p-3.5 text-left rounded-md border transition-colors ${
                      vocoderEngine === 'md380-emu'
                        ? 'border-blue-700 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">Software md380-emu</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Zero hardware required · Runs inside Docker container on UDP {md380EmuPort}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVocoderEngine('ambe-usb')}
                    className={`p-3.5 text-left rounded-md border transition-colors ${
                      vocoderEngine === 'ambe-usb'
                        ? 'border-blue-700 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">Hardware DVSI AMBE-3000</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      ThumbDV / DVstick30 USB passthrough ({ambeUsbDevice}) · Lower latency
                    </div>
                  </button>
                </div>
              </div>

              {vocoderEngine === 'md380-emu' ? (
                <div>
                  <label htmlFor="md380-port" className="block text-xs font-medium text-slate-700 mb-1.5">
                    md380-emu Loopback UDP Port
                  </label>
                  <input
                    id="md380-port"
                    type="number"
                    value={md380EmuPort}
                    onChange={(e) => setMd380EmuPort(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="usb-device" className="block text-xs font-medium text-slate-700 mb-1.5">
                      USB Serial Device
                    </label>
                    <input
                      id="usb-device"
                      type="text"
                      value={ambeUsbDevice}
                      onChange={(e) => setAmbeUsbDevice(e.target.value)}
                      className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="usb-baud" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Baud Rate
                    </label>
                    <select
                      id="usb-baud"
                      value={ambeBaudRate}
                      onChange={(e) => setAmbeBaudRate(Number(e.target.value))}
                      className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                    >
                      <option value={230400}>230400</option>
                      <option value={460800}>460800</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor="ysf-mode" className="block text-xs font-medium text-slate-700 mb-1.5">
                    YSF Modulation Mode
                  </label>
                  <select
                    id="ysf-mode"
                    value={ysfMode}
                    onChange={(e) => setYsfMode(e.target.value as YsfMode)}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  >
                    <option value="YSFN">YSFN (DN · AMBE+2 2450bps)</option>
                    <option value="YSFW">YSFW (VW · IMBE Full Rate)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="p25-nac" className="block text-xs font-medium text-slate-700 mb-1.5">
                    P25 Network Access Code (NAC)
                  </label>
                  <input
                    id="p25-nac"
                    type="text"
                    value={p25Nac}
                    onChange={(e) => setP25Nac(e.target.value.toUpperCase().slice(0, 3))}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="jitter-ms" className="block text-xs font-medium text-slate-700 mb-1.5">
                    USRP Jitter Buffer (ms)
                  </label>
                  <input
                    id="jitter-ms"
                    type="number"
                    min={20}
                    max={160}
                    step={10}
                    value={jitterBufferMs}
                    onChange={(e) => setJitterBufferMs(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="tot-sec" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Time-Out Timer (seconds)
                  </label>
                  <input
                    id="tot-sec"
                    type="number"
                    min={30}
                    max={600}
                    step={10}
                    value={timeoutTimerSec}
                    onChange={(e) => setTimeoutTimerSec(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAgc}
                  onChange={(e) => setUseAgc(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-xs text-slate-700">
                  Enable Analog_Bridge ASL AGC (<code className="font-mono text-slate-900">AUDIO_USE_AGC</code>)
                </span>
              </label>
            </div>
          </section>

          {/* Per-Leg Audio Gain Trim */}
          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Analog_Bridge Gain Calibration</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Independent PCM/TLV gain trim written directly to Analog_Bridge_YSF.ini and Analog_Bridge_P25.ini.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetGains}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Defaults
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* YSF Leg Gains */}
              <div className="space-y-3.5">
                <div className="text-xs font-semibold text-slate-900">
                  YSF Reflector {config.ysfReflectorId} Leg (USRP {config.ysfUsrpTxPort}/{config.ysfUsrpRxPort})
                </div>
                <GainSlider label="aslGain (ASL -> YSF)" value={aslGainYsf} onChange={setAslGainYsf} />
                <GainSlider label="usrpGain (YSF -> ASL)" value={usrpGainYsf} onChange={setUsrpGainYsf} />
                <GainSlider label="tlvGain (AMBE+2 Level)" value={tlvGainYsf} onChange={setTlvGainYsf} />
              </div>

              {/* P25 Leg Gains */}
              <div className="space-y-3.5 pt-5 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-900">
                  P25 Reflector {config.p25ReflectorId} Leg (USRP {config.p25UsrpTxPort}/{config.p25UsrpRxPort})
                </div>
                <GainSlider label="aslGain (ASL -> P25)" value={aslGainP25} onChange={setAslGainP25} />
                <GainSlider label="usrpGain (P25 -> ASL)" value={usrpGainP25} onChange={setUsrpGainP25} />
                <GainSlider label="tlvGain (IMBE 7200 Level)" value={tlvGainP25} onChange={setTlvGainP25} />
              </div>
            </div>
          </section>
        </div>

        {/* Save Action Bar */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-6 py-3.5">
          <div className="text-xs text-slate-600">
            {savedNotice ? (
              <span className="font-medium text-emerald-700">
                Audio & vocoder configuration applied and written to generated container configs.
              </span>
            ) : (
              <span>Changes update live telemetry and regenerate Analog_Bridge INI files automatically.</span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Applying...' : 'Apply Audio Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface GainSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
}

const GainSlider: React.FC<GainSliderProps> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-medium text-slate-900 tabular-nums">{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={0.05}
      max={1.2}
      step={0.05}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
    />
  </div>
);
