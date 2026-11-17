/** Relative API URLs work on localhost, LAN hosts and production proxies. */
export async function getTelemetry({ node = '', limit = 40, signal } = {}) {
  const query = new URLSearchParams({ limit, ...(node ? { node_id: node } : {}) });
  const response = await fetch(`/api/map-data?${query}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.json();
}
export function packetAge(timestamp, serverTime, receivedAt, now = Date.now()) {
  if (!timestamp || !serverTime) return null;
  // Legacy packets and server_time share the server's wall clock, avoiding browser timezone assumptions.
  const parse = value => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  const seconds = (parse(serverTime) - parse(timestamp) + now - receivedAt) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
}
export function ageLabel(seconds) {
  if (seconds === null) return 'Timestamp unavailable';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
