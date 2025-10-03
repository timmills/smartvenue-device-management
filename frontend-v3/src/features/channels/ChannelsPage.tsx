import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type { Channel, ChannelStats } from '../../types/api.types';
import {
  TvIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface ChannelFilters {
  platform: string;
  broadcaster: string;
  search: string;
  showDisabled: boolean;
}

export default function ChannelsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ChannelFilters>({
    platform: 'all',
    broadcaster: 'all',
    search: '',
    showDisabled: false
  });
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());

  // Fetch channels
  const { data: channels, isLoading, error: channelsError } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const response = await api.get<Channel[]>('/api/v1/channels/');
      return response.data;
    },
    retry: 1,
  });

  // Fetch channel stats
  const { data: stats, error: statsError } = useQuery({
    queryKey: ['channel-stats'],
    queryFn: async () => {
      const response = await api.get<ChannelStats>('/api/v1/channels/stats');
      return response.data;
    },
    retry: 1,
  });

  // Update channel
  const updateChannel = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Channel> }) => {
      await api.put(`/api/v1/channels/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel-stats'] });
    },
  });

  // Bulk update channels
  const bulkUpdate = useMutation({
    mutationFn: async (data: { channel_ids: number[]; update_data: Partial<Channel> }) => {
      await api.put('/api/v1/channels/bulk-update', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel-stats'] });
      setSelectedChannels(new Set());
    },
  });

  // Filter channels (memoized to prevent infinite re-renders)
  const filteredChannels = useMemo(() => {
    if (!channels) return [];

    return channels.filter(channel => {
      if (!filters.showDisabled && channel.disabled) return false;
      if (filters.platform !== 'all' && channel.platform !== filters.platform) return false;
      if (filters.broadcaster !== 'all' && channel.broadcaster_network !== filters.broadcaster) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          channel.channel_name.toLowerCase().includes(searchLower) ||
          channel.lcn?.toLowerCase().includes(searchLower) ||
          channel.foxtel_number?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [channels, filters]);

  // Toggle channel selection
  const toggleChannelSelection = (channelId: number) => {
    const newSelection = new Set(selectedChannels);
    if (newSelection.has(channelId)) {
      newSelection.delete(channelId);
    } else {
      newSelection.add(channelId);
    }
    setSelectedChannels(newSelection);
  };

  // Select all visible channels
  const selectAll = () => {
    const allIds = new Set(filteredChannels?.map(c => c.id) || []);
    setSelectedChannels(allIds);
  };

  // Handle errors early
  if (channelsError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Channels</h3>
        <p className="text-sm text-red-600">Failed to load channels data. Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Channel Management</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage TV channels and their configurations
            </p>
            
            {/* Stats */}
            {stats && (
              <div className="mt-4 flex space-x-6 text-sm">
                <div>
                  <span className="text-gray-500">Total:</span>
                  <span className="ml-2 font-semibold">{stats.total_channels}</span>
                </div>
                <div>
                  <span className="text-gray-500">Enabled:</span>
                  <span className="ml-2 font-semibold text-green-600">{stats.enabled_channels}</span>
                </div>
                <div>
                  <span className="text-gray-500">Disabled:</span>
                  <span className="ml-2 font-semibold text-red-600">{stats.disabled_channels}</span>
                </div>
                <div>
                  <span className="text-gray-500">Platforms:</span>
                  <span className="ml-2 font-semibold">{stats.platforms?.length || 0}</span>
                </div>
              </div>
            )}
            {statsError && (
              <p className="mt-2 text-xs text-rose-600">Failed to load channel statistics.</p>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedChannels.size > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {selectedChannels.size} selected
              </span>
              <button
                onClick={() => bulkUpdate.mutate({
                  channel_ids: Array.from(selectedChannels),
                  update_data: { disabled: false }
                })}
                className="px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded hover:bg-green-200"
              >
                Enable
              </button>
              <button
                onClick={() => bulkUpdate.mutate({
                  channel_ids: Array.from(selectedChannels),
                  update_data: { disabled: true }
                })}
                className="px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
              >
                Disable
              </button>
              <button
                onClick={() => setSelectedChannels(new Set())}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search channels..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Platform Filter */}
          <select
            value={filters.platform}
            onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Platforms</option>
            {stats?.platforms?.map(platform => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>

          {/* Broadcaster Filter */}
          <select
            value={filters.broadcaster}
            onChange={(e) => setFilters({ ...filters, broadcaster: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Broadcasters</option>
            {stats?.broadcasters?.map(broadcaster => (
              <option key={broadcaster} value={broadcaster}>{broadcaster}</option>
            ))}
          </select>

          {/* Show Disabled Toggle */}
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={filters.showDisabled}
              onChange={(e) => setFilters({ ...filters, showDisabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Show disabled channels</span>
          </label>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Showing {filteredChannels?.length || 0} of {channels?.length || 0} channels
          </p>
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Select all visible
          </button>
        </div>
      </div>

      {/* Channels List */}
      <div className="bg-white shadow rounded-lg">
        {isLoading ? (
          <div className="p-8 text-center">
            <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">Loading channels...</p>
          </div>
        ) : filteredChannels?.length === 0 ? (
          <div className="p-8 text-center">
            <TvIcon className="w-8 h-8 mx-auto text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">No channels found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-12 px-6 py-3">
                    <input
                      type="checkbox"
                      checked={filteredChannels?.length > 0 && filteredChannels.every(c => selectedChannels.has(c.id))}
                      onChange={() => {
                        if (filteredChannels?.every(c => selectedChannels.has(c.id))) {
                          setSelectedChannels(new Set());
                        } else {
                          selectAll();
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Channel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Numbers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Broadcaster
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredChannels?.map((channel) => (
                  <tr key={channel.id} className={channel.disabled ? 'opacity-50' : ''}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedChannels.has(channel.id)}
                        onChange={() => toggleChannelSelection(channel.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {channel.logo_url && (
                          <img
                            src={channel.logo_url}
                            alt={channel.channel_name}
                            className="w-6 h-6 rounded mr-3"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {channel.channel_name}
                          </div>
                          {channel.programming_content && (
                            <div className="text-xs text-gray-500">
                              {channel.programming_content}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>
                        {channel.lcn && <span className="block">LCN: {channel.lcn}</span>}
                        {channel.foxtel_number && <span className="block">Foxtel: {channel.foxtel_number}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {channel.platform}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {channel.broadcaster_network}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                        channel.disabled
                          ? 'text-red-700 bg-red-100'
                          : 'text-green-700 bg-green-100'
                      }`}>
                        {channel.disabled ? 'Disabled' : 'Enabled'}
                      </span>
                      {channel.internal && (
                        <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded">
                          Internal
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => updateChannel.mutate({
                          id: channel.id,
                          data: { disabled: !channel.disabled }
                        })}
                        className={`text-sm font-medium ${
                          channel.disabled
                            ? 'text-green-600 hover:text-green-800'
                            : 'text-red-600 hover:text-red-800'
                        }`}
                      >
                        {channel.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
