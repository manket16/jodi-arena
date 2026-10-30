// One real-time channel per couple, shared by the whole app. Messages go phone to phone in
// about a tenth of a second (Supabase Realtime broadcast), and presence tells us if the partner
// has the app open right now.
import { sb } from './lib.js';

let ch = null, key = null, myId = null;
const listeners = new Set();
const presenceListeners = new Set();
let online = false;

export function connect(coupleId, uid, name) {
  if (key === coupleId + uid && ch) return;
  disconnect();
  key = coupleId + uid; myId = uid;
  ch = sb.channel(`jodi-${coupleId}`, { config: { broadcast: { self: false, ack: false }, presence: { key: uid } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (payload && payload.from !== myId) listeners.forEach((fn) => fn(payload)); });
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    online = Object.keys(st).some((k) => k !== myId);
    presenceListeners.forEach((fn) => fn(online));
  });
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') { try { await ch.track({ name, at: Date.now() }); } catch (_) { /* presence is best effort */ } }
  });
}

export function disconnect() {
  if (ch) { try { sb.removeChannel(ch); } catch (_) { /* ignore */ } }
  ch = null; key = null; online = false;
  presenceListeners.forEach((fn) => fn(false));
}

export function send(payload) {
  if (!ch) return;
  ch.send({ type: 'broadcast', event: 'm', payload: { ...payload, from: myId } }).catch(() => {});
}

export function onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onPresence(fn) { presenceListeners.add(fn); fn(online); return () => presenceListeners.delete(fn); }
export const partnerOnline = () => online;
export const me = () => myId;
