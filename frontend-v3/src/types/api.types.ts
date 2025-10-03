// Device Management Types
export interface ManagedDevice {
  id: number;
  hostname: string;
  mac_address: string;
  current_ip_address: string;
  device_name?: string;
  api_key?: string;
  venue_name?: string;
  location?: string;
  total_ir_ports: number;
  firmware_version?: string;
  device_type: string;
  is_online: boolean;
  last_seen: string;
  last_ip_address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  ir_ports: IRPort[];
}

export interface IRPort {
  id: number;
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

export interface DiscoveredDevice {
  id: number;
  hostname: string;
  mac_address: string;
  ip_address: string;
  friendly_name?: string;
  device_type?: string;
  firmware_version?: string;
  discovery_properties?: Record<string, any>;
  is_managed: boolean;
  first_discovered: string;
  last_seen: string;
}

// Channel Types
export interface Channel {
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

export interface ChannelStats {
  total_channels: number;
  enabled_channels: number;
  disabled_channels: number;
  platforms: string[];
  broadcasters: string[];
}

// IR Library Types
export interface IRLibrary {
  id: number;
  brand: string;
  device_type: string;
  model?: string;
  protocol?: string;
  source?: string;
  command_count: number;
  created_at: string;
  updated_at: string;
}

export interface IRCommand {
  id: number;
  library_id: number;
  command_name: string;
  protocol: string;
  address?: string;
  command?: string;
  frequency?: number;
  duty_cycle?: number;
  data?: string;
  raw_data?: string;
  pronto?: string;
  created_at: string;
}

// Template Types
export interface ESPTemplate {
  id: number;
  name: string;
  board: string;
  description?: string;
  version: string;
  template_yaml: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceSummary {
  id: number;
  hostname: string;
  mac_address: string;
  ip_address: string;
  friendly_name?: string;
  device_type: string;
  firmware_version?: string;
  venue_name?: string;
  location?: string;
  is_online: boolean;
  last_seen: string;
  capabilities?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface IRLibrarySummary {
  id: number;
  name: string;
  brand: string;
  device_category: string;
  model?: string;
  esp_native: boolean;
  source: string;
  description?: string | null;
  import_status?: string | null;
  command_count: number;
  protocols: string[];
  updated_at?: string | null;
}

export interface IRLibraryListResponse {
  items: IRLibrarySummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface IRCommandSummary {
  id: number;
  name: string;
  protocol: string;
  category?: string | null;
  signal_data: Record<string, unknown>;
  created_at?: string | null;
}

export interface IRCommandListResponse {
  items: IRCommandSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface IRLibraryFiltersResponse {
  brands: string[];
  device_categories: string[];
  protocols: string[];
}

export interface IRCommandLibrarySummary {
  id: number;
  name: string;
  brand: string;
  device_category: string;
  esp_native: boolean;
}

export interface IRCommandWithLibrarySummary {
  id: number;
  name: string;
  protocol: string;
  category?: string | null;
  signal_data: Record<string, unknown>;
  created_at?: string | null;
  library: IRCommandLibrarySummary;
}

export interface IRCommandCatalogueResponse {
  items: IRCommandWithLibrarySummary[];
  total: number;
  page: number;
  page_size: number;
}

// Settings Types
export interface DeviceTag {
  id: number;
  name: string;
  color?: string;
  description?: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationSetting {
  key: string;
  value: any;
  description?: string;
  setting_type: 'string' | 'boolean' | 'json' | 'integer';
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Request/Response Types
export interface BulkChannelUpdateRequest {
  channel_ids: number[];
  update_data: {
    disabled?: boolean;
    internal?: boolean;
  };
}

export interface AreaChannelUpdateRequest {
  area_name: string;
  update_data: {
    disabled?: boolean;
    internal?: boolean;
  };
}

export interface DeviceHealthStatus {
  hostname: string;
  is_online: boolean;
  current_ip: string;
  mac_address: string;
  api_reachable: boolean;
  response_time_ms?: number;
  error_message?: string;
  check_timestamp: string;
}

export interface DiscoveryStatus {
  running: boolean;
  device_count: number;
  service_type: string;
}
