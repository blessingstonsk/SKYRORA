// Keeps the screen on while mounted. Unlike expo-keep-awake's useKeepAwake,
// this never throws: on the web the wake lock is granted asynchronously and
// may be refused, and releasing a lock that never activated would crash.
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'skyro-recording';

export function useSafeKeepAwake() {
  useEffect(() => {
    let active = false;
    let unmounted = false;
    (async () => {
      try {
        if (!(await isAvailableAsync())) return;
        await activateKeepAwakeAsync(TAG);
        if (unmounted) await deactivateKeepAwake(TAG).catch(() => {});
        else active = true;
      } catch {
        // Wake lock refused (e.g. tab hidden, browser policy): recording still works.
      }
    })();
    return () => {
      unmounted = true;
      if (active) deactivateKeepAwake(TAG).catch(() => {});
    };
  }, []);
}
