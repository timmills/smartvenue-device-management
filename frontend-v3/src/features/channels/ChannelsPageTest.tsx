import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export default function ChannelsPageTest() {
  // Test just the basic API call
  const { data: channels, isLoading, error } = useQuery({
    queryKey: ['channels-test'],
    queryFn: async () => {
      const response = await api.get('/api/v1/channels/');
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold">Channels Test</h2>
        <p>Loading channels...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold">Channels Test</h2>
        <p className="text-red-600">Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">Channels Test</h2>
      <p>Loaded {channels?.length || 0} channels successfully</p>
      <pre className="mt-4 p-4 bg-gray-100 rounded text-sm">
        {JSON.stringify(channels?.slice(0, 2), null, 2)}
      </pre>
    </div>
  );
}