import { Outlet, NavLink } from 'react-router-dom';
import {
  CpuChipIcon,
  TvIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ListBulletIcon,
  QueueListIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Devices', href: '/devices', icon: CpuChipIcon },
  { name: 'Channels', href: '/channels', icon: TvIcon },
  { name: 'IR Libraries', href: '/ir', icon: ListBulletIcon },
  { name: 'IR Commands', href: '/ir/commands', icon: QueueListIcon },
  { name: 'Templates', href: '/templates', icon: DocumentTextIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                SmartVenue Control Panel
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">v3.0.0</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `flex items-center px-3 py-4 text-sm font-medium border-b-2 ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <item.icon className="w-5 h-5 mr-2" />
                {item.name}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
