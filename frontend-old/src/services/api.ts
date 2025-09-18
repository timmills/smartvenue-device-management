import axios from 'axios';

const API_BASE_URL = 'http://100.93.158.19:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Device Management API
export interface DeviceType {
  id: number;
  name: string;
  description: string;
  icon: string;
}

export interface Brand {
  id: number;
  name: string;
  logo_url?: string;
}

export interface DeviceModel {
  id: number;
  name: string;
  model_number?: string;
  ir_protocol?: string;
}

export interface DeviceHierarchy {
  id: number;
  name: string;
  description: string;
  icon: string;
  brands: {
    id: number;
    name: string;
    logo_url?: string;
    models: DeviceModel[];
  }[];
}

export interface IRPort {
  id?: number;
  port_number: number;
  gpio_pin?: string;
  connected_device_name?: string;
  device_model_id?: number;
  is_active: boolean;
  cable_length?: string;
  installation_notes?: string;
  foxtel_box_number?: number;
  device_model?: DeviceModel;
}

export interface DiscoveredDevice {
  id: number;
  hostname: string;
  mac_address: string;
  ip_address: string;
  friendly_name?: string;
  device_type?: string;
  firmware_version?: string;
  is_managed: boolean;
  first_discovered: string;
  last_seen: string;
}

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

export interface ManagedDeviceRequest {
  device_name?: string;
  api_key?: string;
  venue_name?: string;
  location?: string;
  notes?: string;
  ir_ports?: Omit<IRPort, 'id' | 'gpio_pin' | 'device_model'>[];
}

// Device Management API calls
export const deviceManagementApi = {
  // Get device hierarchy
  getHierarchy: (): Promise<DeviceHierarchy[]> =>
    api.get('/management/hierarchy').then(res => res.data),

  // Discovered devices
  getDiscoveredDevices: (): Promise<DiscoveredDevice[]> =>
    api.get('/management/discovered').then(res => res.data),

  syncDiscoveredDevices: () =>
    api.post('/management/sync-discovered').then(res => res.data),

  // Managed devices
  getManagedDevices: (): Promise<ManagedDevice[]> =>
    api.get('/management/managed').then(res => res.data),

  getManagedDevice: (deviceId: number): Promise<ManagedDevice> =>
    api.get(`/management/managed/${deviceId}`).then(res => res.data),

  manageDevice: (hostname: string, deviceData: ManagedDeviceRequest): Promise<ManagedDevice> =>
    api.post(`/management/manage/${hostname}`, deviceData).then(res => res.data),

  updateManagedDevice: (deviceId: number, deviceData: ManagedDeviceRequest): Promise<ManagedDevice> =>
    api.put(`/management/managed/${deviceId}`, deviceData).then(res => res.data),

  unmanageDevice: (deviceId: number) =>
    api.delete(`/management/managed/${deviceId}`).then(res => res.data),

  syncDeviceStatus: (deviceId: number) =>
    api.post(`/management/managed/${deviceId}/sync-status`).then(res => res.data),
};

// Original device API calls
export const deviceApi = {
  startDiscovery: () =>
    api.get('/devices/discovery/start').then(res => res.data),

  getDiscoveredDevices: () =>
    api.get('/devices/discovery/devices').then(res => res.data),

  sendCommand: (hostname: string, command: any) =>
    api.post(`/devices/${hostname}/command`, command).then(res => res.data),

  sendBulkCommand: (command: any) =>
    api.post('/devices/bulk-command', command).then(res => res.data),
};

export default api;