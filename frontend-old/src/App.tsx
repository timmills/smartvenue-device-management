import React, { useState, useEffect } from 'react';
import './index.css';

interface DiscoveredDevice {
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
}

function App() {
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = '/api/v1/management';

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

      const deviceData = {
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

  const removeFromManagement = async (deviceId: number) => {
    if (!confirm('Remove this device from management?')) return;

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
      await fetch(`${API_BASE}/managed/${deviceId}/sync-status`, {
        method: 'POST'
      });
      await fetchData();
    } catch (err) {
      setError('Failed to sync device status');
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const unmanaged = discoveredDevices.filter(device => !device.is_managed);

  if (loading && discoveredDevices.length === 0) {
    return (
      <div className="container">
        <div className="loading">
          <div>⚙️ Loading SmartVenue Device Management...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div>
          <h1>🏢 SmartVenue</h1>
          <p>Device Management System</p>
        </div>
        <div className="stats">
          <span>{managedDevices.length} managed</span>
          <span>•</span>
          <span>{unmanaged.length} discovered</span>
          <button className="button secondary refresh-button" onClick={fetchData}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error">
          ❌ {error}
        </div>
      )}

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
                    ➕ Add to Management
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Managed Devices */}
      <div className="card">
        <h2>⚙️ Managed Devices ({managedDevices.length})</h2>

        {managedDevices.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
            <h3>No Managed Devices</h3>
            <p>Add devices from the discovered section above to start managing them.</p>
          </div>
        ) : (
          <div className="device-grid">
            {managedDevices.map((device) => (
              <div key={device.id} className="device-card">
                <div className="device-header">
                  <div>
                    <div className="device-title">
                      {device.device_name || device.hostname}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;