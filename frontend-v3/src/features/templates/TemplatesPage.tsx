import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type { ApplicationSetting, ESPTemplate, DeviceSummary } from '../../types/api.types';
import {
  DocumentTextIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  CodeBracketIcon
} from '@heroicons/react/24/outline';
import { useOtaFlash } from '../../shared/hooks/useOtaFlash';
import { useTemplateCompile } from '../../shared/hooks/useTemplateCompile';

interface TemplateEditorProps {
  template?: ESPTemplate;
  onSave: (template: Partial<ESPTemplate>) => void;
  onCancel: () => void;
}

function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    board: template?.board || 'd1_mini',
    description: template?.description || '',
    version: template?.version || '1.0.0',
    template_yaml: template?.template_yaml || `# ESPHome Configuration Template
esphome:
  name: \${device_name}
  platform: ESP8266
  board: d1_mini

wifi:
  ssid: \${wifi_ssid}
  password: \${wifi_password}

api:
  password: \${api_password}

ota:
  password: \${ota_password}

logger:
  level: INFO

# IR Transmitter Configuration
remote_transmitter:
  - id: transmitter_1
    pin:
      number: GPIO13
      inverted: false
    carrier_duty_percent: 50%
`
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {template ? 'Edit Template' : 'Create Template'}
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., D1 Mini IR Blaster"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Board Type
                </label>
                <select
                  value={formData.board}
                  onChange={(e) => setFormData({ ...formData, board: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="d1_mini">D1 Mini</option>
                  <option value="nodemcu">NodeMCU</option>
                  <option value="esp32dev">ESP32 Dev</option>
                  <option value="esp8266">Generic ESP8266</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description of the template"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 1.0.0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                YAML Template
              </label>
              <div className="border border-gray-300 rounded-md">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-300">
                  <p className="text-xs text-gray-600">
                    Use ${'{'}variable_name{'}'} for dynamic values that will be replaced during device setup
                  </p>
                </div>
                <textarea
                  value={formData.template_yaml}
                  onChange={(e) => setFormData({ ...formData, template_yaml: e.target.value })}
                  className="w-full px-3 py-2 font-mono text-sm focus:ring-0 focus:outline-none"
                  rows={20}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(formData)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {template ? 'Update' : 'Create'} Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ESPTemplate | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<ESPTemplate | null>(null);
  const [binaryPath, setBinaryPath] = useState('');
  const [otaPortInput, setOtaPortInput] = useState('');
  const [rebootDelay, setRebootDelay] = useState(20);
  const [selectedHostnames, setSelectedHostnames] = useState<string[]>([]);

  const { data: appSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const response = await api.get<ApplicationSetting[]>('/api/v1/settings/app');
      return response.data;
    },
  });

  const { data: devices, isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await api.get<DeviceSummary[]>('/api/v1/devices');
      return response.data;
    },
    staleTime: 30_000,
  });

  const {
    status: otaStatus,
    logLines: otaLogs,
    progressByHost,
    results: otaResults,
    error: otaError,
    startOTA,
    cancelOTA,
    reset: resetOTA,
  } = useOtaFlash();
  const {
    status: compileStatus,
    logLines: compileLogs,
    result: compileResult,
    error: compileError,
    startCompilation,
    cancelCompilation,
    resetCompilation,
  } = useTemplateCompile();

  const isFlashing = otaStatus === 'running';
  const isCompiling = compileStatus === 'running';

  const substitutionValues = useMemo(() => {
    const settingsMap = new Map<string, string>();
    (appSettings ?? []).forEach((setting) => {
      if (setting.value === null || setting.value === undefined) {
        return;
      }
      if (typeof setting.value === 'boolean') {
        settingsMap.set(setting.key, setting.value ? 'true' : 'false');
      } else {
        settingsMap.set(setting.key, String(setting.value));
      }
    });

    return {
      wifi_ssid: settingsMap.get('wifi_ssid') ?? 'TV',
      wifi_password: settingsMap.get('wifi_password') ?? 'changeme',
      wifi_hidden: settingsMap.get('wifi_hidden') ?? 'true',
      api_key: settingsMap.get('esphome_api_key') ?? settingsMap.get('esphome_api_password') ?? '',
      ota_password: settingsMap.get('esphome_ota_password') ?? '',
    };
  }, [appSettings]);

  useEffect(() => {
    if (!devices) return;
    setSelectedHostnames((prev) => prev.filter((hostname) => devices.some((device) => device.hostname === hostname)));
  }, [devices]);

  useEffect(() => {
    resetOTA();
    resetCompilation();
    setBinaryPath('');
    setSelectedHostnames([]);
  }, [selectedTemplate, resetOTA, resetCompilation]);

  useEffect(() => {
    if (compileResult?.binary_path) {
      setBinaryPath(compileResult.binary_path);
    }
  }, [compileResult]);

  const toggleHostname = (hostname: string) => {
    setSelectedHostnames((prev) =>
      prev.includes(hostname) ? prev.filter((value) => value !== hostname) : [...prev, hostname]
    );
  };

  const handleStartOTA = () => {
    if (!binaryPath || selectedHostnames.length === 0) return;
    const parsedPort = otaPortInput ? Number(otaPortInput) : undefined;
    startOTA({
      binaryPath,
      hostnames: selectedHostnames,
      otaPort: Number.isFinite(parsedPort) && parsedPort ? parsedPort : undefined,
      rebootWaitSeconds: rebootDelay || undefined,
    });
  };

  const handleCompile = () => {
    if (!selectedTemplate) return;
    startCompilation(selectedTemplate.template_yaml);
  };

  const formatCapabilities = (capabilities: DeviceSummary['capabilities']) => {
    if (!capabilities) return 'No capability snapshot';
    const data = capabilities as Record<string, unknown>;
    const brands = Array.isArray(data.brands) ? (data.brands as string[]) : [];
    const commands = Array.isArray(data.commands) ? (data.commands as string[]) : [];
    const pieces: string[] = [];
    if (brands.length) {
      const visible = brands.slice(0, 3).join(', ');
      pieces.push(`Brands: ${visible}${brands.length > 3 ? ', …' : ''}`);
    }
    if (commands.length) {
      pieces.push(`${commands.length} commands`);
    }
    return pieces.length ? pieces.join(' • ') : 'Capabilities captured';
  };

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get<ESPTemplate[]>('/api/v1/templates');
      return response.data;
    },
  });

  // Create template
  const createTemplate = useMutation({
    mutationFn: async (data: Partial<ESPTemplate>) => {
      await api.post('/api/v1/templates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowEditor(false);
      setEditingTemplate(undefined);
    },
  });

  // Update template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ESPTemplate> }) => {
      await api.put(`/api/v1/templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowEditor(false);
      setEditingTemplate(undefined);
    },
  });

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplate(null);
    },
  });

  const handleSaveTemplate = (data: Partial<ESPTemplate>) => {
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplate.mutate(data);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">ESPHome Templates</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage YAML templates for ESPHome device configurations
            </p>
          </div>

          <button
            onClick={() => {
              setEditingTemplate(undefined);
              setShowEditor(true);
            }}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Available Templates</h3>
            </div>
            {isLoading ? (
              <div className="p-8 text-center">
                <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Loading templates...</p>
              </div>
            ) : templates?.length === 0 ? (
              <div className="p-8 text-center">
                <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">No templates created</p>
                <p className="text-xs text-gray-500">Create your first template to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {templates?.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedTemplate?.id === template.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">{template.name}</h4>
                        <p className="text-xs text-gray-500 mt-1">{template.board}</p>
                        {template.description && (
                          <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">v{template.version}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Template Details */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="bg-white shadow rounded-lg">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{selectedTemplate.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Board: {selectedTemplate.board} • Version: {selectedTemplate.version}
                    </p>
                    {selectedTemplate.description && (
                      <p className="text-sm text-gray-600 mt-2">{selectedTemplate.description}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => copyToClipboard(selectedTemplate.template_yaml)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="Copy to clipboard"
                    >
                      <ClipboardDocumentIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingTemplate(selectedTemplate);
                        setShowEditor(true);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="Edit template"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this template?')) {
                          deleteTemplate.mutate(selectedTemplate.id);
                        }
                      }}
                      className="p-2 text-red-400 hover:text-red-600"
                      title="Delete template"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre">
                    {selectedTemplate.template_yaml}
                  </pre>
                </div>

                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900">Applied Substitutions</h4>
                  {loadingSettings ? (
                    <p className="text-xs text-gray-500 mt-2">Loading substitutions…</p>
                  ) : (
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-gray-700">
                      {Object.entries(substitutionValues).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 rounded bg-white px-3 py-2 shadow-sm"
                        >
                          <dt className="font-medium text-gray-900">{key}</dt>
                          <dd className="font-mono text-gray-600">{value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start">
                    <CodeBracketIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-900">Template Variables</h4>
                      <p className="text-xs text-blue-700 mt-1">
                        This template uses variables that will be replaced when configuring a device:
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-blue-600">
                        {selectedTemplate.template_yaml.match(/\$\{[^}]+\}/g)?.map((variable, index) => (
                          <li key={index}>• {variable}</li>
                        )) || <li>No variables defined</li>}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-white space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Compile Template</h4>
                      <p className="text-xs text-gray-500">
                        Generate a firmware binary from the current YAML before pushing it to devices.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCompile}
                        disabled={isCompiling || !selectedTemplate}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition ${
                          isCompiling || !selectedTemplate
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isCompiling ? 'Compiling…' : 'Compile YAML'}
                      </button>
                      {isCompiling ? (
                        <button
                          onClick={cancelCompilation}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-white"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={resetCompilation}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-50"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Status</p>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          compileStatus === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : compileStatus === 'error'
                            ? 'bg-rose-100 text-rose-700'
                            : compileStatus === 'running'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {compileStatus === 'idle' && 'Idle'}
                        {compileStatus === 'running' && 'Running'}
                        {compileStatus === 'success' && 'Success'}
                        {compileStatus === 'error' && 'Failed'}
                        {compileStatus === 'cancelled' && 'Cancelled'}
                      </span>
                    </div>
                    {compileResult?.binary_filename && (
                      <div className="space-y-1 text-xs">
                        <p className="text-gray-500">Binary</p>
                        <p className="font-mono text-gray-700 break-all">{compileResult.binary_filename}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Compile log</h5>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-900 p-3">
                      <pre className="whitespace-pre-wrap text-[11px] leading-4 text-gray-100">
                        {compileLogs.length ? compileLogs.join('\n') : 'Awaiting compilation output…'}
                      </pre>
                    </div>
                    {compileError && <p className="mt-2 text-xs text-rose-600">{compileError}</p>}
                  </div>
                </div>

                <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-white space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">OTA Firmware Update</h4>
                      <p className="text-xs text-gray-500">
                        Push the compiled binary to your IR controllers and monitor progress live.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleStartOTA}
                        disabled={isFlashing || !binaryPath || selectedHostnames.length === 0}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition ${
                          isFlashing || !binaryPath || selectedHostnames.length === 0
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600'
                        }`}
                      >
                        {isFlashing ? 'Uploading…' : 'Start OTA Upload'}
                      </button>
                      {isFlashing ? (
                        <button
                          onClick={cancelOTA}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-white"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={resetOTA}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-50"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-600">Firmware binary path</label>
                      <input
                        type="text"
                        value={binaryPath}
                        onChange={(event) => setBinaryPath(event.target.value)}
                        placeholder="/tmp/smartvenue-esphome/builds/firmware_123.bin"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600">OTA Port (optional)</label>
                        <input
                          type="number"
                          min={1}
                          value={otaPortInput}
                          onChange={(event) => setOtaPortInput(event.target.value)}
                          placeholder="3232"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600">Reboot wait (seconds)</label>
                        <input
                          type="number"
                          min={5}
                          value={rebootDelay}
                          onChange={(event) => setRebootDelay(Number(event.target.value) || 20)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Available controllers</h5>
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                      {loadingDevices ? (
                        <p className="text-xs text-gray-500">Loading devices…</p>
                      ) : !devices || devices.length === 0 ? (
                        <p className="text-xs text-gray-500">No registered devices.</p>
                      ) : (
                        devices.map((device) => {
                          const selected = selectedHostnames.includes(device.hostname);
                          const progress = progressByHost[device.hostname] ?? 0;
                          const result = otaResults[device.hostname];
                          const statusLabel = result
                            ? result.success
                              ? 'Updated'
                              : 'Failed'
                            : isFlashing && selected
                            ? `${progress}%`
                            : device.firmware_version || 'Unknown version';

                          return (
                            <label
                              key={device.hostname}
                              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs transition ${
                                selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                              } ${isFlashing ? 'cursor-default' : 'cursor-pointer hover:border-blue-300'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleHostname(device.hostname)}
                                    disabled={isFlashing}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div>
                                    <p className="font-semibold text-gray-800">
                                      {device.friendly_name || device.hostname}
                                    </p>
                                    <p className="text-gray-500">
                                      {device.ip_address} • {device.hostname}
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={`font-semibold ${
                                    result
                                      ? result.success
                                        ? 'text-emerald-600'
                                        : 'text-rose-600'
                                      : 'text-gray-500'
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="text-gray-600">
                                {formatCapabilities(device.capabilities)}
                              </div>
                              {isFlashing && selected && (
                                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                                  <div
                                    className="h-full rounded-full bg-blue-500"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              )}
                              {result && result.error && (
                                <p className="text-rose-600">{result.error}</p>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">OTA log</h5>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-900 p-3">
                      <pre className="whitespace-pre-wrap text-[11px] leading-4 text-gray-100">
                        {otaLogs.length ? otaLogs.join('\n') : 'Waiting for output…'}
                      </pre>
                    </div>
                    {otaError && <p className="mt-2 text-xs text-rose-600">{otaError}</p>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-8">
              <div className="text-center">
                <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Select a template to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditor
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setShowEditor(false);
            setEditingTemplate(undefined);
          }}
        />
      )}
    </div>
  );
}
