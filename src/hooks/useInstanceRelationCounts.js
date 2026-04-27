import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { RELATION_TARGET_LEN, targetsToCountsByCommunityId } from "../lib/relationTargets.js";

/** Instance-level relation map counts when left tab is "instance" and a community is selected. */
export function useInstanceRelationCounts(activeMode, instanceSelectedId, model, pastStart = 0, pastDays, futureStart, futureEnd, dataMode = "mi") {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  //Effect to fetch the instance relation counts
  useEffect(() => {
    //If the active mode is not instance, set the counts to null, set the loading to false, and set the error to null
    if (activeMode !== "instance") {
      setCounts(null);
      setLoading(false);
      setError(null);
      return;
    }

    //If the instance selected id is not set, set the counts to null, set the loading to false, and set the error to null
    if (!instanceSelectedId) {
      setLoading(false);
      setError(null);
      return;
    }

    //Get the source index
    // instanceSelectedId is 1-based from the UI; subtract 1 for the 0-based tensor index.
    const sourceIdx = Number(instanceSelectedId) - 1;
    if (!Number.isFinite(sourceIdx) || sourceIdx < 0 || sourceIdx > 76) {
      setError("Invalid community id for instance relation.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    // dataMode determines whether to use the SAGE or MI tensor for instance-level attribution.
    // Both return the same shape: a 77-element targets array (0-indexed) for the selected source.
    (dataMode === "sage"
    ? api.instanceLevelSage(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
    : api.instanceLevelRelation(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
    ).then((data) => {
        if (cancelled) return;
        const targets = data?.targets;
        if (!Array.isArray(targets) || targets.length !== RELATION_TARGET_LEN) {
          throw new Error("Instance relation API returned invalid targets array.");
        }
        // targetsToCountsByCommunityId converts the 0-indexed array to {"1": val, ..., "77": val}
        setCounts(targetsToCountsByCommunityId(targets));
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        console.error("instanceLevelRelation failed:", err);
        setError(String(err?.message ?? err));
        setCounts(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeMode, instanceSelectedId, model, pastStart, pastDays, futureStart, futureEnd, dataMode]);

  //Return the counts, loading state, and error state
  return { counts, loading, error };
}