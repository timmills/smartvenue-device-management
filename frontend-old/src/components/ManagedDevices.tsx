import React from 'react';
import { Settings, Wifi, WifiOff, MapPin, Calendar, Trash2 } from 'lucide-react';
import { ManagedDevice } from '../services/api';

interface ManagedDevicesProps {
  devices: ManagedDevice[];
  onEditDevice: (device: ManagedDevice) => void;
  onDeleteDevice: (deviceId: number) => void;
  onSyncStatus: (deviceId: number) => void;
}

const ManagedDevices: React.FC<ManagedDevicesProps> = ({
  devices,
  onEditDevice,
  onDeleteDevice,
  onSyncStatus
}) => {
  if (devices.length === 0) {
    return (
      <div className="text-center py-12">
        <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Managed Devices</h3>
        <p className="text-gray-600">
          Add devices from the discovered devices section above to start managing them.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Managed Devices ({devices.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {devices.map((device) => (
          <div
            key={device.id}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {device.device_name || device.hostname}
                </h3>
                <p className="text-sm text-gray-600">{device.hostname}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  device.device_type === 'foxtel'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {device.device_type}
                </span>
                <div className={`w-3 h-3 rounded-full ${
                  device.is_online ? 'bg-green-500' : 'bg-red-500'
                }`} title={device.is_online ? 'Online' : 'Offline'} />
              </div>
            </div>

            {/* Location & Venue */}
            {(device.venue_name || device.location) && (
              <div className="flex items-center space-x-2 mb-3">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {device.venue_name} {device.location && `• ${device.location}`}
                </span>
              </div>
            )}

            {/* Connection Details */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2">
                {device.is_online ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm text-gray-600">
                  {device.current_ip_address}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Last seen: {new Date(device.last_seen).toLocaleString()}
                </span>
              </div>
            </div>

            {/* IR Ports Summary */}
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">
                IR Ports ({device.total_ir_ports})
              </div>
              <div className="space-y-1">
                {device.ir_ports.slice(0, 3).map((port) => (
                  <div key={port.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Port {port.port_number}:</span>
                    <span className={`${port.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                      {port.connected_device_name || 'Unassigned'}
                    </span>
                  </div>
                ))}
                {device.ir_ports.length > 3 && (
                  <div className="text-xs text-gray-400">
                    +{device.ir_ports.length - 3} more ports
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => onEditDevice(device)}
                className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
              >
                Configure
              </button>
              <button
                onClick={() => onSyncStatus(device.id)}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                title="Sync Status"
              >
                <Wifi className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDeleteDevice(device.id)}
                className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                title="Remove from Management"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ManagedDevices;