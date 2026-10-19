// History changes are announced on the window (same tab) and on a
// BroadcastChannel (other tabs of the same browser), so a request sent in one
// tab shows up in the History sidebar of every other open tab.
const EVENT = 'history-updated';
const CHANNEL = 'reqspace-history';

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function notifyHistoryUpdated(): void {
  window.dispatchEvent(new Event(EVENT));
  const channel = openChannel();
  if (channel) {
    channel.postMessage('updated');
    channel.close();
  }
}

export function subscribeHistoryUpdated(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  const channel = openChannel();
  if (channel) channel.onmessage = () => callback();
  return () => {
    window.removeEventListener(EVENT, callback);
    channel?.close();
  };
}
