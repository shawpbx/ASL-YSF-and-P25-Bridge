import { useCallback, useEffect, useState } from 'react';
import { Download, Menu } from 'lucide-react';
import { BridgeConfig, BridgeStatePayload, NetworkMode } from './shared/bridgeTypes';
import { Sidebar, NavSection } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { AudioTranscodingView } from './components/AudioTranscodingView';
import { DockerStackView } from './components/DockerStackView';
import { ConfigFilesView } from './components/ConfigFilesView';

const SECTION_LABELS: Record<NavSection, string> = {
  overview: 'Overview',
  audio: 'Audio & Transcoding',
  docker: 'Docker Stack',
  config: 'Config & Files',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [state, setState] = useState<BridgeStatePayload | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [pttError, setPttError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BridgeStatePayload;
      setState(data);
      setLoadingError(null);
    } catch {
      setLoadingError('Unable to reach bridge controller API. Retrying connection...');
    }
  }, []);

  useEffect(() => {
    fetchInitialState();

    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const nextState = JSON.parse(event.data) as BridgeStatePayload;
        setState(nextState);
        setLoadingError(null);
      } catch {
        // Ignore malformed SSE frames
      }
    };
    evtSource.onerror = () => {
      // Browser EventSource reconnects automatically
    };

    return () => {
      evtSource.close();
    };
  }, [fetchInitialState]);

  const handleSaveConfig = async (patch: Partial<BridgeConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const next = (await res.json()) as BridgeStatePayload;
      setState(next);
    }
  };

  const handleDaemonAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    const res = await fetch(`/api/daemons/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
    });
    if (res.ok) {
      const next = (await res.json()) as BridgeStatePayload;
      setState(next);
    }
  };

  const handleStartPtt = async (sourceMode: NetworkMode, callsign: string, durationSec: number) => {
    setPttError(null);
    const res = await fetch('/api/ptt/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceMode, callsign, durationSec }),
    });
    const body = await res.json();
    if (!res.ok) {
      setPttError(body.error || 'Failed to initiate cross-mode PTT test');
      return;
    }
    setState(body as BridgeStatePayload);
  };

  const handleStopPtt = async () => {
    setPttError(null);
    const res = await fetch('/api/ptt/stop', { method: 'POST' });
    if (res.ok) {
      setState((await res.json()) as BridgeStatePayload);
    }
  };

  const handleClearLogs = async () => {
    const res = await fetch('/api/logs/clear', { method: 'POST' });
    if (res.ok) {
      setState((await res.json()) as BridgeStatePayload);
    }
  };

  const handleExportDockerBundle = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export/bundle');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state?.config.containerName || 'asl20800-bridge'}-docker.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md w-full space-y-3">
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
          {loadingError && (
            <div className="pt-2 text-xs text-red-700 font-medium">{loadingError}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-slate-900 flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        config={state.config}
        linkedLegs={state.metrics.linkedLegs}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary CTA on right */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-md focus-visible:outline-2 focus-visible:outline-blue-600"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0 whitespace-nowrap">
              <span className="text-slate-500 truncate">
                Node {state.config.aslNode} · YSF {state.config.ysfReflectorId} · P25 {state.config.p25ReflectorId}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </nav>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportDockerBundle}
              className="h-9 inline-flex items-center gap-2 px-4 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {exporting ? 'Packaging...' : 'Export Docker Bundle'}
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'overview' && (
            <OverviewView
              state={state}
              onStartPtt={handleStartPtt}
              onStopPtt={handleStopPtt}
              pttError={pttError}
            />
          )}

          {activeSection === 'audio' && (
            <AudioTranscodingView
              state={state}
              onSaveConfig={handleSaveConfig}
              onStartPtt={handleStartPtt}
              onStopPtt={handleStopPtt}
            />
          )}

          {activeSection === 'docker' && (
            <DockerStackView
              state={state}
              onDaemonAction={handleDaemonAction}
              onClearLogs={handleClearLogs}
            />
          )}

          {activeSection === 'config' && (
            <ConfigFilesView config={state.config} onSaveConfig={handleSaveConfig} />
          )}
        </main>
      </div>
    </div>
  );
}
