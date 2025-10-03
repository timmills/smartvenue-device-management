import { useEffect, useMemo, useState } from 'react';
import {
  useDeviceTags,
  useCreateDeviceTag,
  useUpdateDeviceTag,
  useDeleteDeviceTag,
} from '../hooks/use-device-tags';
import {
  useChannelLocations,
  useChannelGroups,
  useSelectChannelLocation,
  useUpdateChannelVisibility,
} from '../hooks/use-channels';
import type { DeviceTag, ChannelRecord } from '@/types';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'channels' | 'tags' | 'overview'>('channels');

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Settings & diagnostics</h2>
        <p className="text-sm text-slate-500">
          Configure channel visibility, manage device tags, and prepare for upcoming diagnostics tools.
        </p>
      </header>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4 text-sm font-medium text-slate-600">
          <TabButton label="Channels" active={activeTab === 'channels'} onClick={() => setActiveTab('channels')} />
          <TabButton label="Tags" active={activeTab === 'tags'} onClick={() => setActiveTab('tags')} />
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
        </nav>
      </div>

      {activeTab === 'channels' ? (
        <ChannelManagementPanel />
      ) : activeTab === 'tags' ? (
        <TagManagementPanel />
      ) : (
        <OverviewPanel />
      )}
    </section>
  );
};

const TabButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-b-2 pb-2 transition ${
      active ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
    }`}
  >
    {label}
  </button>
);

const OverviewPanel = () => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
    <p>
      Future updates will surface additional configuration (network credentials, discovery tuning, diagnostics). For now
      this section remains a placeholder so navigation aligns with the roadmap.
    </p>
  </div>
);

const ChannelManagementPanel = () => {
  const locationsQuery = useChannelLocations();
  const selectLocation = useSelectChannelLocation();
  const selectedAvailability = locationsQuery.data?.selected ?? undefined;
  const groupsQuery = useChannelGroups(selectedAvailability);
  const updateChannels = useUpdateChannelVisibility();

  const [channelState, setChannelState] = useState<Record<number, boolean>>({});
  const [initialState, setInitialState] = useState<Record<number, boolean>>({});
  const [lastResult, setLastResult] = useState<string | null>(null);

  const allChannels: ChannelRecord[] = useMemo(() => {
    if (!groupsQuery.data) return [];
    const { recommended, other_fta, foxtel, inhouse } = groupsQuery.data;
    return [...recommended, ...other_fta, ...foxtel, ...inhouse];
  }, [groupsQuery.data]);

  useEffect(() => {
    if (!groupsQuery.data) return;
    const base: Record<number, boolean> = {};
    groupsQuery.data.recommended.forEach((channel) => {
      base[channel.id] = !channel.disabled;
    });
    groupsQuery.data.other_fta.forEach((channel) => {
      base[channel.id] = !channel.disabled;
    });
    groupsQuery.data.foxtel.forEach((channel) => {
      base[channel.id] = !channel.disabled;
    });
    groupsQuery.data.inhouse.forEach((channel) => {
      base[channel.id] = !channel.disabled;
    });
    setChannelState(base);
    setInitialState(base);
  }, [groupsQuery.data]);

  const isDirty = useMemo(() => {
    if (!allChannels.length) return false;
    return allChannels.some((channel) => {
      const current = channelState[channel.id];
      const initial = initialState[channel.id];
      return typeof current === 'boolean' && current !== initial;
    });
  }, [allChannels, channelState, initialState]);

  const toggleChannel = (channelId: number, enabled: boolean) => {
    setChannelState((prev) => ({ ...prev, [channelId]: enabled }));
    setLastResult(null);
  };

  const applyBulk = (channels: ChannelRecord[], enabled: boolean) => {
    setChannelState((prev) => {
      const next = { ...prev };
      channels.forEach((channel) => {
        next[channel.id] = enabled;
      });
      return next;
    });
    setLastResult(null);
  };

  const handleSave = async () => {
    if (!isDirty || updateChannels.isPending) return;

    const enableIds: number[] = [];
    const disableIds: number[] = [];

    allChannels.forEach((channel) => {
      const start = initialState[channel.id];
      const current = channelState[channel.id];
      if (typeof current !== 'boolean' || typeof start !== 'boolean') return;
      if (current && !start) {
        enableIds.push(channel.id);
      } else if (!current && start) {
        disableIds.push(channel.id);
      }
    });

    if (enableIds.length === 0 && disableIds.length === 0) {
      setLastResult('No changes to save.');
      return;
    }

    try {
      await updateChannels.mutateAsync({ enable_ids: enableIds, disable_ids: disableIds });
      setLastResult('Channel visibility updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channels.';
      setLastResult(message);
    }
  };

  const handleReset = () => {
    setChannelState(initialState);
    setLastResult(null);
  };

  const setLocation = async (availability: string) => {
    try {
      await selectLocation.mutateAsync(availability);
      setLastResult(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change location.';
      setLastResult(message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Broadcast region</h3>
            <p className="text-xs text-slate-500">
              Select the venue’s location to surface the local FTA multiplex. Foxtel and in-house channels remain available
              regardless of location.
            </p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Location
              <select
                value={selectedAvailability ?? ''}
                onChange={(event) => setLocation(event.target.value)}
                disabled={locationsQuery.isLoading || selectLocation.isPending}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {locationsQuery.data?.locations.map((location) => (
                  <option key={location.availability} value={location.availability}>
                    {location.display_name}
                  </option>
                )) ?? (
                  <option value="">Loading…</option>
                )}
              </select>
            </label>
          </div>
        </div>
      </div>

      {groupsQuery.isLoading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          Loading channel lists…
        </div>
      ) : groupsQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load channels. {groupsQuery.error instanceof Error ? groupsQuery.error.message : 'Please try again.'}
        </div>
      ) : groupsQuery.data ? (
        <div className="space-y-4">
          <ChannelSection
            title="Recommended (FTA)"
            description="Core multiplex for the selected region."
            channels={groupsQuery.data.recommended}
            channelState={channelState}
            onToggle={toggleChannel}
            onBulkEnable={() => applyBulk(groupsQuery.data.recommended, true)}
            onBulkDisable={() => applyBulk(groupsQuery.data.recommended, false)}
          />
          <ChannelSection
            title="Other FTA networks"
            description="Additional services that may not broadcast in your area."
            channels={groupsQuery.data.other_fta}
            channelState={channelState}
            onToggle={toggleChannel}
          />
          <ChannelSection
            title="Foxtel"
            description="Foxtel services (requires the venue’s head-end)."
            channels={groupsQuery.data.foxtel}
            channelState={channelState}
            onToggle={toggleChannel}
          />
          <ChannelSection
            title="In-house"
            description="Venue-only loops or internal signage channels."
            channels={groupsQuery.data.inhouse}
            channelState={channelState}
            onToggle={toggleChannel}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          No channels available.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {lastResult && <span className="text-slate-600">{lastResult}</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || updateChannels.isPending}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {updateChannels.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChannelSection = ({
  title,
  description,
  channels,
  channelState,
  onToggle,
  onBulkEnable,
  onBulkDisable,
}: {
  title: string;
  description?: string;
  channels: ChannelRecord[];
  channelState: Record<number, boolean>;
  onToggle: (channelId: number, enabled: boolean) => void;
  onBulkEnable?: () => void;
  onBulkDisable?: () => void;
}) => {
  if (!channels.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
        {(onBulkEnable || onBulkDisable) && (
          <div className="flex gap-2 text-xs text-slate-600">
            {onBulkEnable ? (
              <button
                type="button"
                onClick={onBulkEnable}
                className="rounded border border-slate-300 px-2 py-1 transition hover:bg-slate-50"
              >
                Enable all
              </button>
            ) : null}
            {onBulkDisable ? (
              <button
                type="button"
                onClick={onBulkDisable}
                className="rounded border border-slate-300 px-2 py-1 transition hover:bg-slate-50"
              >
                Disable all
              </button>
            ) : null}
          </div>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {channels.map((channel) => {
          const enabled = channelState[channel.id] ?? !channel.disabled;
          const labelParts = [channel.channel_name];
          if (channel.lcn) {
            labelParts.push(`LCN ${channel.lcn}`);
          }
          if (channel.foxtel_number) {
            labelParts.push(`Foxtel ${channel.foxtel_number}`);
          }
          return (
            <label key={channel.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <div className="font-medium text-slate-900">{labelParts.join(' · ')}</div>
                <div className="text-xs text-slate-500">
                  {channel.platform}
                  {channel.availability && channel.platform === 'FTA' ? ` • ${channel.availability}` : ''}
                </div>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onToggle(channel.id, event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
};

const TagManagementPanel = () => {
  const { data: tags = [], isLoading, error } = useDeviceTags();
  const createMutation = useCreateDeviceTag();
  const updateMutation = useUpdateDeviceTag();
  const deleteMutation = useDeleteDeviceTag();

  const [createForm, setCreateForm] = useState({ name: '', color: '#2563ff', description: '' });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', color: '#2563ff', description: '' });
  const [editError, setEditError] = useState<string | null>(null);

  const sortedTags = useMemo(
    () => tags.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [tags],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const payload = {
      name: createForm.name.trim(),
      color: createForm.color || null,
      description: createForm.description.trim() ? createForm.description.trim() : null,
    };

    if (!payload.name) {
      setCreateError('Tag name is required.');
      return;
    }

    try {
      await createMutation.mutateAsync(payload);
      setCreateForm({ name: '', color: '#2563ff', description: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create tag.';
      setCreateError(message);
    }
  };

  const beginEdit = (tag: DeviceTag) => {
    setEditingTagId(tag.id);
    setEditForm({
      name: tag.name,
      color: tag.color ?? '#2563ff',
      description: tag.description ?? '',
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingTagId(null);
    setEditError(null);
  };

  const handleUpdate = async () => {
    if (editingTagId === null) return;

    const payload = {
      name: editForm.name.trim(),
      color: editForm.color || null,
      description: editForm.description.trim() ? editForm.description.trim() : null,
    };

    if (!payload.name) {
      setEditError('Tag name is required.');
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: editingTagId, payload });
      setEditingTagId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update tag.';
      setEditError(message);
    }
  };

  const handleDelete = async (tag: DeviceTag) => {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete the “${tag.name}” tag? It will be removed from every controller port.`,
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(tag.id);
      if (editingTagId === tag.id) {
        setEditingTagId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete tag.';
      setEditError(message);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Create a new tag</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Tag name
            <input
              type="text"
              value={createForm.name}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="e.g. Sports, Lounge TV"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Color
            <input
              type="color"
              value={createForm.color}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, color: event.target.value }))}
              className="mt-1 h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 md:col-span-1 md:col-start-1 md:row-start-2">
            Description
            <input
              type="text"
              value={createForm.description}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Optional context"
            />
          </label>
        </div>
        {createError ? <p className="mt-2 text-xs text-rose-600">{createError}</p> : null}
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {createMutation.isPending ? 'Creating…' : 'Add tag'}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Existing tags</h3>
          {isLoading ? <span className="text-xs text-slate-500">Loading…</span> : null}
        </div>
        {error ? (
          <div className="p-4 text-sm text-rose-600">Failed to load tags: {error.message}</div>
        ) : sortedTags.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No tags defined yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Tag</th>
                  <th className="px-4 py-2 text-left">Usage</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sortedTags.map((tag) => {
                  const isEditing = editingTagId === tag.id;
                  return (
                    <tr key={tag.id} className="align-top">
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={editForm.color}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, color: event.target.value }))}
                                className="h-9 w-16 cursor-pointer rounded-md border border-slate-300 bg-white"
                              />
                              <span className="text-xs text-slate-500">Colour</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: tag.color ?? '#64748b' }}
                              aria-hidden="true"
                            />
                            <span className="font-medium text-slate-900">{tag.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{tag.usage_count}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {isEditing ? (
                          <textarea
                            value={editForm.description}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, description: event.target.value }))
                            }
                            rows={2}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        ) : tag.description ? (
                          tag.description
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleUpdate}
                              disabled={updateMutation.isPending}
                              className="rounded-md bg-brand-500 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                            >
                              {updateMutation.isPending ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => beginEdit(tag)}
                              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tag)}
                              className="rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editError ? <p className="px-4 pb-4 text-xs text-rose-600">{editError}</p> : null}
      </div>
    </div>
  );
};
