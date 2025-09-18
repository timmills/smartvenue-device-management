import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import {
  ManagedDevice,
  ManagedDeviceRequest,
  DeviceHierarchy,
  IRPort,
  DiscoveredDevice
} from '../services/api';

interface DeviceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ManagedDeviceRequest) => void;
  device?: ManagedDevice | null;
  discoveredDevice?: DiscoveredDevice | null;
  deviceHierarchy: DeviceHierarchy[];
  loading?: boolean;
}

const DeviceConfigModal: React.FC<DeviceConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  device,
  discoveredDevice,
  deviceHierarchy,
  loading = false
}) => {
  const [formData, setFormData] = useState<ManagedDeviceRequest>({
    device_name: '',
    api_key: 'uuPgF8JOAV/ZhFbDV4iS4Kwr1MV5H97p6Nk+HnpE0+g=',
    venue_name: '',
    location: '',
    notes: '',
    ir_ports: []
  });

  const isEdit = !!device;
  const deviceInfo = device || discoveredDevice;

  useEffect(() => {
    if (isOpen) {
      if (device) {
        // Editing existing device
        setFormData({
          device_name: device.device_name || '',
          api_key: device.api_key || 'uuPgF8JOAV/ZhFbDV4iS4Kwr1MV5H97p6Nk+HnpE0+g=',
          venue_name: device.venue_name || '',
          location: device.location || '',
          notes: device.notes || '',
          ir_ports: device.ir_ports.map(port => ({
            port_number: port.port_number,
            connected_device_name: port.connected_device_name || '',
            device_model_id: port.device_model_id || undefined,
            is_active: port.is_active,
            cable_length: port.cable_length || '',
            installation_notes: port.installation_notes || '',
            foxtel_box_number: port.foxtel_box_number || undefined
          }))
        });
      } else if (discoveredDevice) {
        // Adding new device
        const portCount = discoveredDevice.device_type === 'foxtel' ? 5 : 1;
        const defaultPorts = Array.from({ length: portCount }, (_, i) => ({
          port_number: i,
          connected_device_name: '',
          device_model_id: undefined,
          is_active: true,
          cable_length: '',
          installation_notes: '',
          foxtel_box_number: discoveredDevice.device_type === 'foxtel' ? i : undefined
        }));

        setFormData({
          device_name: discoveredDevice.friendly_name || discoveredDevice.hostname,
          api_key: 'uuPgF8JOAV/ZhFbDV4iS4Kwr1MV5H97p6Nk+HnpE0+g=',
          venue_name: '',
          location: '',
          notes: '',
          ir_ports: defaultPorts
        });
      }
    }
  }, [isOpen, device, discoveredDevice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const updatePort = (index: number, field: string, value: any) => {
    const updatedPorts = [...(formData.ir_ports || [])];
    updatedPorts[index] = {
      ...updatedPorts[index],
      [field]: value
    };
    setFormData({ ...formData, ir_ports: updatedPorts });
  };

  const addPort = () => {
    const maxPort = Math.max(...(formData.ir_ports?.map(p => p.port_number) || [-1]));
    const newPort = {
      port_number: maxPort + 1,
      connected_device_name: '',
      device_model_id: undefined,
      is_active: true,
      cable_length: '',
      installation_notes: '',
      foxtel_box_number: undefined
    };
    setFormData({
      ...formData,
      ir_ports: [...(formData.ir_ports || []), newPort]
    });
  };

  const removePort = (index: number) => {
    const updatedPorts = formData.ir_ports?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, ir_ports: updatedPorts });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {isEdit ? 'Configure Device' : 'Add Device to Management'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Device Info */}
            {deviceInfo && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Device Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Hostname:</span>
                    <span className="ml-2 font-mono">{deviceInfo.hostname}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">IP Address:</span>
                    <span className="ml-2">{deviceInfo.current_ip_address || deviceInfo.ip_address}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">MAC Address:</span>
                    <span className="ml-2 font-mono">{deviceInfo.mac_address}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Type:</span>
                    <span className="ml-2 capitalize">{deviceInfo.device_type}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Basic Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  value={formData.device_name}
                  onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Main Bar TV Controller"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="text"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                  placeholder="ESPHome API encryption key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Venue Name
                </label>
                <input
                  type="text"
                  value={formData.venue_name}
                  onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="The Crown Hotel"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Main Bar"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Installation notes, cable routing, etc."
              />
            </div>

            {/* IR Ports Configuration */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">IR Port Configuration</h3>
                <button
                  type="button"
                  onClick={addPort}
                  className="flex items-center space-x-2 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Port</span>
                </button>
              </div>

              <div className="space-y-4">
                {formData.ir_ports?.map((port, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">
                        Port {port.port_number}
                        {port.foxtel_box_number !== undefined &&
                          ` (Foxtel Box ${port.foxtel_box_number})`
                        }
                      </h4>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={port.is_active}
                            onChange={(e) => updatePort(index, 'is_active', e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-600">Active</span>
                        </label>
                        {formData.ir_ports && formData.ir_ports.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePort(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Connected Device Name
                        </label>
                        <input
                          type="text"
                          value={port.connected_device_name}
                          onChange={(e) => updatePort(index, 'connected_device_name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Main Bar TV"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cable Length
                        </label>
                        <input
                          type="text"
                          value={port.cable_length}
                          onChange={(e) => updatePort(index, 'cable_length', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="2m"
                        />
                      </div>

                      {deviceInfo?.device_type === 'foxtel' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Foxtel Box Number
                          </label>
                          <select
                            value={port.foxtel_box_number || ''}
                            onChange={(e) => updatePort(index, 'foxtel_box_number', e.target.value ? parseInt(e.target.value) : undefined)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="">Select box number</option>
                            {[0, 1, 2, 3, 4].map(num => (
                              <option key={num} value={num}>Box {num}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Installation Notes
                        </label>
                        <input
                          type="text"
                          value={port.installation_notes}
                          onChange={(e) => updatePort(index, 'installation_notes', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Cable routed behind bar, LED positioned at TV IR sensor"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{loading ? 'Saving...' : (isEdit ? 'Update Device' : 'Add Device')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceConfigModal;