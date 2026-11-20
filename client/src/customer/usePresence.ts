import { useEffect } from 'react';
import { portalApi } from '../api';

// The server counts a customer as online for 2 minutes after the last heartbeat
const HEARTBEAT_MS = 60 * 1000;

// While the portal is open and visible: send a heartbeat every minute (no live geolocation tracking)
export function usePresence(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let stopped = false;

    const beat = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      portalApi.presence().catch(() => {});
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
