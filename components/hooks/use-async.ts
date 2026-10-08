"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fetch whenever `key` changes. `loading` is derived (no data for the current key yet), and
 * state is only set after the request settles — never synchronously inside the effect.
 * To re-fetch the same thing, change the key (e.g. append a counter).
 * `keepPrevious` keeps showing the last result while the next one loads.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string, opts?: { keepPrevious?: boolean }) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    let cancelled = false;
    fnRef
      .current()
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((e: any) => !cancelled && setState({ key, data: null, error: e?.message || "Request failed" }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  const settled = state.key === key;
  return {
    data: settled || opts?.keepPrevious ? state.data : null,
    error: settled ? state.error : null,
    loading: !settled,
  };
}
