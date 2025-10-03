import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type { ApplicationSetting, DeviceTag } from '../../types/api.types';

interface SettingField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'boolean' | 'number';
  description: string;
  category: 'wifi' | 'api' | 'general';
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: 'wifi_ssid',
    label: 'WiFi SSID',
    type: 'string',
    description: 'Network name for ESPHome devices',
    category: 'wifi'
  },
  {
    key: 'wifi_password',
    label: 'WiFi Password',
    type: 'password',
    description: 'WiFi network password',
    category: 'wifi'
  },
  {
    key: 'esphome_api_password',
    label: 'ESPHome API Password',
    type: 'password',
    description: 'API password for ESPHome devices',
    category: 'api'
  },
  {
    key: 'esphome_ota_password',
    label: 'OTA Update Password',
    type: 'password',
    description: 'Password for over-the-air updates',
    category: 'api'
  },
  {
    key: 'discovery_enabled',
    label: 'Auto Discovery',
    type: 'boolean',
    description: 'Automatically discover new ESPHome devices',
    category: 'general'
  },
  {
    key: 'health_check_interval',
    label: 'Health Check Interval (minutes)',
    type: 'number',
    description: 'How often to check device status',
    category: 'general'
  }
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'general' | 'tags'>('general');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [newTag, setNewTag] = useState({ name: '', color: '#3B82F6', description: '' });
  const [editingTag, setEditingTag] = useState<DeviceTag | null>(null);

  // Fetch settings
  const { isLoading: loadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get<ApplicationSetting[]>('/api/v1/settings/app');
      const settingsMap: Record<string, any> = {};
      response.data.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });
      setSettings(settingsMap);
      return response.data;
    },
  });

  // Fetch tags
  const { data: tags, isLoading: loadingTags } = useQuery({
    queryKey: ['device-tags'],
    queryFn: async () => {
      const response = await api.get<DeviceTag[]>('/api/v1/settings/tags');
      return response.data;
    },
  });

  // Update setting
  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      await api.put(`/api/v1/settings/app/${key}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Create tag
  const createTag = useMutation({
    mutationFn: async (data: Partial<DeviceTag>) => {
      await api.post('/api/v1/settings/tags', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-tags'] });
      setNewTag({ name: '', color: '#3B82F6', description: '' });
    },
  });

  // Update tag
  const updateTag = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DeviceTag> }) => {
      await api.put(`/api/v1/settings/tags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-tags'] });
      setEditingTag(null);
    },
  });

  // Delete tag
  const deleteTag = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/settings/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-tags'] });
    },
  });

  const handleSettingChange = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleSaveSetting = (key: string) => {
    updateSetting.mutate({ key, value: settings[key] });
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <p className="mt-1 text-sm text-gray-600">
              Configure application settings and device tags
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'general'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              General Settings
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`py-4 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'tags'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Device Tags ({tags?.length || 0})
            </button>
          </nav>
        </div>

        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <div className="p-6">
            {loadingSettings ? (
              <div className="text-center py-8">
                <p className="mt-2 text-sm text-gray-600">Loading settings...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* WiFi Settings */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    WiFi Configuration
                  </h3>
                  <div className="space-y-4">
                    {SETTING_FIELDS.filter(f => f.category === 'wifi').map(field => (
                      <div key={field.key} className="grid grid-cols-3 gap-4 items-center">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            {field.label}
                          </label>
                          <p className="text-xs text-gray-500">{field.description}</p>
                        </div>
                        <div className="col-span-2 flex items-center space-x-2">
                          <input
                            type={field.type === 'password' ? 'password' : 'text'}
                            value={settings[field.key] || ''}
                            onChange={(e) => handleSettingChange(field.key, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            onClick={() => handleSaveSetting(field.key)}
                            disabled={updateSetting.isPending}
                            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API Settings */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    API Configuration
                  </h3>
                  <div className="space-y-4">
                    {SETTING_FIELDS.filter(f => f.category === 'api').map(field => (
                      <div key={field.key} className="grid grid-cols-3 gap-4 items-center">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            {field.label}
                          </label>
                          <p className="text-xs text-gray-500">{field.description}</p>
                        </div>
                        <div className="col-span-2 flex items-center space-x-2">
                          <input
                            type={field.type === 'password' ? 'password' : 'text'}
                            value={settings[field.key] || ''}
                            onChange={(e) => handleSettingChange(field.key, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            onClick={() => handleSaveSetting(field.key)}
                            disabled={updateSetting.isPending}
                            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General Settings */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    General Settings
                  </h3>
                  <div className="space-y-4">
                    {SETTING_FIELDS.filter(f => f.category === 'general').map(field => (
                      <div key={field.key} className="grid grid-cols-3 gap-4 items-center">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            {field.label}
                          </label>
                          <p className="text-xs text-gray-500">{field.description}</p>
                        </div>
                        <div className="col-span-2 flex items-center space-x-2">
                          {field.type === 'boolean' ? (
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={settings[field.key] || false}
                                onChange={(e) => handleSettingChange(field.key, e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm text-gray-700">
                                {settings[field.key] ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={settings[field.key] || ''}
                              onChange={(e) => handleSettingChange(
                                field.key,
                                field.type === 'number' ? Number(e.target.value) : e.target.value
                              )}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                          )}
                          <button
                            onClick={() => handleSaveSetting(field.key)}
                            disabled={updateSetting.isPending}
                            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Device Tags Tab */}
        {activeTab === 'tags' && (
          <div className="p-6">
            {/* Add New Tag */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Add New Tag</h3>
              <div className="flex items-end space-x-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={newTag.name}
                    onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Tag name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Color</label>
                  <input
                    type="color"
                    value={newTag.color}
                    onChange={(e) => setNewTag({ ...newTag, color: e.target.value })}
                    className="h-10 w-20 border border-gray-300 rounded-md"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-600 mb-1">Description</label>
                  <input
                    type="text"
                    value={newTag.description}
                    onChange={(e) => setNewTag({ ...newTag, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional description"
                  />
                </div>
                <button
                  onClick={() => createTag.mutate(newTag)}
                  disabled={!newTag.name || createTag.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Tags List */}
            {loadingTags ? (
              <div className="text-center py-8">
                <p className="mt-2 text-sm text-gray-600">Loading tags...</p>
              </div>
            ) : tags?.length === 0 ? (
              <div className="text-center py-8">
                <p className="mt-2 text-sm text-gray-600">No tags created</p>
                <p className="text-xs text-gray-500">Create tags to organize your devices</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tags?.map((tag) => (
                  <div key={tag.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                    {editingTag?.id === tag.id ? (
                      <div className="flex items-center space-x-2 flex-1">
                        <input
                          type="text"
                          value={editingTag.name}
                          onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded"
                        />
                        <input
                          type="color"
                          value={editingTag.color || '#3B82F6'}
                          onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                          className="h-8 w-16 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => updateTag.mutate({ id: tag.id, data: editingTag })}
                          className="p-1 text-green-600 hover:text-green-800"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTag(null)}
                          className="p-1 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: tag.color || '#3B82F6' }}
                          />
                          <div>
                            <span className="font-medium text-gray-900">{tag.name}</span>
                            {tag.description && (
                              <span className="ml-2 text-sm text-gray-500">{tag.description}</span>
                            )}
                            {tag.usage_count > 0 && (
                              <span className="ml-2 text-xs text-gray-400">
                                Used by {tag.usage_count} device{tag.usage_count !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setEditingTag(tag)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete tag "${tag.name}"?`)) {
                                deleteTag.mutate(tag.id);
                              }
                            }}
                            disabled={tag.usage_count > 0}
                            className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={tag.usage_count > 0 ? 'Cannot delete tag in use' : 'Delete tag'}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
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
