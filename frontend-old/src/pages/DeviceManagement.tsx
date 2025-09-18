import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import DiscoveredDevices from '../components/DiscoveredDevices';
import ManagedDevices from '../components/ManagedDevices';
import DeviceConfigModal from '../components/DeviceConfigModal';
import {
  deviceManagementApi,
  DiscoveredDevice,
  ManagedDevice,
  DeviceHierarchy,
  ManagedDeviceRequest
} from '../services/api';

const DeviceManagement: React.FC = () => {
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>([]);
  const [deviceHierarchy, setDeviceHierarchy] = useState<DeviceHierarchy[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ManagedDevice | null>(null);
  const [managingHostname, setManagingHostname] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadDiscoveredDevices(),
        loadManagedDevices(),
        loadDeviceHierarchy()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading device data. Please check the backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveredDevices = async () => {
    try {
      // Sync with discovery service first
      await deviceManagementApi.syncDiscoveredDevices();
      // Then load from database
      const devices = await deviceManagementApi.getDiscoveredDevices();
      setDiscoveredDevices(devices);
    } catch (error) {
      console.error('Error loading discovered devices:', error);
    }
  };

  const loadManagedDevices = async () => {
    try {
      const devices = await deviceManagementApi.getManagedDevices();
      setManagedDevices(devices);
    } catch (error) {
      console.error('Error loading managed devices:', error);
    }
  };

  const loadDeviceHierarchy = async () => {
    try {
      const hierarchy = await deviceManagementApi.getHierarchy();
      setDeviceHierarchy(hierarchy);
    } catch (error) {
      console.error('Error loading device hierarchy:', error);
    }
  };

  const handleRefreshDiscovered = async () => {
    setRefreshing(true);
    try {
      await loadDiscoveredDevices();
    } finally {
      setRefreshing(false);
    }
  };

  const handleManageDevice = (hostname: string) => {
    setManagingHostname(hostname);
    setEditingDevice(null);
    setIsModalOpen(true);
  };

  const handleEditDevice = (device: ManagedDevice) => {
    setEditingDevice(device);
    setManagingHostname(null);
    setIsModalOpen(true);
  };

  const handleSaveDevice = async (deviceData: ManagedDeviceRequest) => {
    setLoading(true);
    try {
      if (editingDevice) {
        // Update existing device
        await deviceManagementApi.updateManagedDevice(editingDevice.id, deviceData);
      } else if (managingHostname) {
        // Add new device to management
        await deviceManagementApi.manageDevice(managingHostname, deviceData);
      }

      // Reload data
      await Promise.all([loadDiscoveredDevices(), loadManagedDevices()]);

      // Close modal
      setIsModalOpen(false);
      setEditingDevice(null);
      setManagingHostname(null);
    } catch (error) {
      console.error('Error saving device:', error);
      alert('Error saving device configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId: number) => {
    if (!confirm('Are you sure you want to remove this device from management?')) {
      return;
    }

    try {
      await deviceManagementApi.unmanageDevice(deviceId);
      await Promise.all([loadDiscoveredDevices(), loadManagedDevices()]);
    } catch (error) {
      console.error('Error deleting device:', error);
      alert('Error removing device from management. Please try again.');
    }
  };

  const handleSyncStatus = async (deviceId: number) => {
    try {
      await deviceManagementApi.syncDeviceStatus(deviceId);
      await loadManagedDevices();
    } catch (error) {
      console.error('Error syncing device status:', error);
      alert('Error syncing device status. Please try again.');
    }
  };

  const getDiscoveredDeviceForManaging = (): DiscoveredDevice | null => {
    if (!managingHostname) return null;
    return discoveredDevices.find(d => d.hostname === managingHostname) || null;
  };

  if (loading && discoveredDevices.length === 0 && managedDevices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">Loading Device Management</h2>
          <p className="text-gray-600">Discovering devices and loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Settings className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">SmartVenue</h1>
                <p className="text-sm text-gray-600">Device Management</p>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              {managedDevices.length} managed • {discoveredDevices.filter(d => !d.is_managed).length} discovered
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Discovered Devices Section */}
        <DiscoveredDevices
          devices={discoveredDevices}
          onManageDevice={handleManageDevice}
          onRefresh={handleRefreshDiscovered}
          loading={refreshing}
        />

        {/* Managed Devices Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <ManagedDevices
            devices={managedDevices}
            onEditDevice={handleEditDevice}
            onDeleteDevice={handleDeleteDevice}
            onSyncStatus={handleSyncStatus}
          />
        </div>
      </div>

      {/* Device Configuration Modal */}
      <DeviceConfigModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDevice(null);
          setManagingHostname(null);
        }}
        onSave={handleSaveDevice}
        device={editingDevice}
        discoveredDevice={getDiscoveredDeviceForManaging()}
        deviceHierarchy={deviceHierarchy}
        loading={loading}
      />
    </div>
  );
};

export default DeviceManagement;