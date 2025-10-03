import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/components/Layout';
import DevicesPage from './features/devices/DevicesPage';
import ChannelsPageWorking from './features/channels/ChannelsPageWorking';
import TemplatesPage from './features/templates/TemplatesPage';
import SettingsPage from './features/settings/SettingsPage';
import IRLibrariesPage from './features/ir/IRLibrariesPage';
import IRCommandsPage from './features/ir/IRCommandsPage';

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/devices" replace />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="channels" element={<ChannelsPageWorking />} />
            <Route path="ir" element={<IRLibrariesPage />} />
            <Route path="ir/commands" element={<IRCommandsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
