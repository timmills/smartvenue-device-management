import React, { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

// Navigation types
type Page = 'devices' | 'ir-senders' | 'yaml-builder' | 'settings';
type SettingsTab = 'yaml-templates' | 'tag-management' | 'channels';
type ChannelTab = 'area-selection' | 'channel-list' | 'inhouse-channels';

interface DiscoveryCapabilities {
  device_id?: string;
  project?: string;
  firmware_version?: string;
  brands?: string[];
  commands?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DiscoveryProperties extends Record<string, unknown> {
  capabilities?: DiscoveryCapabilities;
}

interface DiscoveredDevice {
  id: number;
  hostname: string;
  mac_address: string;
  ip_address: string;
  friendly_name?: string;
  device_type?: string;
  firmware_version?: string;
  discovery_properties?: DiscoveryProperties;
  is_managed: boolean;
  first_discovered: string;
  last_seen: string;
}

interface DeviceTag {
  id: number;
  name: string;
  color?: string;
  description?: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface Channel {
  id: number;
  platform: string;
  broadcaster_network: string;
  channel_name: string;
  lcn?: string;
  foxtel_number?: string;
  broadcast_hours?: string;
  format?: string;
  programming_content?: string;
  availability?: string;
  logo_url?: string;
  notes?: string;
  internal: boolean;
  disabled: boolean;
  local_logo_path?: string;
}

interface ChannelStats {
  total_channels: number;
  enabled_channels: number;
  disabled_channels: number;
  platforms: string[];
  broadcasters: string[];
}

interface AreaInfo {
  name: string;
  full_name: string;
  type: string;
  state?: string;
  cities: string[];
  channel_count: number;
}

interface AreasResponse {
  areas: AreaInfo[];
}

interface InHouseChannelCreate {
  channel_name: string;
  channel_number: string;
  description?: string;
  logo_url?: string;
  disabled?: boolean;
}

interface InHouseChannelUpdate {
  channel_name?: string;
  channel_number?: string;
  description?: string;
  logo_url?: string;
  disabled?: boolean;
}

interface IRPort {
  id?: number;
  port_number: number;
  port_id?: string;
  gpio_pin?: string;
  connected_device_name?: string;
  is_active: boolean;
  cable_length?: string;
  installation_notes?: string;
  tag_ids?: number[];
  default_channel?: string;
  device_number?: number;
}

interface IRPortConfigUpdate {
  port_number: number;
  connected_device_name: string | null;
  is_active: boolean;
  cable_length: string | null;
  installation_notes: string | null;
  tag_ids: number[] | null;
  default_channel: string | null;
  device_number: number | null;
}

interface TemplateLibraryItem {
  id: number;
  name: string;
  device_category: string;
  brand: string;
  model?: string;
  source_path: string;
  espNative: boolean;
}

interface RawTemplateLibrary {
  id: number;
  name: string;
  device_category: string;
  brand: string;
  model?: string | null;
  source_path: string;
  esp_native?: boolean;
}

interface RawTemplateBrand {
  name: string;
  libraries: RawTemplateLibrary[];
}

interface RawTemplateCategory {
  name: string;
  brands: RawTemplateBrand[];
}

interface TemplateBrand {
  name: string;
  libraries: TemplateLibraryItem[];
}

interface TemplateCategory {
  name: string;
  brands: TemplateBrand[];
}

interface SelectedLibrary {
  id: number;
  name: string;
  device_category: string;
  brand: string;
  model?: string;
  source_path: string;
  espNative: boolean;
}

interface ManagedDeviceUpdateRequest {
  device_name?: string | null;
  api_key?: string | null;
  venue_name?: string | null;
  location?: string | null;
  notes?: string | null;
  ir_ports?: IRPortConfigUpdate[];
}

// Connected device interface for the new homepage
interface ConnectedDevice {
  id: string;
  name: string;
  type: string;
  brand?: string;
  model?: string;
  location: string;
  ir_sender: string;
  port: string;
  status: 'online' | 'offline' | 'unknown';
  last_used?: string;
  channels?: string[];
  tags?: DeviceTag[];
}

interface ManagedDevice {
  id: number;
  hostname: string;
  mac_address: string;
  current_ip_address: string;
  device_name?: string;
  venue_name?: string;
  location?: string;
  device_type: string;
  is_online: boolean;
  last_seen: string;
  total_ir_ports: number;
  ir_ports: IRPort[];
}

interface TemplateSummary {
  id: number;
  name: string;
  board: string;
  description?: string | null;
  version: string;
  revision: number;
}

interface ESPTemplateResponse extends TemplateSummary {
  template_yaml: string;
}

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (!text) {
    return false;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.error('navigator.clipboard.writeText failed:', err);
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch (err) {
    console.error('document.execCommand("copy") failed:', err);
    succeeded = false;
  }

  document.body.removeChild(textarea);
  return succeeded;
};

const API_UNAVAILABLE_MESSAGE = 'Backend API unreachable. Ensure the SmartVenue backend service is running.';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof TypeError) {
    return API_UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return API_UNAVAILABLE_MESSAGE;
    }
    return error.message || fallback;
  }
  return fallback;
};

const extractSubstitutionValue = (yaml: string, key: string): string => {
  const regex = new RegExp(`^\\s+${key}:\\s*(?:"([^"\\n]*)"|([^\\n#]*))`, 'm');
  const match = yaml.match(regex);
  if (!match) {
    return '';
  }
  const value = match[1] ?? match[2] ?? '';
  return value.trim();
};

const updateYamlSubstitution = (
  yaml: string,
  key: string,
  value: string,
  wrapInQuotes = true
): string => {
  const escaped = value.replace(/"/g, '\\"');
  const regex = new RegExp(`(^\\s+${key}:\\s*)(?:"[^"\\n]*"|[^\\n]*)`, 'm');
  const replacement = wrapInQuotes ? `$1"${escaped}"` : `$1${value}`;

  if (regex.test(yaml)) {
    return yaml.replace(regex, replacement);
  }

  const substitutionsMatch = yaml.match(/^substitutions:\s*$/m);
  if (!substitutionsMatch) {
    return yaml;
  }

  const headerIndex = substitutionsMatch.index ?? 0;
  const afterHeaderIndex = yaml.indexOf('\n', headerIndex);
  const insertPosition = afterHeaderIndex >= 0 ? afterHeaderIndex + 1 : yaml.length;
  const line = wrapInQuotes
    ? `  ${key}: "${escaped}"\n`
    : `  ${key}: ${value}\n`;
  return yaml.slice(0, insertPosition) + line + yaml.slice(insertPosition);
};

const ensureWifiHiddenBinding = (yaml: string): string => {
  const hiddenRegex = /(hidden:\s*)("?\$\{wifi_hidden\}"?|true|false|"true"|"false")/;
  const passwordRegex = /(password:\s*"?\$\{?wifi_password\}?"?.*\n)/;
  const hiddenValueRaw = extractSubstitutionValue(yaml, 'wifi_hidden');
  const normalizedHidden = hiddenValueRaw && hiddenValueRaw.toLowerCase() === 'false' ? '"false"' : '"true"';

  let updated = yaml;

  if (hiddenRegex.test(updated)) {
    updated = updated.replace(hiddenRegex, `$1${normalizedHidden}`);
  } else if (passwordRegex.test(updated)) {
    updated = updated.replace(passwordRegex, `$1      hidden: ${normalizedHidden}\n`);
  }

  return updated;
};

const ensureProjectName = (yaml: string): string => {
  const regex = /(project:\s*\n)(\s*)name:\s*"[^"]*"/;

  if (!regex.test(yaml)) {
    return yaml;
  }

  return yaml.replace(regex, (_match, projectLine: string, indent: string) => {
    return `${projectLine}${indent}name: "smartvenue.universal_ir"`;
  });
};

const ensureJsonInclude = (yaml: string): string => {
  if (yaml.includes('ArduinoJson.h')) {
    return yaml;
  }

  const projectBlock = /(project:\\s*\\n\\s*name:.*\\n\\s*version:.*\\n)/;
  if (projectBlock.test(yaml)) {
    return yaml.replace(projectBlock, '$1  includes:\\n    - ArduinoJson.h\\n');
  }

  const esphomeBlock = /(esphome:\\s*\\n)/;
  if (esphomeBlock.test(yaml)) {
    return yaml.replace(esphomeBlock, '$1  includes:\\n    - ArduinoJson.h\\n');
  }

  return yaml;
};

const normalizeCapabilitiesLambda = (yaml: string): string => {
  if (!yaml.includes('DynamicJsonDocument doc(768);')) {
    return yaml;
  }

  const replacement = `      - lambda: |-\n          DynamicJsonDocument doc(768);\n          doc[\"device_id\"] = App.get_name();\n          doc[\"project\"] = \"smartvenue.universal_ir\";\n          doc[\"firmware_version\"] = \"1.0.0\";\n          auto brands = doc.createNestedArray(\"brands\");\n{{CAPABILITY_BRAND_LINES}}\n          auto commands = doc.createNestedArray(\"commands\");\n{{CAPABILITY_COMMAND_LINES}}\n          auto metadata = doc.createNestedObject(\"metadata\");\n          metadata[\"ip\"] = WiFi.localIP().toString();\n          metadata[\"mac\"] = WiFi.macAddress();\n          metadata[\"hostname\"] = App.get_name();\n          metadata[\"reported_at_ms\"] = millis();\n          std::string payload;\n          serializeJson(doc, payload);\n          id(ir_capabilities_payload).publish_state(payload);`;

  return yaml.replace(/\s+- lambda: \|-[^]*?id\(ir_capabilities_payload\)\.publish_state\(payload\);/m, replacement);
};

const normalizeTemplateYaml = (
  yaml: string
): { yaml: string; wifiHidden: boolean; otaPassword: string } => {
  let updated = yaml;

  // Ensure wifi_hidden substitution and binding
  let hiddenValue = extractSubstitutionValue(updated, 'wifi_hidden');
  if (!hiddenValue) {
    hiddenValue = 'true';
  }
  updated = updateYamlSubstitution(updated, 'wifi_hidden', hiddenValue, false);
  updated = ensureWifiHiddenBinding(updated);
  hiddenValue = extractSubstitutionValue(updated, 'wifi_hidden') || hiddenValue;
  const hiddenBool = hiddenValue.toLowerCase() !== 'false';

  // Ensure ota_password substitution exists
  let otaValue = extractSubstitutionValue(updated, 'ota_password');
  if (!otaValue) {
    otaValue = '';
    updated = updateYamlSubstitution(updated, 'ota_password', otaValue);
  }
  otaValue = extractSubstitutionValue(updated, 'ota_password');

  updated = ensureProjectName(updated);
  updated = ensureJsonInclude(updated);
  updated = normalizeCapabilitiesLambda(updated);

  return { yaml: updated, wifiHidden: hiddenBool, otaPassword: otaValue };
};

interface IRPortConfigProps {
  portNumber: number;
  port?: IRPort;
  onDataChange?: (portNumber: number, data: IRPortConfigUpdate) => void;
  availableTags?: DeviceTag[];
}

function IRPortConfig({ portNumber, port, onDataChange, availableTags }: IRPortConfigProps) {
  const [deviceName, setDeviceName] = useState<string>(port?.connected_device_name || '');
  const [isActive, setIsActive] = useState<boolean>(port?.is_active ?? true);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(port?.tag_ids || []);
  const [defaultChannel, setDefaultChannel] = useState<string>(port?.default_channel || '');

  const deviceInputId = `port-${portNumber}-device`;
  const channelInputId = `port-${portNumber}-channel`;
  const activeToggleId = `port-${portNumber}-active`;

  // Notify parent of data changes
  React.useEffect(() => {
    if (onDataChange) {
      onDataChange(portNumber, {
        port_number: portNumber,
        connected_device_name: deviceName || null,
        is_active: isActive,
        cable_length: port?.cable_length ?? null,
        installation_notes: port?.installation_notes ?? null,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : null,
        default_channel: defaultChannel || null,
        device_number: port?.device_number ?? null
      });
    }
  }, [deviceName, isActive, selectedTagIds, defaultChannel, portNumber, onDataChange, port]);

  return (
    <div className={`ir-config-port ${isActive ? 'is-active' : 'is-inactive'}`}>
      <div className="ir-port-header">
        <div className="ir-port-heading">
          <span className="ir-port-number">Port {portNumber}</span>
          {port?.port_id ? <span className="ir-port-id">{port.port_id}</span> : null}
        </div>
        <label className="checkbox-label inline" htmlFor={activeToggleId}>
          <input
            id={activeToggleId}
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className={`status-pill ${isActive ? 'active' : 'inactive'}`}>
            {isActive ? 'Active' : 'Disabled'}
          </span>
        </label>
      </div>

      <div className="form-group">
        <label htmlFor={deviceInputId}>Connected Device</label>
        <input
          id={deviceInputId}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g., Main TV, Set-top Box 1"
        />
      </div>

      <div className="form-group">
        <label htmlFor={channelInputId}>Default Channel</label>
        <input
          id={channelInputId}
          value={defaultChannel}
          onChange={(e) => setDefaultChannel(e.target.value)}
          placeholder="e.g., 501, BBC1, Sky Sports"
        />
      </div>

      {/* Tag Selection */}
      {availableTags && availableTags.length > 0 && (
        <div className="form-group">
          <label>Tags:</label>
          <div className="tags-selection">
            {selectedTagIds.length > 0 && (
              <div className="selected-tags">
                {selectedTagIds.map(tagId => {
                  const tag = availableTags.find(t => t.id === tagId);
                  return tag ? (
                    <span
                      key={tagId}
                      className="tag-chip"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                      onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tagId))}
                    >
                      {tag.name} ✕
                    </span>
                  ) : null;
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                const tagId = parseInt(e.target.value);
                if (tagId && !selectedTagIds.includes(tagId)) {
                  setSelectedTagIds(prev => [...prev, tagId]);
                }
              }}
            >
              <option value="">Add tag...</option>
              {availableTags
                .filter(tag => !selectedTagIds.includes(tag.id))
                .map(tag => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

    </div>
  );
}

function App() {
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<ManagedDevice | null>(null);
  const [showIRConfig, setShowIRConfig] = useState<ManagedDevice | null>(null);
  const [portConfigs, setPortConfigs] = useState<Record<number, IRPortConfigUpdate>>({});

  // YAML builder state
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [baseTemplate, setBaseTemplate] = useState<string>('');
  const [yamlPreview, setYamlPreview] = useState<string>('');
  const [yamlCharCount, setYamlCharCount] = useState<number>(0);
  const [includeComments, setIncludeComments] = useState<boolean>(true);
  const [templateCategories, setTemplateCategories] = useState<TemplateCategory[]>([]);
  const [selectedLibraries, setSelectedLibraries] = useState<SelectedLibrary[]>([]);
  const [portAssignments, setPortAssignments] = useState<(number | null)[]>([null, null, null, null, null]);
  const [builderInitialized, setBuilderInitialized] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [compileLoading, setCompileLoading] = useState(false);
  const [compileOutput, setCompileOutput] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [binaryFilename, setBinaryFilename] = useState<string | null>(null);
  const compileOutputRef = useRef<HTMLPreElement>(null);

  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('devices');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('yaml-templates');
  const [channelTab, setChannelTab] = useState<ChannelTab>('area-selection');
  const [sortField, setSortField] = useState<keyof ConnectedDevice>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<{[key: string]: string}>({});

  // Settings and tags state
  const [deviceTags, setDeviceTags] = useState<DeviceTag[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<DeviceTag | null>(null);

  // Channels state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStats | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [channelFilters, setChannelFilters] = useState<{
    platform?: string;
    broadcaster?: string;
    search?: string;
    enabled_only: boolean;
  }>({ enabled_only: false });

  // InHouse Channels state
  const [inhouseChannels, setInhouseChannels] = useState<Channel[]>([]);
  const [inhouseLoading, setInhouseLoading] = useState(false);
  const [editingInhouseChannel, setEditingInhouseChannel] = useState<Channel | null>(null);
  const [showInhouseModal, setShowInhouseModal] = useState(false);

  // Areas state
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [templateSummaries, setTemplateSummaries] = useState<TemplateSummary[]>([]);
  const [settingsTemplateId, setSettingsTemplateId] = useState<number | null>(null);
  const [settingsTemplateYaml, setSettingsTemplateYaml] = useState<string>('');
  const [settingsTemplateLoading, setSettingsTemplateLoading] = useState(false);
  const [settingsTemplateSaving, setSettingsTemplateSaving] = useState(false);
  const [settingsTemplateDirty, setSettingsTemplateDirty] = useState(false);
  const [templateListLoading, setTemplateListLoading] = useState(false);
  const [settingsTemplateError, setSettingsTemplateError] = useState<string | null>(null);
  const [templateFeedbackMessage, setTemplateFeedbackMessage] = useState<string | null>(null);
  const [versionIncrement, setVersionIncrement] = useState<'major' | 'minor' | 'patch'>('patch');
  const [testCompile, setTestCompile] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiHidden, setWifiHidden] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [otaPassword, setOtaPassword] = useState('');
  const [wifiEditable, setWifiEditable] = useState(false);
  const [apiKeyEditable, setApiKeyEditable] = useState(false);
  const [otaEditable, setOtaEditable] = useState(false);

  // IR Config modal location state
  const [configLocation, setConfigLocation] = useState<string>('');
  const [locationMode, setLocationMode] = useState<'existing' | 'custom'>('existing');

  const API_BASE = '/api/v1/management';
  const TEMPLATE_API_BASE = '/api/v1/templates';
  const SETTINGS_API_BASE = '/api/v1/settings';
  const CHANNELS_API_BASE = '/api/v1/channels';

  const updateCredentialsFromYaml = useCallback((yaml: string) => {
    setWifiSsid(extractSubstitutionValue(yaml, 'wifi_ssid'));
    setWifiPassword(extractSubstitutionValue(yaml, 'wifi_password'));
    const hiddenValue = extractSubstitutionValue(yaml, 'wifi_hidden');
    setWifiHidden(hiddenValue ? hiddenValue.toLowerCase() !== 'false' : true);
    setApiKey(extractSubstitutionValue(yaml, 'api_key'));
    setOtaPassword(extractSubstitutionValue(yaml, 'ota_password'));
    setWifiEditable(false);
    setApiKeyEditable(false);
    setOtaEditable(false);
  }, []);

  const loadTemplateYaml = useCallback(async (id: number) => {
    if (!id) {
      return;
    }

    setSettingsTemplateLoading(true);
    setSettingsTemplateError(null);
    setTemplateFeedbackMessage(null);
    setSettingsTemplateId(id);

    try {
      const response = await fetch(`${TEMPLATE_API_BASE}/${id}`);
      if (!response.ok) {
        throw new Error('Failed to load template YAML');
      }
      const data: ESPTemplateResponse = await response.json();
      const normalized = normalizeTemplateYaml(data.template_yaml);
      setSettingsTemplateYaml(normalized.yaml);
      setSettingsTemplateDirty(normalized.yaml !== data.template_yaml);
      setWifiHidden(normalized.wifiHidden);
      setOtaPassword(normalized.otaPassword);
      updateCredentialsFromYaml(normalized.yaml);
    } catch (err) {
      console.error('Failed to load template YAML:', err);
      setSettingsTemplateYaml('');
      setSettingsTemplateError(getApiErrorMessage(err, 'Failed to load template YAML.'));
      setSettingsTemplateDirty(false);
      setWifiHidden(true);
      setOtaPassword('');
      updateCredentialsFromYaml('');
    } finally {
      setSettingsTemplateLoading(false);
    }
  }, [TEMPLATE_API_BASE, updateCredentialsFromYaml]);

  const fetchTemplateSummaries = useCallback(async () => {
    try {
      setSettingsTemplateError(null);
      setTemplateListLoading(true);
      const response = await fetch(`${TEMPLATE_API_BASE}`);
      if (!response.ok) {
        throw new Error('Failed to load template list');
      }
      const data: TemplateSummary[] = await response.json();
      setTemplateSummaries(data);

      if (data.length === 0) {
        setSettingsTemplateId(null);
        setSettingsTemplateYaml('');
        setSettingsTemplateDirty(false);
        setTemplateFeedbackMessage(null);
        return;
      }

      const selectedStillExists = settingsTemplateId !== null && data.some((item) => item.id === settingsTemplateId);
      if (!selectedStillExists && data.length > 0) {
        await loadTemplateYaml(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load template summaries:', err);
      setSettingsTemplateError(getApiErrorMessage(err, 'Failed to load template list.'));
    } finally {
      setTemplateListLoading(false);
    }
  }, [TEMPLATE_API_BASE, loadTemplateYaml, settingsTemplateId]);

  const saveTemplateYaml = useCallback(async () => {
    if (!settingsTemplateId) {
      return;
    }

    if (!settingsTemplateYaml.trim()) {
      setSettingsTemplateError('Template YAML cannot be empty.');
      return;
    }

    setSettingsTemplateSaving(true);
    setSettingsTemplateError(null);
    setTemplateFeedbackMessage(null);

    try {
      const response = await fetch(`${TEMPLATE_API_BASE}/${settingsTemplateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_yaml: settingsTemplateYaml,
          test_compile: testCompile,
          version_increment: versionIncrement
        }),
      });

      if (!response.ok) {
        let message = 'Failed to save template.';
        try {
          const errorData = await response.json();
          if (errorData?.detail) {
            message = errorData.detail;
          }
        } catch (parseError) {
          console.error('Failed to parse template save error response:', parseError);
        }
        throw new Error(message);
      }

      const data: ESPTemplateResponse = await response.json();
      const normalized = normalizeTemplateYaml(data.template_yaml);
      setSettingsTemplateYaml(normalized.yaml);
      setSettingsTemplateDirty(false);
      setTemplateFeedbackMessage('Template saved.');
      setWifiHidden(normalized.wifiHidden);
      setOtaPassword(normalized.otaPassword);
      updateCredentialsFromYaml(normalized.yaml);
      setBaseTemplate(normalized.yaml);
      setTemplateId(data.id);
      setBuilderInitialized(false);
      await fetchTemplateSummaries();
    } catch (error) {
      console.error('Failed to save template YAML:', error);
      setSettingsTemplateError(getApiErrorMessage(error, 'Failed to save template.'));
    } finally {
      setSettingsTemplateSaving(false);
    }
  }, [settingsTemplateId, settingsTemplateYaml, TEMPLATE_API_BASE, fetchTemplateSummaries, updateCredentialsFromYaml]);

  // Generate connected devices from managed devices and their ports
  const connectedDevices = React.useMemo<ConnectedDevice[]>(() => {
    const devices: ConnectedDevice[] = [];

    managedDevices.forEach(sender => {
      sender.ir_ports?.forEach(port => {
        if (port.is_active) {
          // Get tags for this port
          const portTags = port.tag_ids?.map(tagId =>
            deviceTags.find(tag => tag.id === tagId)
          ).filter(Boolean) as DeviceTag[] || [];

          devices.push({
            id: `${sender.id}-${port.port_number}`,
            name: port.connected_device_name || `Port ${port.port_number}`,
            type: sender.device_type || 'IR Device',
            location: sender.location || 'Not set',
            ir_sender: sender.device_name || sender.hostname,
            port: port.port_id || `Port ${port.port_number}`,
            status: sender.is_online ? 'online' : 'offline',
            last_used: sender.last_seen,
            channels: port.device_number ? [`Device ${port.device_number}`] : [],
            tags: portTags
          });
        }
      });
    });

    return devices;
  }, [managedDevices, deviceTags]);

  const resetPreviewAssignments = (assignments: (number | null)[]) => {
    const payload = assignments.map((libraryId, index) => ({
      port_number: index + 1,
      library_id: libraryId,
    }));
    return payload;
  };

  const handleSelectLibrary = (library: TemplateLibraryItem) => {
    setBuilderError(null);
    setSelectedLibraries((prev) => {
      if (prev.find((item) => item.id === library.id)) {
        return prev;
      }
      if (prev.length >= 2) {
        setBuilderError('You can select up to two devices for now.');
        return prev;
      }
      const updated = [...prev, {
        id: library.id,
        name: library.name,
        device_category: library.device_category,
        brand: library.brand,
        model: library.model,
        source_path: library.source_path,
        espNative: library.espNative,
      }];

      setPortAssignments((ports) => {
        const next = [...ports];
        const openIndex = next.findIndex((value) => value === null);
        if (openIndex !== -1) {
          next[openIndex] = library.id;
        }
        return next;
      });

      return updated;
    });
  };

  const handleRemoveLibrary = (libraryId: number) => {
    setBuilderError(null);
    setSelectedLibraries((prev) => prev.filter((item) => item.id !== libraryId));
    setPortAssignments((ports) => ports.map((value) => (value === libraryId ? null : value)));
  };

  const handlePortAssignmentChange = (index: number, value: string) => {
    const parsed = value === '' ? null : Number(value);
    setPortAssignments((ports) => {
      const next = [...ports];
      next[index] = Number.isNaN(parsed) ? null : parsed;
      return next;
    });
  };

  const handleCompile = useCallback(async () => {
    const yaml = (yamlPreview || baseTemplate || '').trim();
    if (!yaml) {
      setCompileOutput('No YAML available to compile.');
      return;
    }

    try {
      setCompileLoading(true);
      setCompileOutput('Starting compilation...\n');
      setDownloadUrl(null);
      setBinaryFilename(null);
      setBuilderError(null);

      const response = await fetch(`${TEMPLATE_API_BASE}/compile-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'output') {
                setCompileOutput(prev => {
                  const newOutput = prev + data.message + '\n';
                  // Auto-scroll to bottom
                  setTimeout(() => {
                    if (compileOutputRef.current) {
                      compileOutputRef.current.scrollTop = compileOutputRef.current.scrollHeight;
                    }
                  }, 0);
                  return newOutput;
                });
              } else if (data.type === 'complete') {
                if (data.success && data.binary_filename) {
                  setDownloadUrl(`${TEMPLATE_API_BASE}/download/${data.binary_filename}`);
                  setBinaryFilename(data.binary_filename);
                  setCompileOutput(prev => prev + '\n✅ Compilation successful! Binary ready for download.\n');
                } else {
                  setBuilderError('ESPHome compilation failed. See output for details.');
                }
              } else if (data.type === 'error') {
                setBuilderError(data.message);
                setCompileOutput(prev => prev + '\n❌ ' + data.message + '\n');
              } else if (data.type === 'status') {
                setCompileOutput(prev => prev + data.message + '\n');
              } else if (data.type === 'keepalive') {
                // Ignore keepalive messages
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

    } catch (err) {
      console.error('Compilation error:', err);
      setCompileOutput(getApiErrorMessage(err, 'Compilation request failed.'));
      setBuilderError('Compilation request failed.');
    } finally {
      setCompileLoading(false);
    }
  }, [TEMPLATE_API_BASE, yamlPreview, baseTemplate]);

  const handleSaveYaml = useCallback(() => {
    const yaml = (yamlPreview || baseTemplate || '').trim();
    if (!yaml) {
      setBuilderError('No YAML available to save.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `smartvenue-ir-${timestamp}.yaml`;

    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setBuilderError(null);
  }, [yamlPreview, baseTemplate]);

  const handleSaveYamlToServer = useCallback(async () => {
    const yaml = (yamlPreview || baseTemplate || '').trim();
    if (!yaml) {
      setBuilderError('No YAML available to save.');
      return;
    }

    try {
      const response = await fetch(`${TEMPLATE_API_BASE}/save-yaml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ yaml }),
      });

      if (!response.ok) {
        throw new Error('Failed to save YAML to server');
      }

      const data = await response.json();
      setBuilderError(`✅ YAML saved to server: ${data.filename}`);
    } catch (err) {
      console.error(err);
      setBuilderError(getApiErrorMessage(err, 'Failed to save YAML to server.'));
    }
  }, [TEMPLATE_API_BASE, yamlPreview, baseTemplate]);

  const requestPreview = useCallback(
    async (
      templateIdOverride?: number,
      assignmentsOverride?: (number | null)[],
      includeCommentsOverride?: boolean
    ) => {
      const effectiveTemplateId = templateIdOverride ?? templateId;
      if (!effectiveTemplateId) {
        return;
      }

      const assignments = assignmentsOverride ?? portAssignments;
      const include = includeCommentsOverride ?? includeComments;

      const body = {
        template_id: effectiveTemplateId,
        assignments: resetPreviewAssignments(assignments),
        include_comments: include,
      };

      try {
        setPreviewLoading(true);
        const response = await fetch(`${TEMPLATE_API_BASE}/preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error('Failed to generate YAML preview');
        }

        const data = await response.json();
        setYamlPreview(data.yaml);
        setYamlCharCount(data.char_count);
      } catch (err) {
        console.error(err);
        setBuilderError(getApiErrorMessage(err, 'Unable to generate YAML preview.'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [templateId, portAssignments, includeComments, TEMPLATE_API_BASE]
  );

  const fetchBuilderData = useCallback(async (force = false) => {
    if (builderInitialized && !force) {
      return;
    }

    setBuilderLoading(true);
    setBuilderError(null);

    try {
      const [templateRes, hierarchyRes] = await Promise.all([
        fetch(`${TEMPLATE_API_BASE}/base`),
        fetch(`${TEMPLATE_API_BASE}/device-hierarchy`),
      ]);

      if (!templateRes.ok) {
        throw new Error('Failed to load base template');
      }
      if (!hierarchyRes.ok) {
        throw new Error('Failed to load device hierarchy');
      }

      const templateData = await templateRes.json();
      const hierarchyData: RawTemplateCategory[] = await hierarchyRes.json();

      const normalizedCategories: TemplateCategory[] = hierarchyData.map((category) => {
        const displayName = category.name.toLowerCase().startsWith('tv')
          ? ` ${category.name}`
          : category.name;

        return {
          name: displayName,
          brands: category.brands.map((brand) => ({
            name: brand.name,
            libraries: brand.libraries.map((library) => ({
              id: library.id,
              name: library.name,
              device_category: library.device_category,
              brand: library.brand,
              model: library.model ?? undefined,
              source_path: library.source_path,
              espNative: Boolean(library.esp_native),
            })),
          })),
        };
      });

      const nativeIndex = normalizedCategories.findIndex((category) => category.brands.some((brand) => brand.libraries.some((library) => library.espNative)));
      if (nativeIndex > 0) {
        const [nativeCategory] = normalizedCategories.splice(nativeIndex, 1);
        normalizedCategories.unshift(nativeCategory);
      }

      setTemplateId(templateData.id);
      setBaseTemplate(templateData.template_yaml);
      setTemplateCategories(normalizedCategories);
      setBuilderInitialized(true);

      await requestPreview(templateData.id, portAssignments, includeComments);
    } catch (err) {
      console.error(err);
      setBuilderError(getApiErrorMessage(err, 'Failed to initialize YAML builder.'));
    } finally {
      setBuilderLoading(false);
    }
  }, [builderInitialized, includeComments, portAssignments, requestPreview, TEMPLATE_API_BASE]);

  useEffect(() => {
    if (!templateFeedbackMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setTemplateFeedbackMessage(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [templateFeedbackMessage]);

  // Handle port configuration data changes
  const handlePortDataChange = (portNumber: number, data: IRPortConfigUpdate) => {
    setPortConfigs(prev => ({
      ...prev,
      [portNumber]: data
    }));
  };

  // Save IR configuration
  const saveIRConfiguration = async () => {
    if (!showIRConfig) return;

    try {
      const portData: IRPortConfigUpdate[] = Object.values(portConfigs);

      const response = await fetch(`${API_BASE}/managed/${showIRConfig.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: configLocation || null,
          ir_ports: portData
        }),
      });

      if (response.ok) {
        setShowIRConfig(null);
        setPortConfigs({});
        setConfigLocation('');
        fetchData();
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  // Tag management functions
  const fetchDeviceTags = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch(`${SETTINGS_API_BASE}/tags`);
      if (response.ok) {
        const tags = await response.json();
        setDeviceTags(tags);
      }
    } catch (err) {
      console.error('Failed to fetch device tags:', err);
      setError(getApiErrorMessage(err, 'Failed to fetch device tags.'));
    } finally {
      setSettingsLoading(false);
    }
  };

  const createDeviceTag = async (name: string, color?: string, description?: string) => {
    try {
      const response = await fetch(`${SETTINGS_API_BASE}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, description })
      });

      if (response.ok) {
        await fetchDeviceTags();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to create tag');
        return false;
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
      setError('Failed to create tag');
      return false;
    }
  };

  const updateDeviceTag = async (tagId: number, name: string, color?: string, description?: string) => {
    try {
      const response = await fetch(`${SETTINGS_API_BASE}/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, description })
      });

      if (response.ok) {
        await fetchDeviceTags();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update tag');
        return false;
      }
    } catch (error) {
      console.error('Failed to update tag:', error);
      setError('Failed to update tag');
      return false;
    }
  };

  const deleteDeviceTag = async (tagId: number) => {
    try {
      const response = await fetch(`${SETTINGS_API_BASE}/tags/${tagId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchDeviceTags();
        await fetchData(); // Refresh device data to update tag associations
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to delete tag');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      setError('Failed to delete tag');
      return false;
    }
  };

  // Channels management functions
  const fetchChannels = async () => {
    setChannelsLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelFilters.platform) params.append('platform', channelFilters.platform);
      if (channelFilters.broadcaster) params.append('broadcaster', channelFilters.broadcaster);
      if (channelFilters.search) params.append('search', channelFilters.search);
      if (channelFilters.enabled_only) params.append('enabled_only', 'true');
      params.append('limit', '500');

      const response = await fetch(`${CHANNELS_API_BASE}/channels?${params}`);
      if (response.ok) {
        const channelsData = await response.json();
        setChannels(channelsData);
      } else {
        setError('Failed to fetch channels');
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      setError('Failed to fetch channels');
    } finally {
      setChannelsLoading(false);
    }
  };

  const fetchChannelStats = async () => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/stats`);
      if (response.ok) {
        const stats = await response.json();
        setChannelStats(stats);
      }
    } catch (error) {
      console.error('Failed to fetch channel stats:', error);
    }
  };

  const updateChannel = async (channelId: number, updates: { disabled?: boolean; internal?: boolean }) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update channel');
        return false;
      }
    } catch (error) {
      console.error('Failed to update channel:', error);
      setError('Failed to update channel');
      return false;
    }
  };

  const bulkUpdateChannels = async (channelIds: number[], updates: { disabled?: boolean; internal?: boolean }) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/bulk-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: channelIds, ...updates })
      });

      if (response.ok) {
        await fetchChannels();
        await fetchChannelStats();
        setSelectedChannels(new Set());
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update channels');
        return false;
      }
    } catch (error) {
      console.error('Failed to update channels:', error);
      setError('Failed to update channels');
      return false;
    }
  };

  const updatePlatformChannels = async (platform: string, updates: { disabled?: boolean; internal?: boolean }) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/platform/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update platform channels');
        return false;
      }
    } catch (error) {
      console.error('Failed to update platform channels:', error);
      setError('Failed to update platform channels');
      return false;
    }
  };

  // Areas management functions
  const fetchAreas = async () => {
    setAreasLoading(true);
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/areas`);
      if (response.ok) {
        const areasData = await response.json();
        setAreas(areasData.areas);
      } else {
        setError('Failed to fetch areas');
      }
    } catch (error) {
      console.error('Failed to fetch areas:', error);
      setError('Failed to fetch areas');
    } finally {
      setAreasLoading(false);
    }
  };

  const updateAreaChannels = async (areaName: string, updates: { disabled?: boolean; internal?: boolean }) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/area/${encodeURIComponent(areaName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update area channels');
        return false;
      }
    } catch (error) {
      console.error('Failed to update area channels:', error);
      setError('Failed to update area channels');
      return false;
    }
  };

  const updateCityChannels = async (cityName: string, updates: { disabled?: boolean; internal?: boolean }) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/channels/city/${encodeURIComponent(cityName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update city channels');
        return false;
      }
    } catch (error) {
      console.error('Failed to update city channels:', error);
      setError('Failed to update city channels');
      return false;
    }
  };

  // InHouse channel management functions
  const fetchInhouseChannels = async () => {
    setInhouseLoading(true);
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/inhouse`);
      if (response.ok) {
        const channelsData = await response.json();
        setInhouseChannels(channelsData);
      } else {
        setError('Failed to fetch InHouse channels');
      }
    } catch (error) {
      console.error('Failed to fetch InHouse channels:', error);
      setError('Failed to fetch InHouse channels');
    } finally {
      setInhouseLoading(false);
    }
  };

  const createInhouseChannel = async (channelData: InHouseChannelCreate) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/inhouse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channelData)
      });

      if (response.ok) {
        await fetchInhouseChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to create InHouse channel');
        return false;
      }
    } catch (error) {
      console.error('Failed to create InHouse channel:', error);
      setError('Failed to create InHouse channel');
      return false;
    }
  };

  const updateInhouseChannel = async (channelId: number, updates: InHouseChannelUpdate) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/inhouse/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchInhouseChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update InHouse channel');
        return false;
      }
    } catch (error) {
      console.error('Failed to update InHouse channel:', error);
      setError('Failed to update InHouse channel');
      return false;
    }
  };

  const deleteInhouseChannel = async (channelId: number) => {
    try {
      const response = await fetch(`${CHANNELS_API_BASE}/inhouse/${channelId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchInhouseChannels();
        await fetchChannelStats();
        return true;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to delete InHouse channel');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete InHouse channel:', error);
      setError('Failed to delete InHouse channel');
      return false;
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Sync discovered devices first
      await fetch(`${API_BASE}/sync-discovered`, { method: 'POST' });

      // Fetch discovered and managed devices
      const [discoveredRes, managedRes] = await Promise.all([
        fetch(`${API_BASE}/discovered`),
        fetch(`${API_BASE}/managed`)
      ]);

      if (!discoveredRes.ok || !managedRes.ok) {
        throw new Error('Failed to fetch device data');
      }

      const discoveredData = await discoveredRes.json();
      const managedData = await managedRes.json();

      setDiscoveredDevices(discoveredData);
      setManagedDevices(managedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addToManagement = async (hostname: string) => {
    try {
      const device = discoveredDevices.find(d => d.hostname === hostname);
      if (!device) return;

      const deviceData: ManagedDeviceUpdateRequest = {
        device_name: device.friendly_name || hostname,
        api_key: 'uuPgF8JOAV/ZhFbDV4iS4Kwr1MV5H97p6Nk+HnpE0+g=',
        venue_name: '',
        location: '',
        notes: ''
      };

      const response = await fetch(`${API_BASE}/manage/${hostname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });

      if (!response.ok) {
        throw new Error('Failed to add device to management');
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add device');
    }
  };

  const forgetDevice = async (hostname: string) => {
    try {
      const response = await fetch(`${API_BASE}/discovered/${hostname}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove device from discovery');
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to forget device');
    }
  };

  const removeFromManagement = async (deviceId: number) => {
    if (!confirm('Remove this IR sender?')) return;

    try {
      const response = await fetch(`${API_BASE}/managed/${deviceId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove device');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
    }
  };

  const syncDeviceStatus = async (deviceId: number) => {
    try {
      const response = await fetch(`${API_BASE}/managed/${deviceId}/health-check`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Health check request failed');
      }
      await fetchData();
    } catch (err) {
      console.error(err);
      setError('Failed to run device health check');
    }
  };

  const updateDevice = async (deviceId: number, deviceData: ManagedDeviceUpdateRequest) => {
    try {
      const response = await fetch(`${API_BASE}/managed/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });

      if (!response.ok) {
        throw new Error('Failed to update device');
      }

      await fetchData();
      setEditingDevice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update device');
    }
  };

  useEffect(() => {
    fetchData();
    fetchDeviceTags(); // Load tags on initial load
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTemplateSummaries();
  }, [fetchTemplateSummaries]);

  useEffect(() => {
    if (currentPage === 'yaml-builder') {
      setCompileOutput(null);
      setBuilderError(null);
      fetchBuilderData(true);
      fetchBuilderData();
    } else if (currentPage === 'settings') {
      fetchDeviceTags(); // Refresh tags when visiting settings
      fetchTemplateSummaries();
    }
  }, [currentPage, fetchBuilderData, fetchTemplateSummaries]);

  useEffect(() => {
    if (currentPage !== 'yaml-builder' || !builderInitialized || !templateId) {
      return;
    }
    requestPreview();
  }, [currentPage, builderInitialized, templateId, portAssignments, includeComments, requestPreview]);

  // Reset port configs when IR config modal opens/closes
  useEffect(() => {
    if (!showIRConfig) {
      setPortConfigs({});
      setConfigLocation('');
      setLocationMode('existing');
      return;
    }

    const initialLocation = showIRConfig.location || '';
    setConfigLocation(initialLocation);

    const availableLocations = Array.from(new Set(
      managedDevices
        .map(device => device.location)
        .filter((location): location is string => Boolean(location))
    ));

    if (initialLocation && !availableLocations.includes(initialLocation)) {
      setLocationMode('custom');
    } else {
      setLocationMode('existing');
    }
  }, [showIRConfig, managedDevices]);

  // Load channels data when channels tab is active
  useEffect(() => {
    if (currentPage === 'settings' && settingsTab === 'channels') {
      fetchChannels();
      fetchChannelStats();
      fetchAreas();
      fetchInhouseChannels();
    }
  }, [currentPage, settingsTab]);

  // Load InHouse channels when InHouse tab is active
  useEffect(() => {
    if (currentPage === 'settings' && settingsTab === 'channels' && channelTab === 'inhouse-channels') {
      fetchInhouseChannels();
    }
  }, [currentPage, settingsTab, channelTab]);

  // Reload channels when filters change
  useEffect(() => {
    if (currentPage === 'settings' && settingsTab === 'channels') {
      fetchChannels();
    }
  }, [channelFilters]);

  const unmanaged = discoveredDevices.filter(device => !device.is_managed);

  if (loading && discoveredDevices.length === 0) {
    return (
      <div className="container">
        <div className="loading">
          <div>⚙️ Loading SmartVenue IR Control System...</div>
        </div>
      </div>
    );
  }

  // Sorting and filtering logic
  const sortedAndFilteredDevices = connectedDevices
    .filter(device => {
      return Object.entries(filters).every(([field, value]) => {
        if (!value) return true;
        if (field === 'tag') {
          return device.tags?.some(tag => tag.name.toLowerCase().includes(value.toLowerCase()));
        }
        return device[field as keyof ConnectedDevice]?.toString().toLowerCase().includes(value.toLowerCase());
      });
    })
    .sort((a, b) => {
      const aVal = a[sortField]?.toString() || '';
      const bVal = b[sortField]?.toString() || '';
      const comparison = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Bulk selection functions
  const handleDeviceSelection = (deviceId: string, isSelected: boolean) => {
    setSelectedDevices(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(deviceId);
      } else {
        newSet.delete(deviceId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedDevices(new Set(sortedAndFilteredDevices.map(d => d.id)));
  };

  const handleSelectNone = () => {
    setSelectedDevices(new Set());
  };

  const handleSelectByLocation = (location: string) => {
    const devicesInLocation = sortedAndFilteredDevices
      .filter(d => d.location === location)
      .map(d => d.id);

    // Check if all devices in this location are already selected
    const allSelected = devicesInLocation.every(id => selectedDevices.has(id));

    setSelectedDevices(prev => {
      const newSelected = new Set(prev);
      if (allSelected) {
        // Deselect all devices in this location
        devicesInLocation.forEach(id => newSelected.delete(id));
      } else {
        // Select all devices in this location
        devicesInLocation.forEach(id => newSelected.add(id));
      }
      return newSelected;
    });
  };

  const handleSelectByTag = (tagId: number) => {
    const devicesWithTag = sortedAndFilteredDevices
      .filter(d => d.tags?.some(tag => tag.id === tagId))
      .map(d => d.id);

    // Check if all devices with this tag are already selected
    const allSelected = devicesWithTag.every(id => selectedDevices.has(id));

    setSelectedDevices(prev => {
      const newSelected = new Set(prev);
      if (allSelected) {
        // Deselect all devices with this tag
        devicesWithTag.forEach(id => newSelected.delete(id));
      } else {
        // Select all devices with this tag
        devicesWithTag.forEach(id => newSelected.add(id));
      }
      return newSelected;
    });
  };

  const handleSort = (field: keyof ConnectedDevice) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFilter = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="container">
      {/* Header with Navigation */}
      <div className="header">
        <div>
          <h1>🏢 SmartVenue</h1>
          <p>IR Device Control System</p>
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${currentPage === 'devices' ? 'active' : ''}`}
            onClick={() => setCurrentPage('devices')}
          >
            📺 Devices ({connectedDevices.length})
          </button>
          <button
            className={`nav-tab ${currentPage === 'ir-senders' ? 'active' : ''}`}
            onClick={() => setCurrentPage('ir-senders')}
          >
            📡 IR Senders ({managedDevices.length})
          </button>
          <button
            className={`nav-tab ${currentPage === 'yaml-builder' ? 'active' : ''}`}
            onClick={() => setCurrentPage('yaml-builder')}
          >
            🧪 YAML Builder
          </button>
          <button
            className={`nav-tab ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            ⚙️ Settings
          </button>
        </div>
        <div className="header-actions">
          <button className="button secondary refresh-button" onClick={fetchData}>
            🔄 Refresh
          </button>
          <a
            href="http://100.93.158.19:8000/api/v1/admin/"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary"
            style={{ textDecoration: 'none', marginLeft: '8px' }}
          >
            🗄️ Database
          </a>
        </div>
      </div>

      {error && (
        <div className="error">
          ❌ {error}
        </div>
      )}

      {/* Page Content */}
      {currentPage === 'devices' && (
        <div className="modern-device-page">
          <div className="page-header">
            <h2>📺 Connected Devices</h2>
            <p>Manage and control all devices connected through IR senders</p>
          </div>

          {connectedDevices.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
              <h3>No Connected Devices</h3>
              <p>Configure IR senders first, then add devices to their ports.</p>
              <button
                className="button"
                onClick={() => setCurrentPage('ir-senders')}
              >
                🔧 Setup IR Senders
              </button>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="filter-bar">
                <input
                  type="text"
                  placeholder="🔍 Filter by name..."
                  value={filters.name || ''}
                  onChange={(e) => handleFilter('name', e.target.value)}
                />
                <select
                  value={filters.type || ''}
                  onChange={(e) => handleFilter('type', e.target.value)}
                >
                  <option value="">All Types</option>
                  {Array.from(new Set(connectedDevices.map(d => d.type))).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <select
                  value={filters.location || ''}
                  onChange={(e) => handleFilter('location', e.target.value)}
                >
                  <option value="">All Locations</option>
                  {Array.from(new Set(connectedDevices.map(d => d.location))).map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                <select
                  value={filters.status || ''}
                  onChange={(e) => handleFilter('status', e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
                {deviceTags.length > 0 && (
                  <select
                    value={filters.tag || ''}
                    onChange={(e) => handleFilter('tag', e.target.value)}
                  >
                    <option value="">All Tags</option>
                    {deviceTags.map(tag => (
                      <option key={tag.id} value={tag.name}>{tag.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Bulk Actions */}
              {selectedDevices.size > 0 && (
                <div className="bulk-selection-bar">
                  <div className="bulk-actions">
                    <button className="button" disabled>
                      🎮 Send Command (Coming Soon)
                    </button>
                    <button className="button secondary" disabled>
                      ⚡ Power All
                    </button>
                    <button className="button secondary" disabled>
                      🔇 Mute All
                    </button>
                  </div>
                </div>
              )}

              {/* Device Table */}
              <div className="device-table-container">
                <table className="device-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>
                        <input
                          type="checkbox"
                          checked={sortedAndFilteredDevices.length > 0 && selectedDevices.size === sortedAndFilteredDevices.length}
                          onChange={(e) => e.target.checked ? handleSelectAll() : handleSelectNone()}
                        />
                      </th>
                      <th onClick={() => handleSort('name')} className="sortable">
                        Device {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('type')} className="sortable">
                        Type {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('location')} className="sortable">
                        Location {sortField === 'location' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('ir_sender')} className="sortable">
                        IR Sender {sortField === 'ir_sender' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('status')} className="sortable">
                        Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAndFilteredDevices.map(device => (
                      <React.Fragment key={device.id}>
                        <tr
                          className={`device-row ${selectedDevice === device.id ? 'selected' : ''} ${selectedDevices.has(device.id) ? 'bulk-selected' : ''}`}
                          onClick={() => setSelectedDevice(selectedDevice === device.id ? null : device.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedDevices.has(device.id)}
                              onChange={(e) => handleDeviceSelection(device.id, e.target.checked)}
                            />
                          </td>
                          <td>
                            <div className="device-info">
                              <strong>{device.name}</strong>
                              {device.brand && <div className="device-brand">{device.brand} {device.model}</div>}
                            </div>
                          </td>
                          <td>
                            <span className={`device-type-badge ${device.type.toLowerCase()}`}>
                              {device.type}
                            </span>
                          </td>
                          <td onClick={(e) => {
                            e.stopPropagation();
                            handleSelectByLocation(device.location);
                          }}>
                            <span className="clickable-location" title="Click to select/deselect all devices in this location">
                              {device.location}
                            </span>
                          </td>
                          <td>
                            <div className="ir-sender-info">
                              {device.ir_sender}
                              <div className="port-info">{device.port}</div>
                            </div>
                          </td>
                          <td>
                            <div className="status-with-tags">
                              {device.tags && device.tags.length > 0 && (
                                <div className="modern-device-tags">
                                  {device.tags.map(tag => (
                                    <span
                                      key={tag.id}
                                      className="modern-tag clickable-tag"
                                      style={{
                                        backgroundColor: tag.color || '#6b7280',
                                        color: '#ffffff'
                                      }}
                                      title="Click to select/deselect all devices with this tag"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectByTag(tag.id);
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <span className={`status-icon ${device.status}`}>
                                {device.status === 'online' ? '🟢' : '🔴'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <button className="action-btn" disabled={device.status !== 'online'}>
                              🎮 Control
                            </button>
                          </td>
                        </tr>
                        {selectedDevice === device.id && (
                          <tr className="device-detail-row">
                            <td colSpan={7}>
                              <div className="device-details">
                                <h4>📋 Device Actions</h4>
                                <div className="action-grid">
                                  <button className="action-button power" disabled={device.status !== 'online'}>
                                    ⚡ Power On/Off
                                  </button>
                                  <button className="action-button volume" disabled={device.status !== 'online'}>
                                    🔊 Volume
                                  </button>
                                  <button className="action-button channel" disabled={device.status !== 'online'}>
                                    📺 Channels
                                  </button>
                                  <button className="action-button input" disabled={device.status !== 'online'}>
                                    🔄 Input Source
                                  </button>
                                </div>
                                {device.channels && device.channels.length > 0 && (
                                  <div className="channel-info">
                                    <h5>📡 Available Channels:</h5>
                                    <div className="channel-list">
                                      {device.channels.map(channel => (
                                        <span key={channel} className="channel-tag">{channel}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* IR Senders Page */}
      {currentPage === 'ir-senders' && (
        <div className="ir-senders-page">
          <div className="page-header">
            <h2>📡 IR Senders</h2>
            <p>Manage IR blaster devices and their connected devices</p>
          </div>

          {/* Discovered Devices */}
          {unmanaged.length > 0 && (
            <div className="discovered-section">
              <h2>📡 Discovered Devices ({unmanaged.length})</h2>
              <p style={{ color: '#92400e', marginBottom: '16px' }}>
                These devices were found on the network but haven't been added to management yet.
              </p>

              <div className="device-grid">
                {unmanaged.map((device) => (
                  <div key={device.hostname} className="device-card">
                    <div className="device-header">
                      <div>
                        <div className="device-title">{device.hostname}</div>
                        <div className="device-subtitle">{device.friendly_name}</div>
                      </div>
                      <span className={`device-badge ${device.device_type || 'universal'}`}>
                        {device.device_type || 'universal'}
                      </span>
                    </div>

                    <div className="device-info">
                      <div>💻 IP: {device.ip_address}</div>
                      <div>🔧 MAC: {device.mac_address}</div>
                      {device.firmware_version && (
                        <div>📦 Version: {device.firmware_version}</div>
                      )}
                      <div>🕒 Discovered: {new Date(device.first_discovered).toLocaleString()}</div>
                    </div>

                    <div className="button-group">
                      <button
                        className="button"
                        onClick={() => addToManagement(device.hostname)}
                      >
                        ➕ Add IR Sender
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => forgetDevice(device.hostname)}
                      >
                        🗑️ Forget Sender
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Managed Devices */}
          <div className="card">
            <h2>📡 IR Senders ({managedDevices.length})</h2>

            {managedDevices.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
                <h3>No IR Senders</h3>
                <p>Add IR blasters from the discovered section above to start managing connected devices.</p>
              </div>
            ) : (
              <div className="device-grid">
                {managedDevices.map((device) => {
                  const discovery = discoveredDevices.find(d => d.hostname === device.hostname);
                  const properties = discovery?.discovery_properties;
                  const capabilities = properties?.capabilities;
                  const discoveryDump = properties
                    ? JSON.stringify(properties, null, 2)
                    : null;

                  return (
                    <div key={device.id} className="device-card">
                    <div className="device-header">
                      <div>
                        <div className="device-title">
                          {device.device_name || device.hostname}
                          <button
                            className="edit-icon"
                            onClick={() => setEditingDevice(device)}
                            title="Edit device name"
                          >
                            ✏️
                          </button>
                        </div>
                        <div className="device-subtitle">{device.hostname}</div>
                      </div>
                      <span className={`device-badge ${device.device_type}`}>
                        {device.device_type}
                      </span>
                    </div>

                    {(device.venue_name || device.location) && (
                      <div style={{ margin: '8px 0', fontSize: '14px', color: '#64748b' }}>
                        📍 {device.venue_name} {device.location && `• ${device.location}`}
                      </div>
                    )}

                    <div className="status-indicator">
                      <div className={`status-dot ${device.is_online ? 'online' : 'offline'}`} />
                      <span style={{ fontSize: '14px' }}>
                        {device.is_online ? '🟢 Online' : '🔴 Offline'} - {device.current_ip_address}
                      </span>
                    </div>

                    <div className="device-info">
                      <div>🔌 IR Ports: {device.total_ir_ports}</div>
                      <div>🕒 Last seen: {new Date(device.last_seen).toLocaleString()}</div>
                    </div>

                    {/* IR Ports Configuration */}
                    <div className="ir-ports-section">
                      <div className="section-header">
                        <h4>📺 Connected Devices</h4>
                        <button
                          className="button secondary"
                          onClick={() => setShowIRConfig(device)}
                        >
                          ⚙️ Configure Ports
                        </button>
                      </div>

                      <div className="ir-ports-grid">
                        {Array.from({ length: device.total_ir_ports }, (_, i) => {
                          const port = device.ir_ports?.find(p => p.port_number === i + 1);
                          return (
                            <div key={i + 1} className={`ir-port ${port?.is_active ? 'active' : 'inactive'}`}>
                              <div className="port-number">{port?.port_id || `Port ${i + 1}`}</div>
                              <div className="port-device">
                                {port?.connected_device_name || 'Not configured'}
                              </div>
                              {port?.device_number && (
                                <div className="port-detail">Device {port.device_number}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="button-group">
                      <button
                        className="button secondary"
                        onClick={() => syncDeviceStatus(device.id)}
                      >
                        🔄 Sync Status
                      </button>
                      <button
                        className="button danger"
                        onClick={() => removeFromManagement(device.id)}
                      >
                        🗑️ Remove
                      </button>
                    </div>
                    {capabilities && (
                      <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', border: '1px solid #dbeafe', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#1d4ed8' }}>
                          Supported Capabilities
                        </div>
                        {capabilities.brands && capabilities.brands.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Brands</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {capabilities.brands.map((brand) => (
                                <span
                                  key={brand}
                                  style={{
                                    background: '#bfdbfe',
                                    color: '#1e3a8a',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '12px',
                                    fontWeight: 500
                                  }}
                                >
                                  {brand}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {capabilities.commands && capabilities.commands.length > 0 && (
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Functions</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {capabilities.commands.map((cmd) => (
                                <span
                                  key={cmd}
                                  style={{
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    textTransform: 'capitalize'
                                  }}
                                >
                                  {cmd.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {!capabilities && properties && (
                      <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#475569' }}>
                          Device Snapshot
                        </div>
                        <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155' }}>
                          {(properties as any)?.project_name && (
                            <div><strong>Project:</strong> {String((properties as any).project_name)}</div>
                          )}
                          {(properties as any)?.project_version && (
                            <div><strong>Firmware:</strong> {String((properties as any).project_version)}</div>
                          )}
                          {(properties as any)?.version && (
                            <div><strong>ESPHome:</strong> {String((properties as any).version)}</div>
                          )}
                          {(properties as any)?.friendly_name && (
                            <div><strong>Reported Name:</strong> {String((properties as any).friendly_name)}</div>
                          )}
                          {(properties as any)?.board && (
                            <div><strong>Board:</strong> {String((properties as any).board)}</div>
                          )}
                          {(properties as any)?.mac && (
                            <div><strong>MAC:</strong> {String((properties as any).mac)}</div>
                          )}
                          {!(properties as any)?.project_name && !(properties as any)?.project_version && !(properties as any)?.version && (
                            <div>No capability payload available yet.</div>
                          )}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                          Trigger "Sync Status" or re-adopt to capture supported brands/functions.
                        </div>
                      </div>
                    )}
                    {discoveryDump && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: '#334155' }}>
                          Discovered Metadata
                        </div>
                        <pre
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5f5',
                            borderRadius: '8px',
                            padding: '12px',
                            fontSize: '12px',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >{discoveryDump}</pre>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* YAML Builder Page */}
      {currentPage === 'yaml-builder' && (
        <div className="yaml-builder-page">
          <div className="page-header">
            <h2>🧪 ESPHome YAML Builder</h2>
            <p>Craft D1 Mini firmware templates by pairing SmartVenue ports with IR libraries.</p>
          </div>

          {builderError && (
            <div className="builder-error">⚠️ {builderError}</div>
          )}

          {builderLoading && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="loading">Preparing template workspace...</div>
            </div>
          )}

          {!builderLoading && (
            <div className="builder-content">
              <div className="builder-left">
                <div className="card hierarchy-card">
                  <div className="card-header">
                    <h3>Device Library</h3>
                    <p>Select up to two device profiles to include in this build.</p>
                  </div>
                  <div className="hierarchy-scroll">
                    {templateCategories.length === 0 ? (
                      <div className="empty-state">No IR libraries available yet.</div>
                    ) : (
                      templateCategories.map((category) => (
                        <details key={category.name} className="hierarchy-category" open>
                          <summary>{category.name}</summary>
                          {category.brands.map((brand) => (
                            <details key={`${category.name}-${brand.name}`} className="hierarchy-brand">
                              <summary>{brand.name}</summary>
                              <ul>
                                {brand.libraries.map((library) => {
                                  const alreadySelected = selectedLibraries.some((item) => item.id === library.id);
                                  return (
                                    <li key={library.id}>
                                      <button
                                        className="hierarchy-select"
                                        onClick={() => handleSelectLibrary(library)}
                                        disabled={alreadySelected || selectedLibraries.length >= 2}
                                      >
                                        ➕ {library.name}
                                        {library.model ? ` (${library.model})` : ''}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </details>
                          ))}
                        </details>
                      ))
                    )}
                  </div>
                </div>

                <div className="card selected-card">
                  <div className="card-header">
                    <h3>Selected Devices ({selectedLibraries.length}/2)</h3>
                  </div>
                  {selectedLibraries.length === 0 ? (
                    <p className="muted">Pick up to two IR libraries to assign across the five ports.</p>
                  ) : (
                    <ul className="selected-list">
                      {selectedLibraries.map((library) => (
                        <li key={library.id}>
                          <div>
                            <div className="selected-name">{library.name}</div>
                            <div className="selected-meta">{library.brand} • {library.device_category}</div>
                          </div>
                          <button className="button secondary" onClick={() => handleRemoveLibrary(library.id)}>
                            ✖ Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="card mapping-card">
                  <div className="card-header">
                    <h3>Port Mapping</h3>
                    <p>Assign each SmartVenue IR port to a selected device.</p>
                  </div>
                  <table className="port-table">
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portAssignments.map((assignment, index) => (
                        <tr key={index}>
                          <td>Port {index + 1}</td>
                          <td>
                            <select
                              value={assignment ?? ''}
                              onChange={(e) => handlePortAssignmentChange(index, e.target.value)}
                            >
                              <option value="">Unused</option>
                              {selectedLibraries.map((library) => (
                                <option key={library.id} value={library.id}>
                                  {library.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="builder-right">
                <div className="card preview-card">
              <div className="preview-header">
                <div className="char-count">Character Count: {yamlPreview ? yamlCharCount : baseTemplate.length}</div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeComments}
                    onChange={(e) => setIncludeComments(e.target.checked)}
                  />
                  Include Comments
                </label>
                <button
                  className="button secondary"
                  style={{ marginLeft: 'auto' }}
                  onClick={async () => {
                    const text = (yamlPreview || baseTemplate || '').trim();
                    if (!text) {
                      return;
                    }
                    const success = await copyTextToClipboard(text);
                    if (!success) {
                      setBuilderError('Failed to copy YAML to clipboard.');
                    }
                  }}
                >
                  📋 Copy YAML
                </button>
                <button
                  className="button"
                  style={{ marginLeft: '8px' }}
                  onClick={handleSaveYaml}
                >
                  💾 Download YAML
                </button>
                <button
                  className="button"
                  style={{ marginLeft: '8px' }}
                  onClick={handleSaveYamlToServer}
                >
                  🌐 Save to Server
                </button>
                <button
                  className="button"
                  style={{ marginLeft: '8px' }}
                  onClick={handleCompile}
                  disabled={compileLoading}
                >
                  {compileLoading ? 'Compiling…' : '⚙️ Compile'}
                </button>
              </div>
              {previewLoading && <div className="preview-loading">Rendering preview...</div>}
              <pre className="yaml-preview">{(yamlPreview || baseTemplate || '# Template loading...')}</pre>
              {compileOutput && (
                <details className="compile-output" open>
                  <summary>
                    Compilation Output
                    {downloadUrl && binaryFilename && (
                      <a
                        href={downloadUrl}
                        download={binaryFilename}
                        className="download-btn"
                        style={{ marginLeft: '12px', fontSize: '14px' }}
                      >
                        📦 Download {binaryFilename}
                      </a>
                    )}
                  </summary>
                  <pre ref={compileOutputRef}>{compileOutput}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Settings Page */}
      {currentPage === 'settings' && (
        <div className="settings-page">
          <div className="page-header">
            <h2>⚙️ Settings</h2>
            <p>Manage templates and system-wide configuration</p>
          </div>

          {/* Settings Tabs */}
          <div className="settings-tabs">
            <button
              className={`settings-tab ${settingsTab === 'yaml-templates' ? 'active' : ''}`}
              onClick={() => setSettingsTab('yaml-templates')}
            >
              📄 YAML Templates
            </button>
            <button
              className={`settings-tab ${settingsTab === 'tag-management' ? 'active' : ''}`}
              onClick={() => setSettingsTab('tag-management')}
            >
              🏷️ Tag Management
            </button>
            <button
              className={`settings-tab ${settingsTab === 'channels' ? 'active' : ''}`}
              onClick={() => setSettingsTab('channels')}
            >
              📺 Channels
            </button>
          </div>

          {/* YAML Templates Tab */}
          {settingsTab === 'yaml-templates' && (
            <div className="card">
            <div className="card-header">
              <h3>📄 ESPHome Templates</h3>
              <p>Select templates stored in the builder and edit their YAML in place.</p>
            </div>

            {templateListLoading && templateSummaries.length === 0 ? (
              <div className="loading">Loading templates...</div>
            ) : templateSummaries.length === 0 ? (
              settingsTemplateError ? (
                <div className="builder-error">⚠️ {settingsTemplateError}</div>
              ) : (
                <div className="empty-state">
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                  <h3>No Templates Found</h3>
                  <p>Seed a template through the YAML builder to edit it here.</p>
                </div>
              )
            ) : (
              <>
                <div className="form-group">
                  <label>Select Template:</label>
                  <select
                    value={settingsTemplateId ?? ''}
                    onChange={async (event) => {
                      const nextId = Number(event.target.value);
                      if (!nextId || nextId === settingsTemplateId) {
                        return;
                      }
                      await loadTemplateYaml(nextId);
                    }}
                  >
                    <option value="" disabled>
                      Select a template...
                    </option>
                    {templateSummaries.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} v{template.version} (r{template.revision})
                        {template.description ? ` — ${template.description}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {settingsTemplateError && (
                  <div className="builder-error">⚠️ {settingsTemplateError}</div>
                )}

                <div className="template-credentials-grid">
                  <div className="form-group">
                    <label className="credential-label">
                      Wi-Fi SSID
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setWifiEditable((prev) => !prev)}
                        title={wifiEditable ? 'Lock SSID field' : 'Edit SSID'}
                        disabled={settingsTemplateLoading || settingsTemplateSaving}
                      >
                        <span role="img" aria-label={wifiEditable ? 'Lock SSID field' : 'Edit SSID'}>
                          {wifiEditable ? '🔒' : '✏️'}
                        </span>
                      </button>
                    </label>
                    <input
                      value={wifiSsid}
                      onChange={(event) => {
                        if (!wifiEditable) {
                          return;
                        }
                        const value = event.target.value;
                        setWifiSsid(value);
                        setTemplateFeedbackMessage(null);
                        setSettingsTemplateError(null);
                        let updated = updateYamlSubstitution(settingsTemplateYaml, 'wifi_ssid', value);
                        updated = ensureWifiHiddenBinding(updated);
                        if (updated !== settingsTemplateYaml) {
                          setSettingsTemplateYaml(updated);
                          setSettingsTemplateDirty(true);
                        }
                      }}
                      placeholder="e.g., Venue WiFi"
                      disabled={settingsTemplateLoading || settingsTemplateSaving || !wifiEditable}
                    />
                  </div>
                  <div className="form-group">
                    <label className="credential-label">Wi-Fi Password</label>
                    <input
                      type="password"
                      value={wifiPassword}
                      onChange={(event) => {
                        if (!wifiEditable) {
                          return;
                        }
                        const value = event.target.value;
                        setWifiPassword(value);
                        setTemplateFeedbackMessage(null);
                        setSettingsTemplateError(null);
                        let updated = updateYamlSubstitution(settingsTemplateYaml, 'wifi_password', value);
                        updated = ensureWifiHiddenBinding(updated);
                        if (updated !== settingsTemplateYaml) {
                          setSettingsTemplateYaml(updated);
                          setSettingsTemplateDirty(true);
                        }
                      }}
                      placeholder="Wi-Fi password"
                      disabled={settingsTemplateLoading || settingsTemplateSaving || !wifiEditable}
                    />
                  </div>
                  <div className="form-group">
                    <label className="credential-label">Hidden SSID</label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={wifiHidden}
                        onChange={(event) => {
                          if (!wifiEditable || settingsTemplateLoading || settingsTemplateSaving) {
                            return;
                          }
                          const checked = event.target.checked;
                          setWifiHidden(checked);
                          setTemplateFeedbackMessage(null);
                          setSettingsTemplateError(null);
                          let updated = updateYamlSubstitution(settingsTemplateYaml, 'wifi_hidden', checked ? 'true' : 'false', false);
                          updated = ensureWifiHiddenBinding(updated);
                          if (updated !== settingsTemplateYaml) {
                            setSettingsTemplateYaml(updated);
                            setSettingsTemplateDirty(true);
                          }
                        }}
                        disabled={settingsTemplateLoading || settingsTemplateSaving || !wifiEditable}
                      />
                      <span>{wifiHidden ? 'SSID hidden' : 'Broadcast SSID'}</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="credential-label">
                      ESPHome API Key
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setApiKeyEditable((prev) => !prev)}
                        title={apiKeyEditable ? 'Lock API key field' : 'Edit API key'}
                        disabled={settingsTemplateLoading || settingsTemplateSaving}
                      >
                        <span role="img" aria-label={apiKeyEditable ? 'Lock API key field' : 'Edit API key'}>
                          {apiKeyEditable ? '🔒' : '✏️'}
                        </span>
                      </button>
                    </label>
                    <input
                      value={apiKey}
                      onChange={(event) => {
                        if (!apiKeyEditable) {
                          return;
                        }
                        const value = event.target.value;
                        setApiKey(value);
                          setTemplateFeedbackMessage(null);
                          setSettingsTemplateError(null);
                          const updated = updateYamlSubstitution(settingsTemplateYaml, 'api_key', value);
                        if (updated !== settingsTemplateYaml) {
                          setSettingsTemplateYaml(updated);
                          setSettingsTemplateDirty(true);
                        }
                      }}
                      placeholder="ESPHome API key"
                      disabled={settingsTemplateLoading || settingsTemplateSaving || !apiKeyEditable}
                    />
                  </div>
                  <div className="form-group">
                    <label className="credential-label">
                      OTA Password
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setOtaEditable((prev) => !prev)}
                        title={otaEditable ? 'Lock OTA password field' : 'Edit OTA password'}
                        disabled={settingsTemplateLoading || settingsTemplateSaving}
                      >
                        <span role="img" aria-label={otaEditable ? 'Lock OTA password field' : 'Edit OTA password'}>
                          {otaEditable ? '🔒' : '✏️'}
                        </span>
                      </button>
                    </label>
                    <input
                      type="password"
                      value={otaPassword}
                      onChange={(event) => {
                        if (!otaEditable) {
                          return;
                        }
                        const value = event.target.value;
                        setOtaPassword(value);
                        setTemplateFeedbackMessage(null);
                        setSettingsTemplateError(null);
                        const updated = updateYamlSubstitution(settingsTemplateYaml, 'ota_password', value);
                        if (updated !== settingsTemplateYaml) {
                          setSettingsTemplateYaml(updated);
                          setSettingsTemplateDirty(true);
                        }
                      }}
                      placeholder="Optional OTA password"
                      disabled={settingsTemplateLoading || settingsTemplateSaving || !otaEditable}
                    />
                  </div>
                </div>

                {/* Version Control Options */}
                <div className="version-control-section">
                  <h4>📝 Version Control</h4>
                  <div className="version-control-grid">
                    <div className="form-group">
                      <label>Version Increment:</label>
                      <select
                        value={versionIncrement}
                        onChange={(e) => setVersionIncrement(e.target.value as 'major' | 'minor' | 'patch')}
                        disabled={settingsTemplateLoading || settingsTemplateSaving}
                      >
                        <option value="patch">Patch (x.x.+1) - Bug fixes</option>
                        <option value="minor">Minor (x.+1.0) - New features</option>
                        <option value="major">Major (+1.0.0) - Breaking changes</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={testCompile}
                          onChange={(e) => setTestCompile(e.target.checked)}
                          disabled={settingsTemplateLoading || settingsTemplateSaving}
                        />
                        Test compile before saving
                      </label>
                    </div>
                  </div>
                </div>

                <div className="preview-card">
                  <div className="preview-header">
                    <div className="char-count">Character Count: {settingsTemplateYaml.length}</div>
                    {templateFeedbackMessage && (
                      <span className="yaml-copy-success">{templateFeedbackMessage}</span>
                    )}
                    <button
                      className="button"
                      style={{ marginLeft: 'auto' }}
                      onClick={saveTemplateYaml}
                      disabled={
                        settingsTemplateLoading ||
                        settingsTemplateSaving ||
                        !settingsTemplateDirty
                      }
                    >
                      {settingsTemplateSaving ? 'Saving…' : '💾 Save Template'}
                    </button>
                    <button
                      className="button secondary"
                      style={{ marginLeft: '8px' }}
                      onClick={async () => {
                        if (!settingsTemplateYaml.trim()) {
                          return;
                        }
                        const success = await copyTextToClipboard(settingsTemplateYaml);
                        if (!success) {
                          setSettingsTemplateError('Failed to copy YAML to clipboard.');
                        } else {
                          setSettingsTemplateError((prev) =>
                            prev === 'Failed to copy YAML to clipboard.' ? null : prev
                          );
                          setTemplateFeedbackMessage('YAML copied to clipboard.');
                        }
                      }}
                      disabled={
                        settingsTemplateLoading ||
                        settingsTemplateSaving ||
                        !settingsTemplateYaml.trim()
                      }
                    >
                      📋 Copy YAML
                    </button>
                  </div>

                  {settingsTemplateLoading ? (
                    <div className="preview-loading">Loading template...</div>
                  ) : (
                    <textarea
                      className="yaml-editor"
                      value={settingsTemplateYaml}
                      onChange={(event) => {
                        setSettingsTemplateYaml(event.target.value);
                        setSettingsTemplateDirty(true);
                        setTemplateFeedbackMessage(null);
                        setSettingsTemplateError(null);
                        updateCredentialsFromYaml(event.target.value);
                      }}
                      spellCheck={false}
                      disabled={settingsTemplateLoading || settingsTemplateSaving}
                    />
                  )}
                </div>

                <p className="muted" style={{ marginTop: 12 }}>
                  Edits here are local for collaboration. Use the copy button to export your changes.
                </p>
              </>
            )}
            </div>
          )}

          {/* Tag Management Tab */}
          {settingsTab === 'tag-management' && (
            <div className="card">
            <div className="card-header">
              <h3>🏷️ Device Tags</h3>
              <p>Create and manage tags for organizing your devices</p>
              <button
                className="button"
                onClick={() => setEditingTag({ id: 0, name: '', color: '#3b82f6', description: '', usage_count: 0, created_at: '', updated_at: '' })}
              >
                ➕ Add New Tag
              </button>
            </div>

            {settingsLoading ? (
              <div className="loading">Loading tags...</div>
            ) : deviceTags.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</div>
                <h3>No Tags Yet</h3>
                <p>Create tags to organize and group your devices for easier management.</p>
              </div>
            ) : (
              <div className="tags-display">
                <div className="tags-container">
                  {deviceTags.map(tag => (
                    <div key={tag.id} className="interactive-tag-wrapper">
                      <div
                        className="interactive-tag"
                        style={{
                          backgroundColor: tag.color || '#6b7280',
                          color: '#ffffff'
                        }}
                        onClick={() => setEditingTag(tag)}
                        title={`Click to edit "${tag.name}"`}
                      >
                        <span className="tag-name">{tag.name}</span>
                        <span className="tag-count">({tag.usage_count})</span>
                      </div>
                      <button
                        className="tag-delete-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete tag "${tag.name}"? This will remove it from all devices.`)) {
                            await deleteDeviceTag(tag.id);
                          }
                        }}
                        title={`Delete "${tag.name}" tag`}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                {/* Tag Details */}
                <div className="tag-details">
                  <h4>Tag Details</h4>
                  <p>Click on any tag above to edit its name, color, and description.</p>
                  <div className="tag-stats">
                    <div className="stat">
                      <span className="stat-label">Total Tags:</span>
                      <span className="stat-value">{deviceTags.length}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Total Devices Tagged:</span>
                      <span className="stat-value">{deviceTags.reduce((sum, tag) => sum + tag.usage_count, 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          {/* Channels Tab */}
          {settingsTab === 'channels' && (
            <div className="card">
              <div className="card-header">
                <h3>📺 Channel Management</h3>
                <p>Configure local Australian TV channels for your area</p>
              </div>

              {/* Channel Sub-Tabs */}
              <div className="channel-tabs">
                <button
                  className={`channel-tab ${channelTab === 'area-selection' ? 'active' : ''}`}
                  onClick={() => setChannelTab('area-selection')}
                >
                  📍 Area Selection
                </button>
                <button
                  className={`channel-tab ${channelTab === 'channel-list' ? 'active' : ''}`}
                  onClick={() => setChannelTab('channel-list')}
                >
                  📋 Channel List
                </button>
                <button
                  className={`channel-tab ${channelTab === 'inhouse-channels' ? 'active' : ''}`}
                  onClick={() => setChannelTab('inhouse-channels')}
                >
                  🏠 InHouse Channels
                </button>
              </div>

              {/* Area Selection Tab */}
              {channelTab === 'area-selection' && (
                <div className="channel-tab-content">
                  {/* Area Selector */}
                  {areas.length > 0 && (
                    <div className="area-selector">
                      <h4>📍 Select Your Area</h4>
                      <p>Choose your location to enable local channels for your area</p>

                      <div className="area-controls">
                        <div className="area-categories">

                          {/* Nationwide */}
                          {areas.filter(a => a.type === 'nationwide').map(area => (
                            <div key={area.name} className="area-category nationwide">
                              <div className="area-header">
                                <h5>🌏 {area.name}</h5>
                                <span className="channel-count">{area.channel_count} channels</span>
                              </div>
                              <div className="area-actions">
                                <button
                                  className="button small"
                                  onClick={() => updateAreaChannels(area.name, { disabled: false })}
                                >
                                  Enable Nationwide
                                </button>
                                <button
                                  className="button small secondary"
                                  onClick={() => updateAreaChannels(area.name, { disabled: true })}
                                >
                                  Disable
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* National (Foxtel) */}
                          {areas.filter(a => a.type === 'national').map(area => (
                            <div key={area.name} className="area-category national">
                              <div className="area-header">
                                <h5>📡 {area.name}</h5>
                                <span className="channel-count">{area.channel_count} channels</span>
                              </div>
                              <div className="area-actions">
                                <button
                                  className="button small"
                                  onClick={() => updateAreaChannels(area.name, { disabled: false })}
                                >
                                  Enable Foxtel
                                </button>
                                <button
                                  className="button small secondary"
                                  onClick={() => updateAreaChannels(area.name, { disabled: true })}
                                >
                                  Disable
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Regional Areas by State */}
                          {['NSW', 'VIC'].map(state => {
                            const stateAreas = areas.filter(a => (a.type === 'metro' || a.type === 'regional') && a.state === state);
                            if (stateAreas.length === 0) return null;

                            return (
                              <div key={state} className="state-section">
                                <h5 className="state-header">📍 {state} Areas</h5>

                                <div className="areas-grid">
                                  {stateAreas.map(area => (
                                    <div key={area.name} className={`area-card ${area.type}`}>
                                      <div className="area-info">
                                        <h6>{area.name}</h6>
                                        <span className="area-type">{area.type === 'metro' ? 'Metro' : 'Regional'}</span>
                                        <span className="channel-count">{area.channel_count} channels</span>
                                      </div>

                                      {/* Cities dropdown for regional areas */}
                                      {area.cities.length > 0 && (
                                        <div className="cities-section">
                                          <details className="cities-dropdown">
                                            <summary>Cities ({area.cities.length})</summary>
                                            <div className="cities-list">
                                              {area.cities.map(city => (
                                                <div key={city} className="city-item">
                                                  <span>{city}</span>
                                                  <button
                                                    className="button tiny"
                                                    onClick={() => updateCityChannels(city, { disabled: false })}
                                                    title={`Enable channels for ${city}`}
                                                  >
                                                    Enable
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          </details>
                                        </div>
                                      )}

                                      <div className="area-actions">
                                        <button
                                          className="button small"
                                          onClick={() => updateAreaChannels(area.name, { disabled: false })}
                                        >
                                          Enable Area
                                        </button>
                                        <button
                                          className="button small secondary"
                                          onClick={() => updateAreaChannels(area.name, { disabled: true })}
                                        >
                                          Disable
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Channel List Tab */}
              {channelTab === 'channel-list' && (
                <div className="channel-tab-content">
                  {/* Channel Stats */}
                  {channelStats && (
                <div className="channel-stats">
                  <div className="stat">
                    <span className="stat-label">Total Channels:</span>
                    <span className="stat-value">{channelStats.total_channels}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Enabled:</span>
                    <span className="stat-value" style={{ color: '#10b981' }}>{channelStats.enabled_channels}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Disabled:</span>
                    <span className="stat-value" style={{ color: '#f59e0b' }}>{channelStats.disabled_channels}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Platforms:</span>
                    <span className="stat-value">{channelStats.platforms.join(', ')}</span>
                  </div>
                </div>
              )}

              {/* Channel Filters */}
              <div className="channel-filters">
                <div className="filter-group">
                  <label>Search:</label>
                  <input
                    type="text"
                    value={channelFilters.search || ''}
                    onChange={(e) => setChannelFilters({...channelFilters, search: e.target.value})}
                    placeholder="Search channels..."
                  />
                </div>

                <div className="filter-group">
                  <label>Platform:</label>
                  <select
                    value={channelFilters.platform || ''}
                    onChange={(e) => setChannelFilters({...channelFilters, platform: e.target.value || undefined})}
                  >
                    <option value="">All Platforms</option>
                    {channelStats?.platforms.map(platform => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={channelFilters.enabled_only}
                      onChange={(e) => setChannelFilters({...channelFilters, enabled_only: e.target.checked})}
                    />
                    Show enabled only
                  </label>
                </div>
              </div>

              {/* Platform Quick Actions */}
              {channelStats && (
                <div className="platform-actions">
                  <h4>Quick Platform Actions:</h4>
                  <div className="platform-buttons">
                    {channelStats.platforms.map(platform => (
                      <div key={platform} className="platform-group">
                        <span className="platform-name">{platform}</span>
                        <button
                          className="button small"
                          onClick={() => updatePlatformChannels(platform, { disabled: false })}
                        >
                          Enable All
                        </button>
                        <button
                          className="button small secondary"
                          onClick={() => updatePlatformChannels(platform, { disabled: true })}
                        >
                          Disable All
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk Actions */}
              {selectedChannels.size > 0 && (
                <div className="bulk-actions">
                  <span>{selectedChannels.size} channels selected</span>
                  <button
                    className="button"
                    onClick={() => bulkUpdateChannels(Array.from(selectedChannels), { disabled: false })}
                  >
                    Enable Selected
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => bulkUpdateChannels(Array.from(selectedChannels), { disabled: true })}
                  >
                    Disable Selected
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setSelectedChannels(new Set())}
                  >
                    Clear Selection
                  </button>
                </div>
              )}

              {/* Channels List */}
              {channelsLoading ? (
                <div className="loading">Loading channels...</div>
              ) : channels.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📺</div>
                  <h3>No Channels Found</h3>
                  <p>No channels match your current filters.</p>
                </div>
              ) : (
                <div className="channels-list">
                  <div className="channels-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={channels.length > 0 && selectedChannels.size === channels.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedChannels(new Set(channels.map(c => c.id)));
                          } else {
                            setSelectedChannels(new Set());
                          }
                        }}
                      />
                      Select All ({channels.length} channels)
                    </label>
                  </div>

                  <div className="channels-grid">
                    {channels.map(channel => (
                      <div
                        key={channel.id}
                        className={`channel-card ${channel.disabled ? 'disabled' : 'enabled'}`}
                      >
                        <div className="channel-header">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedChannels.has(channel.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedChannels);
                                if (e.target.checked) {
                                  newSelected.add(channel.id);
                                } else {
                                  newSelected.delete(channel.id);
                                }
                                setSelectedChannels(newSelected);
                              }}
                            />
                          </label>

                          {channel.local_logo_path ? (
                            <img
                              src={`/${channel.local_logo_path}`}
                              alt={channel.channel_name}
                              className="channel-logo"
                              onError={(e) => {
                                // Fallback to text if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'block';
                              }}
                            />
                          ) : null}

                          <div className="channel-logo-fallback" style={{ display: channel.local_logo_path ? 'none' : 'block' }}>
                            {channel.channel_name.substring(0, 3).toUpperCase()}
                          </div>

                          <div className="channel-info">
                            <h4>{channel.channel_name}</h4>
                            <p>{channel.broadcaster_network}</p>
                            {channel.lcn && <span className="lcn">LCN: {channel.lcn}</span>}
                          </div>
                        </div>

                        <div className="channel-details">
                          <div className="detail-row">
                            <span>Platform:</span>
                            <span>{channel.platform}</span>
                          </div>
                          {channel.format && (
                            <div className="detail-row">
                              <span>Format:</span>
                              <span>{channel.format}</span>
                            </div>
                          )}
                          {channel.availability && (
                            <div className="detail-row">
                              <span>Availability:</span>
                              <span>{channel.availability}</span>
                            </div>
                          )}
                        </div>

                        <div className="channel-actions">
                          <button
                            className={`button ${channel.disabled ? '' : 'secondary'}`}
                            onClick={() => updateChannel(channel.id, { disabled: !channel.disabled })}
                          >
                            {channel.disabled ? 'Enable' : 'Disable'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </div>
              )}

              {/* InHouse Channels Tab */}
              {channelTab === 'inhouse-channels' && (
                <div className="channel-tab-content">
                  <div className="inhouse-header">
                    <h4>🏠 InHouse Channels</h4>
                    <p>Create custom channels for your venue (Keno, advertising, food menus, etc.)</p>
                    <button
                      className="button"
                      onClick={() => {
                        setEditingInhouseChannel(null);
                        setShowInhouseModal(true);
                      }}
                    >
                      ➕ Add InHouse Channel
                    </button>
                  </div>

                  {inhouseLoading ? (
                    <div className="loading">Loading InHouse channels...</div>
                  ) : inhouseChannels.length === 0 ? (
                    <div className="empty-state">
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏠</div>
                      <h3>No InHouse Channels</h3>
                      <p>Create custom channels for your venue needs.</p>
                    </div>
                  ) : (
                    <div className="channels-list">
                      <div className="channels-grid">
                        {inhouseChannels.map(channel => (
                          <div
                            key={channel.id}
                            className={`channel-card ${channel.disabled ? 'disabled' : 'enabled'}`}
                          >
                            <div className="channel-header">
                              <div className="channel-logo-fallback">
                                {channel.channel_name.substring(0, 3).toUpperCase()}
                              </div>

                              <div className="channel-info">
                                <h4>{channel.channel_name}</h4>
                                <p>InHouse</p>
                                {channel.lcn && <span className="lcn">Ch: {channel.lcn}</span>}
                                {channel.programming_content && (
                                  <span className="description">{channel.programming_content}</span>
                                )}
                              </div>
                            </div>

                            <div className="channel-details">
                              <div className="detail-row">
                                <span>Type:</span>
                                <span>InHouse Channel</span>
                              </div>
                              <div className="detail-row">
                                <span>Status:</span>
                                <span style={{ color: channel.disabled ? '#f59e0b' : '#10b981' }}>
                                  {channel.disabled ? 'Disabled' : 'Enabled'}
                                </span>
                              </div>
                            </div>

                            <div className="channel-actions">
                              <button
                                className="button small"
                                onClick={() => {
                                  setEditingInhouseChannel(channel);
                                  setShowInhouseModal(true);
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                className={`button small ${channel.disabled ? '' : 'secondary'}`}
                                onClick={() => updateInhouseChannel(channel.id, { disabled: !channel.disabled })}
                              >
                                {channel.disabled ? 'Enable' : 'Disable'}
                              </button>
                              <button
                                className="button small danger"
                                onClick={() => {
                                  if (confirm(`Delete "${channel.channel_name}"?`)) {
                                    deleteInhouseChannel(channel.id);
                                  }
                                }}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Tag Edit Modal */}
      {editingTag && (
        <div className="modal-overlay" onClick={() => setEditingTag(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTag.id === 0 ? 'Create New Tag' : 'Edit Tag'}</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              const name = formData.get('name') as string;
              const color = formData.get('color') as string;
              const description = formData.get('description') as string;

              let success = false;
              if (editingTag.id === 0) {
                success = await createDeviceTag(name, color, description);
              } else {
                success = await updateDeviceTag(editingTag.id, name, color, description);
              }

              if (success) {
                setEditingTag(null);
              }
            }}>
              <div className="form-group">
                <label>Tag Name:</label>
                <input
                  name="name"
                  defaultValue={editingTag.name}
                  placeholder="e.g., Sports TVs, Main Area, Background Music"
                  required
                />
              </div>
              <div className="form-group">
                <label>Color:</label>
                <div className="color-picker-container">
                  <input
                    name="color"
                    type="color"
                    defaultValue={editingTag.color || '#3b82f6'}
                    className="color-picker-input"
                    onChange={(e) => {
                      const preview = document.querySelector('.color-preview') as HTMLElement;
                      if (preview) {
                        preview.style.backgroundColor = e.target.value;
                      }
                    }}
                  />
                  <div
                    className="color-preview"
                    style={{ backgroundColor: editingTag.color || '#3b82f6' }}
                  >
                    <span className="preview-text">Preview</span>
                  </div>
                  <div className="color-presets">
                    {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'].map(color => (
                      <button
                        key={color}
                        type="button"
                        className="color-preset"
                        style={{ backgroundColor: color }}
                        onClick={(e) => {
                          const input = e.currentTarget.parentElement?.parentElement?.querySelector('input[type="color"]') as HTMLInputElement;
                          const preview = e.currentTarget.parentElement?.parentElement?.querySelector('.color-preview') as HTMLElement;
                          if (input && preview) {
                            input.value = color;
                            preview.style.backgroundColor = color;
                          }
                        }}
                        title={`Set color to ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Description (optional):</label>
                <textarea
                  name="description"
                  defaultValue={editingTag.description || ''}
                  placeholder="Brief description of this tag's purpose..."
                />
              </div>
              <div className="modal-buttons">
                <button type="button" className="button secondary" onClick={() => setEditingTag(null)}>
                  Cancel
                </button>
                <button type="submit" className="button">
                  {editingTag.id === 0 ? 'Create Tag' : 'Update Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* InHouse Channel Modal */}
      {showInhouseModal && (
        <div className="modal-overlay" onClick={() => setShowInhouseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingInhouseChannel ? 'Edit InHouse Channel' : 'Create InHouse Channel'}</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              const channel_name = formData.get('channel_name') as string;
              const channel_number = formData.get('channel_number') as string;
              const description = formData.get('description') as string;
              const logo_url = formData.get('logo_url') as string;
              const disabled = formData.get('disabled') === 'on';

              let success = false;
              if (editingInhouseChannel) {
                success = await updateInhouseChannel(editingInhouseChannel.id, {
                  channel_name,
                  channel_number,
                  description: description || undefined,
                  logo_url: logo_url || undefined,
                  disabled
                });
              } else {
                success = await createInhouseChannel({
                  channel_name,
                  channel_number,
                  description: description || undefined,
                  logo_url: logo_url || undefined,
                  disabled
                });
              }

              if (success) {
                setShowInhouseModal(false);
                setEditingInhouseChannel(null);
              }
            }}>
              <div className="form-group">
                <label>Channel Name:</label>
                <input
                  name="channel_name"
                  defaultValue={editingInhouseChannel?.channel_name || ''}
                  placeholder="e.g., Keno, Food Menu, Advertising"
                  required
                />
              </div>
              <div className="form-group">
                <label>Channel Number:</label>
                <input
                  name="channel_number"
                  defaultValue={editingInhouseChannel?.lcn || ''}
                  placeholder="e.g., 100, 101, 102"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional):</label>
                <textarea
                  name="description"
                  defaultValue={editingInhouseChannel?.programming_content || ''}
                  placeholder="Brief description of this channel's content..."
                />
              </div>
              <div className="form-group">
                <label>Logo URL (optional):</label>
                <input
                  name="logo_url"
                  type="url"
                  defaultValue={editingInhouseChannel?.logo_url || ''}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    name="disabled"
                    type="checkbox"
                    defaultChecked={editingInhouseChannel?.disabled || false}
                  />
                  Start disabled
                </label>
              </div>
              <div className="modal-buttons">
                <button type="button" className="button secondary" onClick={() => setShowInhouseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button">
                  {editingInhouseChannel ? 'Update Channel' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {editingDevice && (
        <div className="modal-overlay" onClick={() => setEditingDevice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Device</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              updateDevice(editingDevice.id, {
                device_name: formData.get('device_name') as string,
                location: formData.get('location') as string,
                notes: formData.get('notes') as string
              });
            }}>
              <div className="form-group">
                <label>Device Name:</label>
                <input
                  name="device_name"
                  defaultValue={editingDevice.device_name || ''}
                  placeholder="e.g., Main Bar TV Controller"
                />
              </div>
              <div className="form-group">
                <label>Location:</label>
                <input
                  name="location"
                  defaultValue={editingDevice.location || ''}
                  placeholder="e.g., Main Bar, Sports Area, Back Room"
                />
              </div>
              <div className="form-group">
                <label>Notes:</label>
                <textarea
                  name="notes"
                  defaultValue=""
                  placeholder="Installation notes..."
                />
              </div>
              <div className="modal-buttons">
                <button type="button" className="button secondary" onClick={() => setEditingDevice(null)}>
                  Cancel
                </button>
                <button type="submit" className="button">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IR Configuration Modal */}
      {showIRConfig && (() => {
        const deviceLabel = showIRConfig.device_name || showIRConfig.hostname;
        const configuredPorts = showIRConfig.ir_ports
          ? showIRConfig.ir_ports.filter(port => Boolean(port.connected_device_name)).length
          : 0;
        const activePorts = showIRConfig.ir_ports
          ? showIRConfig.ir_ports.filter(port => port.is_active !== false).length
          : 0;

        const locationOptions = Array.from(new Set(
          managedDevices
            .map(device => device.location)
            .filter((location): location is string => Boolean(location))
        ));

        return (
          <div className="modal-overlay" onClick={() => setShowIRConfig(null)}>
            <div className="modal large ir-config-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span className="modal-eyebrow">IR control suite</span>
                  <h3>📺 Configure Devices</h3>
                  <p>Tailor each IR port and keep your venue devices organized.</p>
                </div>
                <div className="ir-config-header-meta">
                  <span className="ir-config-device-name">{deviceLabel}</span>
                  <span className="ir-config-device-host">{showIRConfig.hostname}</span>
                </div>
              </div>

              <div className="ir-config-summary">
                <div className="ir-config-summary-left">
                  <div className="ir-config-summary-label">Current IP</div>
                  <div className="ir-config-summary-value">{showIRConfig.current_ip_address}</div>
                </div>
                <div className="ir-config-summary-stats">
                  <div className="ir-config-stat">
                    <span className="ir-config-stat-value">{configuredPorts}/{showIRConfig.total_ir_ports}</span>
                    <span className="ir-config-stat-label">Configured Ports</span>
                  </div>
                  <div className="ir-config-stat">
                    <span className="ir-config-stat-value">{activePorts}</span>
                    <span className="ir-config-stat-label">Active Ports</span>
                  </div>
                </div>
                <div className="ir-config-location">
                  <label htmlFor="ir-config-location-select">📍 Location</label>
                  <div className="location-selector">
                    <select
                      id="ir-config-location-select"
                      value={locationMode === 'custom' ? '__custom__' : configLocation}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '__custom__') {
                          setLocationMode('custom');
                          setConfigLocation('');
                        } else {
                          setLocationMode('existing');
                          setConfigLocation(value);
                        }
                      }}
                    >
                      <option value="">Select location...</option>
                      {locationOptions.map(location => (
                        <option key={location} value={location}>
                          {location}
                        </option>
                      ))}
                      <option value="__custom__">+ Add new location</option>
                    </select>
                    {locationMode === 'custom' && (
                      <input
                        id="ir-config-location-input"
                        type="text"
                        value={configLocation}
                        onChange={(e) => setConfigLocation(e.target.value)}
                        placeholder="New location name"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-body">
                <div className="ir-config-grid">
                  {Array.from({ length: showIRConfig.total_ir_ports }, (_, i) => {
                    const port = showIRConfig.ir_ports?.find(p => p.port_number === i + 1);
                    return (
                      <IRPortConfig
                        key={i + 1}
                        portNumber={i + 1}
                        port={port}
                        onDataChange={handlePortDataChange}
                        availableTags={deviceTags}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button className="button secondary" onClick={() => setShowIRConfig(null)}>
                  Cancel
                </button>
                <button className="button" onClick={saveIRConfiguration}>
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
