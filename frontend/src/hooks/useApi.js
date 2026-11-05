import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic fetch hook with optional polling.
 *   const { data, loading, error, refetch } = useApi(fn, [deps], { pollMs: 5000 });
 */
export function useApi(fetcher, deps = [], { pollMs = 0, initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const tickRef = useRef(0);

  const run = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const tick = ++tickRef.current;
    try {
      const result = await fetcher();
      if (mounted.current && tick === tickRef.current) setData(result);
    } catch (err) {
      if (mounted.current && tick === tickRef.current) {
        setError(err.response?.data?.error || err.message || 'Request failed');
      }
    } finally {
      if (mounted.current && tick === tickRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mounted.current = true;
    run(false);
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => run(true), pollMs);
    return () => clearInterval(id);
  }, [pollMs, run]);

  const refetch = useCallback(() => run(true), [run]);

  return { data, loading, error, refetch };
}
