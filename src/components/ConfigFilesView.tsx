import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Download, Save, RotateCcw } from 'lucide-react';
import { BridgeConfig, GeneratedFile } from '../shared/bridgeTypes';
import { DEFAULT_BRIDGE_CONFIG, generateAllBridgeFiles } from '../shared/configGenerator';

interface ConfigFilesViewProps {
  config: BridgeConfig;
  onSaveConfig: (patch: Partial<BridgeConfig>) => Promise<void>;
}

export const ConfigFilesView: React.FC<ConfigFilesViewProps> = ({ config, onSaveConfig }) => {
  const [draft, setDraft] = useState<BridgeConfig>(config);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'All' | GeneratedFile['category']>('All');
  const [selectedPath, setSelectedPath] = useState<string>('docker-compose.yml');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const files = useMemo(() => generateAllBridgeFiles(draft), [draft]);

  const visibleFiles = useMemo(
    () => (categoryFilter === 'All' ? files : files.filter((f) => f.category === categoryFilter)),
    [files, categoryFilter],
  );

  const selectedFile =
    visibleFiles.find((f) => f.path === selectedPath) || visibleFiles[0] || files[0];

  const updateField = <K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveConfig(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_BRIDGE_CONFIG });
  };

  const handleCopy = async (file: GeneratedFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedPath(file.path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      // Fallback for restricted clipboard contexts
      const textarea = document.createElement('textarea');
      textarea.value = file.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedPath(file.path);
      setTimeout(() => setCopiedPath(null), 2000);
    }
  };

  const handleDownloadSingle = (file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'config.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Live Bridge Parameters Form */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Bridge Deployment Parameters</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Editing any field below updates every generated Docker, Asterisk, DVSwitch, and Gateway file immediately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Node 20800 Defaults
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* Station Identity */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-900 pb-1 border-b border-slate-100">
              Station & Docker Identity
            </div>
            <FieldInput
              label="Gateway Callsign"
              value={draft.callsign}
              onChange={(v) => updateField('callsign', v.toUpperCase())}
            />
            <FieldInput
              label="DMR / CCS7 ID"
              value={draft.dmrId}
              onChange={(v) => updateField('dmrId', v)}
            />
            <FieldInput
              label="GitHub Repository (owner/repo)"
              value={draft.githubRepo}
              onChange={(v) => updateField('githubRepo', v)}
            />
            <FieldInput
              label="Docker Container Name"
              value={draft.containerName}
              onChange={(v) => updateField('containerName', v)}
            />
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.networkModeHost}
                onChange={(e) => updateField('networkModeHost', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span className="text-xs text-slate-700">Use Docker host networking</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeReflectorContainers}
                onChange={(e) => updateField('includeReflectorContainers', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span className="text-xs text-slate-700">Bundle YSF & P25 Reflector containers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeCasaOsMetadata}
                onChange={(e) => updateField('includeCasaOsMetadata', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span className="text-xs text-slate-700">Include x-casaos compose metadata</span>
            </label>
          </div>

          {/* Remote AllStarLink Server */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-900 pb-1 border-b border-slate-100">
              Remote AllStarLink Server (USRP)
            </div>
            <FieldInput
              label="Remote ASL Node"
              value={draft.aslNode}
              onChange={(v) => updateField('aslNode', v)}
            />
            <FieldInput
              label="Remote ASL Server IP / Host"
              value={draft.aslHost}
              onChange={(v) => updateField('aslHost', v)}
            />
            <FieldInput
              label="This Docker Host IP (for remote rpt.conf)"
              value={draft.dockerHostIp}
              onChange={(v) => updateField('dockerHostIp', v)}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <FieldInput
                label="Private YSF Node"
                value={draft.aslPrivateYsfNode}
                onChange={(v) => updateField('aslPrivateYsfNode', v)}
              />
              <FieldInput
                label="Private P25 Node"
                value={draft.aslPrivateP25Node}
                onChange={(v) => updateField('aslPrivateP25Node', v)}
              />
            </div>
            <FieldInput
              label="Bridge Dashboard Port (TCP)"
              type="number"
              value={String(draft.dashboardPort)}
              onChange={(v) => updateField('dashboardPort', Number(v) || 3000)}
            />
          </div>

          {/* YSF Reflector 95100 */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-900 pb-1 border-b border-slate-100">
              YSF Reflector Docker (ysfreflector-with-dashboard)
            </div>
            <FieldInput
              label="YSF Reflector ID"
              value={draft.ysfReflectorId}
              onChange={(v) => updateField('ysfReflectorId', v)}
            />
            <FieldInput
              label="REFLECTOR_NAME"
              value={draft.ysfReflectorName}
              onChange={(v) => updateField('ysfReflectorName', v)}
            />
            <FieldInput
              label="REFLECTOR_DESCRIPTION"
              value={draft.ysfReflectorDescription}
              onChange={(v) => updateField('ysfReflectorDescription', v)}
            />
            <FieldInput
              label="YSF Reflector Host / IP"
              value={draft.ysfReflectorHost}
              onChange={(v) => updateField('ysfReflectorHost', v)}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <FieldInput
                label="YSF UDP Port"
                type="number"
                value={String(draft.ysfReflectorPort)}
                onChange={(v) => updateField('ysfReflectorPort', Number(v) || 42000)}
              />
              <FieldInput
                label="YSF UI Port"
                type="number"
                value={String(draft.ysfDashboardPort)}
                onChange={(v) => updateField('ysfDashboardPort', Number(v) || 42080)}
              />
            </div>
          </div>

          {/* P25 Reflector 9510 */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-900 pb-1 border-b border-slate-100">
              P25 Reflector Docker (TG9510)
            </div>
            <FieldInput
              label="P25 Reflector / TG ID"
              value={draft.p25ReflectorId}
              onChange={(v) => updateField('p25ReflectorId', v)}
            />
            <FieldInput
              label="P25 Reflector Host / IP"
              value={draft.p25ReflectorHost}
              onChange={(v) => updateField('p25ReflectorHost', v)}
            />
            <FieldInput
              label="P25 Reflector UDP Port"
              type="number"
              value={String(draft.p25ReflectorPort)}
              onChange={(v) => updateField('p25ReflectorPort', Number(v) || 41000)}
            />
            <FieldInput
              label="Host Log Volume Path"
              value={draft.p25LogPath}
              onChange={(v) => updateField('p25LogPath', v)}
            />
          </div>
        </div>

        {savedNotice && (
          <div className="px-6 py-2.5 border-t border-slate-100 bg-emerald-50/60 text-xs font-medium text-emerald-800">
            Configuration saved to bridge server and synced to Export Docker Bundle (.zip).
          </div>
        )}
      </form>

      {/* Generated Docker & DVSwitch File Explorer */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Generated Container & Configuration Files ({files.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ready-to-deploy files pre-configured for AllStarLink {draft.aslNode}, YSF {draft.ysfReflectorId}, and P25{' '}
              {draft.p25ReflectorId}.
            </p>
          </div>

          <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5">
            {(['All', 'Docker', 'AllStarLink', 'DVSwitch', 'Gateways'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
          {/* File list sidebar */}
          <div className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 divide-y divide-slate-100 overflow-y-auto max-h-[580px]">
            {visibleFiles.map((file) => {
              const active = selectedFile.path === file.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    active ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold truncate">{file.path}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span>{file.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{file.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* File content preview */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50/70">
              <div className="min-w-0">
                <div className="font-mono text-xs font-semibold text-slate-900 truncate">
                  {selectedFile.path}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedFile.description}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(selectedFile)}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                >
                  {copiedPath === selectedFile.path ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(selectedFile)}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
              </div>
            </div>

            <pre className="flex-1 bg-[#0F172A] text-slate-100 font-mono text-xs p-5 overflow-auto leading-relaxed max-h-[520px]">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};

interface FieldInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}

const FieldInput: React.FC<FieldInputProps> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
    />
  </div>
);
