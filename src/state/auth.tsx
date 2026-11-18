import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, type Session } from '@/data';
import { useMe } from '@/data/hooks';

interface AuthCtx {
  ready: boolean;
  session: Session | null;
}
const Ctx = createContext<AuthCtx>({ ready: false, session: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<AuthCtx>({ ready: false, session: null });

  useEffect(() => {
    let alive = true;
    api.getSession().then((s) => alive && setState({ ready: true, session: s })).catch(() => alive && setState({ ready: true, session: null }));
    const off = api.onAuthChange((s) => {
      setState((prev) => {
        if (prev.session?.userId !== s?.userId) qc.clear(); // never leak cached data across accounts
        return { ready: true, session: s };
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [qc]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Profile-gated state for routing: loading | needs onboarding | ready. */
export function useAccountState() {
  const { ready, session } = useAuth();
  const enabled = !!session;
  const me = useMe(enabled);
  return {
    loading: !ready || (enabled && me.isLoading),
    signedIn: !!session,
    onboarded: !!me.data?.profile.onboarded,
    me: me.data,
  };
}
