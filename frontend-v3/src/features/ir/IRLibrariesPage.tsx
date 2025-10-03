import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type {
  IRLibrarySummary,
  IRLibraryListResponse,
  IRLibraryFiltersResponse,
  IRCommandListResponse,
} from '../../types/api.types';
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const PAGE_SIZE = 25;
const COMMAND_PAGE_SIZE = 50;

interface FilterState {
  brand: string;
  category: string;
  protocol: string;
  espNative: 'all' | 'native' | 'imported';
  search: string;
}

interface CommandFilterState {
  protocol: string;
  search: string;
}

export default function IRLibrariesPage() {
  const [filters, setFilters] = useState<FilterState>({
    brand: 'all',
    category: 'all',
    protocol: 'all',
    espNative: 'all',
    search: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLibrary, setSelectedLibrary] = useState<IRLibrarySummary | null>(null);
  const [commandPage, setCommandPage] = useState(1);
  const [commandFilters, setCommandFilters] = useState<CommandFilterState>({ protocol: 'all', search: '' });
  const [commandSearchInput, setCommandSearchInput] = useState('');

  const { data: filterOptions } = useQuery({
    queryKey: ['ir-library-filters'],
    queryFn: async () => {
      const response = await api.get<IRLibraryFiltersResponse>('/api/v1/ir-libraries/filters');
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: librariesData, isLoading: loadingLibraries } = useQuery({
    queryKey: ['ir-libraries', page, filters],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (filters.search) params.search = filters.search;
      if (filters.brand !== 'all') params.brand = filters.brand;
      if (filters.category !== 'all') params.device_category = filters.category;
      if (filters.protocol !== 'all') params.protocol = filters.protocol;
      if (filters.espNative !== 'all') {
        params.esp_native = filters.espNative === 'native';
      }
      const response = await api.get<IRLibraryListResponse>('/api/v1/ir-libraries', { params });
      return response.data;
    },
  });

  const { data: commandsData, isLoading: loadingCommands } = useQuery({
    queryKey: ['ir-library-commands', selectedLibrary?.id, commandPage, commandFilters],
    queryFn: async () => {
      if (!selectedLibrary) return undefined;
      const params: Record<string, unknown> = {
        page: commandPage,
        page_size: COMMAND_PAGE_SIZE,
      };
      if (commandFilters.search) params.search = commandFilters.search;
      if (commandFilters.protocol !== 'all') params.protocol = commandFilters.protocol;
      const response = await api.get<IRCommandListResponse>(
        `/api/v1/ir-libraries/${selectedLibrary.id}/commands`,
        { params }
      );
      return response.data;
    },
    enabled: Boolean(selectedLibrary),
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommandFilters((prev) => ({ ...prev, search: commandSearchInput.trim() }));
      setCommandPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [commandSearchInput]);

  const totalPages = useMemo(() => {
    if (!librariesData) return 1;
    return Math.max(1, Math.ceil(librariesData.total / PAGE_SIZE));
  }, [librariesData]);

  const commandTotalPages = useMemo(() => {
    if (!commandsData) return 1;
    return Math.max(1, Math.ceil(commandsData.total / COMMAND_PAGE_SIZE));
  }, [commandsData]);

  const handleLibraryRowClick = (library: IRLibrarySummary) => {
    setSelectedLibrary(library);
    setCommandPage(1);
    setCommandFilters({ protocol: 'all', search: '' });
    setCommandSearchInput('');
  };

  const libraries = librariesData?.items ?? [];
  const commands = commandsData?.items ?? [];
  const totalLibraries = librariesData?.total ?? 0;
  const totalCommands = commandsData?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">IR Library Catalogue</h2>
            <p className="mt-1 text-sm text-gray-600">
              Search, filter, and inspect every IR library imported into the system.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
            <span>
              {totalLibraries} libraries • {selectedLibrary ? selectedLibrary.command_count : 0} commands selected
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Search brand, model, or device…"
                className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
            <select
              value={filters.brand}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, brand: event.target.value }));
                setPage(1);
              }}
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
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, category: event.target.value }));
                setPage(1);
              }}
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
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, protocol: event.target.value }));
                setPage(1);
              }}
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
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, espNative: event.target.value as FilterState['espNative'] }));
                setPage(1);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All libraries</option>
              <option value="native">ESPHome native</option>
              <option value="imported">Imported (Flipper, raw)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white shadow rounded-lg">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Libraries</h3>
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Brand</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Model</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Commands</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Protocols</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingLibraries ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      Loading libraries…
                    </td>
                  </tr>
                ) : libraries.length > 0 ? (
                  libraries.map((library) => {
                    const isSelected = selectedLibrary?.id === library.id;
                    return (
                      <tr
                        key={library.id}
                        onClick={() => handleLibraryRowClick(library)}
                        className={`cursor-pointer ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">{library.brand}</div>
                          <div className="text-xs text-gray-500">{library.name}</div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {library.model || '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {library.device_category}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {library.command_count}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {library.protocols.length ? library.protocols.join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No libraries match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
            <span>
              Showing {(libraries.length ? (page - 1) * PAGE_SIZE + 1 : 0)}–
              {libraries.length ? Math.min(page * PAGE_SIZE, totalLibraries) : 0} of {totalLibraries}
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

        <div className="bg-white shadow rounded-lg">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-900">Commands</h3>
            {selectedLibrary ? (
              <p className="mt-1 text-xs text-gray-500">
                Viewing commands for <span className="font-semibold text-gray-700">{selectedLibrary.name}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Select a library to view its commands.</p>
            )}
          </div>

          {selectedLibrary && (
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2 relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="search"
                    value={commandSearchInput}
                    onChange={(event) => {
                      setCommandSearchInput(event.target.value);
                      setCommandPage(1);
                    }}
                    placeholder="Search command name"
                    className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <select
                    value={commandFilters.protocol}
                    onChange={(event) => {
                      setCommandFilters((prev) => ({ ...prev, protocol: event.target.value }));
                      setCommandPage(1);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="all">All protocols</option>
                    {selectedLibrary.protocols.map((proto) => (
                      <option key={proto} value={proto}>
                        {proto}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Protocol</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Signal Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {!selectedLibrary ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      Select a library to inspect its commands.
                    </td>
                  </tr>
                ) : loadingCommands ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      Loading commands…
                    </td>
                  </tr>
                ) : commands.length > 0 ? (
                  commands.map((command) => (
                    <tr key={command.id}>
                      <td className="px-4 py-2 text-gray-800">
                        <div className="font-medium">{command.name}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{command.protocol || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{command.category || '—'}</td>
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
                      No commands match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedLibrary && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
              <span>
                Showing {commands.length ? (commandPage - 1) * COMMAND_PAGE_SIZE + 1 : 0}–
                {commands.length ? Math.min(commandPage * COMMAND_PAGE_SIZE, totalCommands) : 0} of {totalCommands}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCommandPage((prev) => Math.max(1, prev - 1))}
                  disabled={commandPage <= 1}
                  className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCommandPage((prev) => Math.min(commandTotalPages, prev + 1))}
                  disabled={commandPage >= commandTotalPages}
                  className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
