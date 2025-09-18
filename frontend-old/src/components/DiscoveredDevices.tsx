import React from 'react';
import { Wifi, WifiOff, Plus, RefreshCw } from 'lucide-react';
import { DiscoveredDevice } from '../services/api';

interface DiscoveredDevicesProps {
  devices: DiscoveredDevice[];
  onManageDevice: (hostname: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}

const DiscoveredDevices: React.FC<DiscoveredDevicesProps> = ({
  devices,
  onManageDevice,
  onRefresh,
  loading = false
}) => {
  const unmanaged = devices.filter(device => !device.is_managed);

  if (unmanaged.length === 0) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Wifi className="h-5 w-5 text-yellow-600" />
          <h2 className="text-lg font-semibold text-yellow-800">
            Discovered Devices ({unmanaged.length})
          </h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <p className="text-yellow-700 text-sm mb-4">
        These devices were found on the network but haven't been added to management yet.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {unmanaged.map((device) => (
          <div
            key={device.hostname}
            className="bg-white rounded-lg border border-yellow-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-gray-900">{device.hostname}</h3>
                <p className="text-sm text-gray-600">{device.friendly_name}</p>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                device.device_type === 'foxtel'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {device.device_type || 'universal'}
              </span>
            </div>

            <div className="space-y-1 text-sm text-gray-600 mb-4">
              <div>IP: {device.ip_address}</div>
              <div>MAC: {device.mac_address}</div>
              {device.firmware_version && (
                <div>Version: {device.firmware_version}</div>
              )}
              <div>Discovered: {new Date(device.first_discovered).toLocaleString()}</div>
            </div>

            <button
              onClick={() => onManageDevice(device.hostname)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add to Management</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiscoveredDevices;