import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RootLayout } from '../routes/root-layout';
import { ControllersPage } from '../features/devices/pages/controllers-page';
import { ConnectedDevicesPage } from '../features/devices/pages/connected-devices-page';
import { DiscoveryPage } from '../features/discovery/pages/discovery-page';
import { TemplatesPage } from '../features/templates/pages/templates-page';
import { SettingsPage } from '../features/settings/pages/settings-page';
import { IRCommandsPage } from '../features/ir/IRCommandsPage';
import { IRLibrariesPage } from '../features/ir/IRLibrariesPage';
import { ControlPage } from '../features/control/pages/control-page';
import { ControlLayout } from '../features/control/pages/control-layout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="controllers" replace /> },
      { path: 'controllers', element: <ControllersPage /> },
      { path: 'connected-devices', element: <ConnectedDevicesPage /> },
      { path: 'devices', element: <Navigate to="../controllers" replace /> },
      { path: 'discovery', element: <DiscoveryPage /> },
      { path: 'ir-libraries', element: <IRLibrariesPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'ir-commands', element: <IRCommandsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '/control',
    element: <ControlLayout />,
    children: [{ index: true, element: <ControlPage /> }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
