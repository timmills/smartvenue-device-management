import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type { ManagedDevice, DiscoveredDevice } from '../../types/api.types';
import {
  WifiIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PlusIcon,
  ServerIcon
} from '@heroicons/react/24/outline';

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'discovered' | 'managed'>('discovered');
  const [editingDevice, setEditingDevice] = useState<ManagedDevice | null>(null);
  const [deviceForm, setDeviceForm] = useState({ device_name: '', venue_name: '', location: '' });
  const [editingPort, setEditingPort] = useState<{ deviceId: number; portId: number } | null>(null);
  const [portForm, setPortForm] = useState({ connected_device_name: '', is_active: true });

  // Fetch discovered devices
  const { data: discoveredDevices, isLoading: loadingDiscovered } = useQuery({
    queryKey: ['discovered-devices'],
    queryFn: async () => {
      const response = await api.get<DiscoveredDevice[]>('/api/v1/management/discovered');
      return response.data;
    },
  });

  // Fetch managed devices
  const { data: managedDevices, isLoading: loadingManaged } = useQuery({
    queryKey: ['managed-devices'],
    queryFn: async () => {
      const response = await api.get<ManagedDevice[]>('/api/v1/management/managed');
      return response.data;
    },
  });

  // Discovery status
  const { data: discoveryStatus } = useQuery({
    queryKey: ['discovery-status'],
    queryFn: async () => {
      const response = await api.get('/api/v1/devices/discovery/status');
      return response.data;
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Sync discovered devices
  const syncDiscovery = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/management/sync-discovered');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovered-devices'] });
    },
  });

  // Start/Stop discovery
  const toggleDiscovery = useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      await api.post(`/api/v1/devices/discovery/${action}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-status'] });
    },
  });

  // Manage a device
  const manageDevice = useMutation({
    mutationFn: async (hostname: string) => {
      await api.post(`/api/v1/management/manage/${hostname}`, {
        device_name: hostname,
        venue_name: 'Main Venue',
        location: 'Default',
        ir_ports: []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-devices'] });
      queryClient.invalidateQueries({ queryKey: ['discovered-devices'] });
    },
  });

  // Health check
  const performHealthCheck = useMutation({
    mutationFn: async (deviceId: number) => {
      const response = await api.post(`/api/v1/management/managed/${deviceId}/health-check`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-devices'] });
    },
  });

  // Update device
  const updateDevice = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ManagedDevice> }) => {
      await api.put(`/api/v1/management/managed/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-devices'] });
      setEditingDevice(null);
      setDeviceForm({ device_name: '', venue_name: '', location: '' });
    },
  });

  // Delete device
  const deleteDevice = useMutation({
    mutationFn: async (deviceId: number) => {
      await api.delete(`/api/v1/management/managed/${deviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-devices'] });
    },
  });

  const handleEditDevice = (device: ManagedDevice) => {
    setEditingDevice(device);
    setDeviceForm({
      device_name: device.device_name || '',
      venue_name: device.venue_name || '',
      location: device.location || ''
    });
  };

  const handleSaveDevice = () => {
    if (editingDevice) {
      updateDevice.mutate({ id: editingDevice.id, data: deviceForm });
    }
  };

  const handleCancelEdit = () => {
    setEditingDevice(null);
    setDeviceForm({ device_name: '', venue_name: '', location: '' });
  };

  // Update IR port
  const updatePort = useMutation({
    mutationFn: async ({ deviceId, portId, data }: { deviceId: number; portId: number; data: any }) => {
      await api.put(`/api/v1/management/managed/${deviceId}/ports/${portId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-devices'] });
      setEditingPort(null);
      setPortForm({ connected_device_name: '', is_active: true });
    },
  });

  const handleEditPort = (deviceId: number, port: any) => {
    setEditingPort({ deviceId, portId: port.id });
    setPortForm({
      connected_device_name: port.connected_device_name || '',
      is_active: port.is_active
    });
  };

  const handleSavePort = () => {
    if (editingPort) {
      updatePort.mutate({
        deviceId: editingPort.deviceId,
        portId: editingPort.portId,
        data: portForm
      });
    }
  };

  const handleCancelPortEdit = () => {
    setEditingPort(null);
    setPortForm({ connected_device_name: '', is_active: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Device Management</h2>
            <p className="mt-1 text-sm text-gray-600">
              Discover and manage ESPHome IR blaster devices
            </p>
          </div>

          {/* Discovery Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${discoveryStatus?.running ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-600">
                Discovery: {discoveryStatus?.running ? 'Running' : 'Stopped'}
              </span>
            </div>

            <button
              onClick={() => toggleDiscovery.mutate(discoveryStatus?.running ? 'stop' : 'start')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                discoveryStatus?.running
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {discoveryStatus?.running ? 'Stop Discovery' : 'Start Discovery'}
            </button>

            <button
              onClick={() => syncDiscovery.mutate()}
              disabled={syncDiscovery.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {syncDiscovery.isPending ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                'Sync Devices'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('discovered')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'discovered'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Discovered Devices ({discoveredDevices?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('managed')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'managed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Managed Devices ({managedDevices?.length || 0})
            </button>
          </nav>
        </div>

        {/* Discovered Devices */}
        {activeTab === 'discovered' && (
          <div className="p-6">
            {loadingDiscovered ? (
              <div className="text-center py-8">
                <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Loading devices...</p>
              </div>
            ) : discoveredDevices?.length === 0 ? (
              <div className="text-center py-8">
                <WifiIcon className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">No devices discovered</p>
                <p className="text-xs text-gray-500">Make sure discovery is running</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discoveredDevices?.map((device) => (
                  <div
                    key={device.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{device.hostname}</h3>
                        <p className="text-sm text-gray-500">{device.ip_address}</p>
                        <p className="text-xs text-gray-400">{device.mac_address}</p>
                        {device.firmware_version && (
                          <p className="text-xs text-gray-500 mt-1">FW: {device.firmware_version}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {device.is_managed ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                            Managed
                          </span>
                        ) : (
                          <button
                            onClick={() => manageDevice.mutate(device.hostname)}
                            disabled={manageDevice.isPending}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                          >
                            <PlusIcon className="w-3 h-3 mr-1" />
                            Manage
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Managed Devices */}
        {activeTab === 'managed' && (
          <div className="p-6">
            {loadingManaged ? (
              <div className="text-center py-8">
                <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Loading devices...</p>
              </div>
            ) : managedDevices?.length === 0 ? (
              <div className="text-center py-8">
                <ServerIcon className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">No managed devices</p>
                <p className="text-xs text-gray-500">Discover and add devices from the Discovered tab</p>
              </div>
            ) : (
              <div className="space-y-4">
                {managedDevices?.map((device) => (
                  <div
                    key={device.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {editingDevice?.id === device.id ? (
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={deviceForm.device_name}
                                onChange={(e) => setDeviceForm({ ...deviceForm, device_name: e.target.value })}
                                placeholder="Device name"
                                className="font-semibold text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none"
                              />
                              {device.is_online ? (
                                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircleIcon className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{device.current_ip_address}</p>
                            <p className="text-xs text-gray-400">{device.mac_address}</p>

                            <div className="space-y-2">
                              <input
                                type="text"
                                value={deviceForm.venue_name}
                                onChange={(e) => setDeviceForm({ ...deviceForm, venue_name: e.target.value })}
                                placeholder="Venue name"
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                              />
                              <input
                                type="text"
                                value={deviceForm.location}
                                onChange={(e) => setDeviceForm({ ...deviceForm, location: e.target.value })}
                                placeholder="Location"
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                              />
                            </div>

                            <div className="text-xs text-gray-500">
                              <span>{device.total_ir_ports} IR Ports</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold text-gray-900">
                                {device.device_name || device.hostname}
                              </h3>
                              {device.is_online ? (
                                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircleIcon className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{device.current_ip_address}</p>
                            <p className="text-xs text-gray-400">{device.mac_address}</p>

                            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                              <span>{device.total_ir_ports} IR Ports</span>
                              {device.venue_name && <span>• {device.venue_name}</span>}
                              {device.location && <span>• {device.location}</span>}
                            </div>
                          </>
                        )}

                        {/* IR Ports */}
                        {device.ir_ports?.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <div className="text-xs font-medium text-gray-700">IR Ports:</div>
                            {device.ir_ports.map((port) => (
                              <div key={port.id} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                                {editingPort?.deviceId === device.id && editingPort?.portId === port.id ? (
                                  <div className="flex items-center space-x-2 flex-1">
                                    <span className="text-gray-600">Port {port.port_number}:</span>
                                    <input
                                      type="text"
                                      value={portForm.connected_device_name}
                                      onChange={(e) => setPortForm({ ...portForm, connected_device_name: e.target.value })}
                                      placeholder="Device name"
                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                                    />
                                    <label className="flex items-center space-x-1">
                                      <input
                                        type="checkbox"
                                        checked={portForm.is_active}
                                        onChange={(e) => setPortForm({ ...portForm, is_active: e.target.checked })}
                                        className="w-3 h-3"
                                      />
                                      <span>Active</span>
                                    </label>
                                    <button
                                      onClick={handleSavePort}
                                      disabled={updatePort.isPending}
                                      className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={handleCancelPortEdit}
                                      className="px-2 py-1 text-xs text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center">
                                      <span className={`w-2 h-2 rounded-full mr-2 ${port.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                      <span>Port {port.port_number}: {port.connected_device_name || 'Not configured'}</span>
                                    </div>
                                    <button
                                      onClick={() => handleEditPort(device.id, port)}
                                      className="px-2 py-1 text-xs text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                                    >
                                      Edit
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {editingDevice?.id === device.id ? (
                          <>
                            <button
                              onClick={handleSaveDevice}
                              disabled={updateDevice.isPending}
                              className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditDevice(device)}
                              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => performHealthCheck.mutate(device.id)}
                              disabled={performHealthCheck.isPending}
                              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              Health
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete device "${device.device_name || device.hostname}"?`)) {
                                  deleteDevice.mutate(device.id);
                                }
                              }}
                              disabled={deleteDevice.isPending}
                              className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
