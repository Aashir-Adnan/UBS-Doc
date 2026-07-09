import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@site/src/components/portal/authStore';
import { getMe } from './tenantApi';

// Resolves the acting user's urdd_id (the identity contract in §6). The portal
// signs in with Google; the URDD bridge is portal_users.urdd_id, fetched from
// GET /api/portal/users/me?email=. If urdd_id is null the user is "pending"
// (not yet provisioned into a tenant) and callers must NOT hit tenant endpoints.
//
// Returns:
//   status : 'idle' | 'loading' | 'ready' | 'pending' | 'error'
//   urdd   : number | null   (actionPerformerURDD; only meaningful when 'ready')
//   me     : the portal user record, or null
//   error  : Error message string, or null
//   refetch: () => void       (re-resolve, e.g. after an admin provisions them)
export function useActingUrdd() {
  const { user } = useAuth();
  const email = user?.email || null;

  const [state, setState] = useState({
    status: 'idle',
    urdd: null,
    me: null,
    error: null,
  });

  const load = useCallback(async () => {
    if (!email) {
      setState({ status: 'idle', urdd: null, me: null, error: null });
      return;
    }
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const me = await getMe(email);
      const urdd = me?.urdd_id ?? null;
      setState({
        status: urdd == null ? 'pending' : 'ready',
        urdd,
        me: me || null,
        error: null,
      });
    } catch (e) {
      setState({ status: 'error', urdd: null, me: null, error: e.message });
    }
  }, [email]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}
