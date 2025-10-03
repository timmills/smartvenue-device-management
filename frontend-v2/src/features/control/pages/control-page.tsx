import { useEffect, useMemo, useState } from 'react';
import { useManagedDevices } from '@/features/devices/hooks/use-managed-devices';
import { useDeviceTags } from '@/features/settings/hooks/use-device-tags';
import { useAvailableChannels } from '@/features/devices/hooks/use-available-channels';
import type { ChannelOption, DeviceTag, ManagedDevice } from '@/types';
import { formatRelativeTime } from '@/utils/datetime';

interface PortRow {
  id: string;
  portId: number;
  controllerId: number;
  controllerName: string;
  hostname: string;
  portNumber: number;
  deviceName: string;
  location: string;
  tags: DeviceTag[];
  lastSeen: string;
  isOnline: boolean;
  defaultChannel: string | null;
}

export const ControlPage = () => {
  const { data: controllers = [], isLoading } = useManagedDevices();
  const { data: tags = [] } = useDeviceTags();
  const { data: channels = [] } = useAvailableChannels();

  const rows = useMemo(() => buildRows(controllers, tags), [controllers, tags]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  const displayRows = useMemo(() => {
    const lowered = nameFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (lowered && !row.deviceName.toLowerCase().includes(lowered)) {
        return false;
      }
      if (locationFilter && row.location !== locationFilter) {
        return false;
      }
      return true;
    });
  }, [rows, nameFilter, locationFilter]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(displayRows.map((row) => row.id));
      return new Set([...prev].filter((id) => validIds.has(id)));
    });
  }, [displayRows]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const currentIds = displayRows.map((row) => row.id);
    const allSelected = currentIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(currentIds));
  };

  const quickSelectTag = (tagId: number) => {
    const matchingIds = rows.filter((row) => row.tags.some((tag) => tag.id === tagId)).map((row) => row.id);
    const allSelected = matchingIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        matchingIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set(matchingIds);
    });
  };

  const quickSelectLocation = (location: string) => {
    const matchingIds = rows.filter((row) => row.location === location).map((row) => row.id);
    const allSelected = matchingIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        matchingIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set(matchingIds);
    });
    setLocationFilter(location);
  };

  const selectedCount = selectedIds.size;
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Controllers</h2>
          <p className="text-sm text-slate-400">Tap to select devices. Tag or location chips select related sets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Search by device name…"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <select
            value={locationFilter ?? ''}
            onChange={(event) => setLocationFilter(event.target.value || null)}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value="">All locations</option>
            {Array.from(new Set(rows.map((row) => row.location)))
              .filter((location): location is string => Boolean(location))
              .sort()
              .map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
          </select>
          <select
            value=""
            onChange={() => {}}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value="">Channel selector (coming soon)</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {formatChannelLabel(channel)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={displayRows.length > 0 && displayRows.every((row) => selectedIds.has(row.id))}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-slate-400 text-brand-500 focus:ring-brand-400"
            />
            Select all {displayRows.length}
          </label>
          <span className="text-sm text-slate-500">{selectedCount} selected</span>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            Loading controllers…
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            No devices match the current filters.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayRows.map((row) => (
              <ControlCard
                key={row.id}
                row={row}
                selected={selectedIds.has(row.id)}
                onToggle={() => toggleSelection(row.id)}
                onTagSelect={(tagId) => quickSelectTag(tagId)}
                onLocationSelect={(location) => quickSelectLocation(location)}
              />
            ))}
          </div>
        )}
      </section>

      <ActionToolbar selectedRows={selectedRows} />
    </div>
  );
};

const ControlCard = ({
  row,
  selected,
  onToggle,
  onTagSelect,
  onLocationSelect,
}: {
  row: PortRow;
  selected: boolean;
  onToggle: () => void;
  onTagSelect: (tagId: number) => void;
  onLocationSelect: (location: string) => void;
}) => {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 shadow-lg transition ${
        selected ? 'border-brand-400 bg-white' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{row.deviceName}</h3>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-slate-400 text-brand-500 focus:ring-brand-400"
          />
          Select
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <button
          type="button"
          onClick={() => onLocationSelect(row.location)}
          className="rounded-full border border-slate-300 px-2 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-500"
        >
          {row.location || 'Unassigned'}
        </button>
        <span>{row.isOnline ? 'Online' : 'Offline'}</span>
        <span>Updated {formatRelativeTime(row.lastSeen)}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {row.tags.length ? (
          row.tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTagSelect(tag.id)}
              className="rounded-full border border-brand-300 px-2 py-1 text-xs font-medium text-brand-500 transition hover:bg-brand-500/10"
            >
              {tag.name}
            </button>
          ))
        ) : (
          <span className="text-xs text-slate-400">No tags</span>
        )}
      </div>
    </div>
  );
};

const ActionToolbar = ({ selectedRows }: { selectedRows: PortRow[] }) => {
  const count = selectedRows.length;

  return (
    <div className="sticky bottom-6 z-20 mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-xl shadow-slate-300/60">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span className="font-medium text-slate-900">{count} device{count === 1 ? '' : 's'} selected</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <ActionButton label="Power Toggle" />
          <ActionButton label="Mute Toggle" />
          <ActionButton label="Volume +" />
          <ActionButton label="Volume –" />
          <ActionButton label="Default Channel" />
        </div>
      </div>
    </div>
  );
};

const ActionButton = ({ label }: { label: string }) => (
  <button
    type="button"
    className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-brand-300 hover:text-brand-500"
  >
    {label}
  </button>
);

function buildRows(controllers: ManagedDevice[], tags: DeviceTag[]): PortRow[] {
  const tagMap = new Map<number, DeviceTag>(tags.map((tag) => [tag.id, tag]));

  const rows: PortRow[] = [];
  controllers.forEach((controller) => {
    controller.ir_ports.forEach((port) => {
      if (!port.is_active) {
        return;
      }
      rows.push({
        id: `${controller.id}-${port.port_number}`,
        portId: port.id ?? port.port_number,
        controllerId: controller.id,
        controllerName: controller.device_name ?? controller.hostname,
        hostname: controller.hostname,
        portNumber: port.port_number,
        deviceName: port.connected_device_name ?? `Port ${port.port_number}`,
        location: controller.location ?? 'Unassigned',
        tags: (port.tag_ids ?? [])
          .map((tagId) => tagMap.get(tagId))
          .filter((tag): tag is DeviceTag => Boolean(tag)),
        lastSeen: controller.last_seen,
        isOnline: controller.is_online,
        defaultChannel: port.default_channel,
      });
    });
  });

  return rows;
}

function formatChannelLabel(channel: ChannelOption): string {
  const parts = [channel.channel_name];
  if (channel.lcn) parts.push(`LCN ${channel.lcn}`);
  if (channel.foxtel_number) parts.push(`Foxtel ${channel.foxtel_number}`);
  return parts.join(' · ');
}
