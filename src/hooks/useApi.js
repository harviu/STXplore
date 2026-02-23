import { useEffect, useState } from "react";

/**
 * useApi(() => Promise, deps)
 * - standardizes loading/data/error
 * - cancels stale requests automatically
 */
export function useApi(makePromise, deps, options = {}) {
  const { keepPreviousData = true} = options;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    setLoading(true);
    setError("");
    if (!keepPreviousData) setData(null);

    Promise.resolve()
      .then(() => makePromise({ signal: controller.signal }))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        if (e?.name === "AbortError") return;
        setError(e?.message ?? String(e));
        setData(null);
      })
      .finally(() => {
        if(alive) setLoading(false);
      });
      return () => {
        alive = false;
        controller.abort();
      };
  }, deps);
  return { data, error, loading };
}
