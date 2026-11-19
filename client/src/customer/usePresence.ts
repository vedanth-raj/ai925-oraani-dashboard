import { useEffect } from 'react';
import { portalApi } from '../api';

// The server counts a customer as online for 2 minutes after the last heartbeat
const HEARTBEAT_MS = 60 * 1000;
const LOCATION_MS = 5 * 60 * 1000;

function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null), // permission denied or unavailable: presence still works without it
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

// While the portal is open and visible: send a heartbeat every minute and the device location every 5 minutes
export function usePresence(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lastLocationAt = 0;
    let stopped = false;

    const beat = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      let coords: { latitude: number; longitude: number } | null = null;
      if (Date.now() - lastLocationAt >= LOCATION_MS) {
        lastLocationAt = Date.now();
        coords = await currentPosition();
      }
      if (stopped) return;
      portalApi.presence(coords || undefined).catch(() => {});
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
}
