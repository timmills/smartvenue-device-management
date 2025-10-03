import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type {
  IRLibraryFiltersResponse,
  IRCommandCatalogueResponse,
  IRCommandWithLibrarySummary,
} from '../../types/api.types';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';

const PAGE_SIZE = 50;

interface FilterState {
  search: string;
  commandSearchInput: string;
  brand: string;
  category: string;
  protocol: string;
  espNative: 'all' | 'native' | 'imported';
}

export default function IRCommandsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    commandSearchInput: '',
    brand: 'all',
    category: 'all',
    protocol: 'all',
    espNative: 'all',
  });

  const debouncedSearch = useDebouncedValue(filters.commandSearchInput, 300);

  const { data: filterOptions } = useQuery<IRLibraryFiltersResponse>({
    queryKey: ['ir-library-filters'],
    queryFn: async () => {
      const response = await api.get<IRLibraryFiltersResponse>('/api/v1/ir-libraries/filters');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: commandData, isLoading } = useQuery<IRCommandCatalogueResponse>({
    queryKey: ['ir-commands', page, filters.brand, filters.category, filters.protocol, filters.espNative, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.brand !== 'all') params.brand = filters.brand;
      if (filters.category !== 'all') params.device_category = filters.category;
      if (filters.protocol !== 'all') params.protocol = filters.protocol;
      if (filters.espNative !== 'all') params.esp_native = filters.espNative === 'native';
      const response = await api.get<IRCommandCatalogueResponse>('/api/v1/ir-libraries/commands', { params });
      return response.data;
    },
  });

  useEffect(() => {
    setPage(1);
  }, [filters.brand, filters.category, filters.protocol, filters.espNative, debouncedSearch]);

  const totalPages = useMemo(() => {
    if (!commandData) return 1;
    return Math.max(1, Math.ceil(commandData.total / PAGE_SIZE));
  }, [commandData]);

  const commands: IRCommandWithLibrarySummary[] = commandData?.items ?? [];
  const totalCommands = commandData?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">IR Command Explorer</h2>
            <p className="mt-1 text-sm text-gray-600">
              Browse every imported IR command across brands, categories, and protocols.
            </p>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <ArrowsUpDownIcon className="w-5 h-5" />
            <span>{totalCommands} commands</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="search"
                value={filters.commandSearchInput}
                onChange={(event) => setFilters((prev) => ({ ...prev, commandSearchInput: event.target.value }))}
                placeholder="Search command name"
                className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
            <select
              value={filters.brand}
              onChange={(event) => setFilters((prev) => ({ ...prev, brand: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All brands</option>
              {filterOptions?.brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All categories</option>
              {filterOptions?.device_categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Protocol</label>
            <select
              value={filters.protocol}
              onChange={(event) => setFilters((prev) => ({ ...prev, protocol: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All protocols</option>
              {filterOptions?.protocols.map((proto) => (
                <option key={proto} value={proto}>
                  {proto}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Library Type</label>
            <select
              value={filters.espNative}
              onChange={(event) => setFilters((prev) => ({ ...prev, espNative: event.target.value as FilterState['espNative'] }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All libraries</option>
              <option value="native">ESPHome native</option>
              <option value="imported">Imported</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Commands</h3>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Command</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Protocol</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Library</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Signal Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Loading commands…
                  </td>
                </tr>
              ) : commands.length > 0 ? (
                commands.map((command) => (
                  <tr key={`${command.id}-${command.library.id}`}>
                    <td className="px-4 py-2 text-gray-900">
                      <div className="font-semibold">{command.name}</div>
                      <div className="text-xs text-gray-500">{command.category || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{command.protocol || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">
                      <div className="font-medium text-gray-900">{command.library.brand}</div>
                      <div className="text-xs text-gray-500">{command.library.name}</div>
                      <div className="text-xs text-gray-500">
                        {command.library.device_category} • {command.library.esp_native ? 'ESPHome native' : 'Imported'}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(command.signal_data, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No commands matched the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
          <span>
            Showing {commands.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
            {commands.length ? Math.min(page * PAGE_SIZE, totalCommands) : 0} of {totalCommands}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
