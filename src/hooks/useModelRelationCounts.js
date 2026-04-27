import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { RELATION_TARGET_LEN, targetsToCountsByCommunityId } from "../lib/relationTargets.js";

/** Model-level relation map counts when left tab is "relation" and a community is selected. */
export function useModelRelationCounts(activeMode, layer, relationSelectedId, model, dataMode = "mi", pastStart = 0, pastDays = 90, futureStart = 0, futureEnd = 30, direction = "target") {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  //Effect to fetch the model relation counts
  useEffect(() => {
    //If the active mode is not relation, set the counts to null, set the loading to false, and set the error to null
    if (activeMode !== "relation") {
      setCounts(null);
      setLoading(false);
      setError(null);
      return;
    }

    //If the layer is not community, set the counts to null, set the loading to false, and set the error to "Model-level relation is only available for community layer right now."
    if (layer !== "community") {
      setCounts(null);
      setLoading(false);
      setError("Model-level relation is only available for community layer right now.");
      return;
    }

    //If the relation selected id is not set, set the counts to null, set the loading to false, and set the error to null
    if (!relationSelectedId) {
      setLoading(false);
      setError(null);
      return;
    }

    //Get the source index
    // Note: despite the variable name, targetIdx is used for both directions.
    // In target mode it's the right-map community (the attribution target).
    // In source mode it's the left-map community (the attribution source).
    // Both are 1-based in the UI so we subtract 1 for the 0-based tensor index.
    const targetIdx = Number(relationSelectedId) - 1;
    if (!Number.isFinite(targetIdx) || targetIdx < 0 || targetIdx > 76) {
      setError("Invalid community id for relation mapping.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    // Pick the correct endpoint based on dataMode (SAGE vs MI) and direction (target vs source).
    // sageLevelRelation / relationalModel → all sources → selected target
    // sageLevelSource / relationalModelSource → selected source → all targets
    (dataMode === "sage"
      ? direction === "source"
        ? api.sageLevelSource(targetIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
        : api.sageLevelRelation(targetIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
      : direction === "source"
        ? api.relationalModelSource(targetIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
        : api.relationalModel(targetIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
    ).then((data) => {
      if (cancelled) return;
      const targets = data?.targets;
      if (!Array.isArray(targets) || targets.length !== RELATION_TARGET_LEN) {
        throw new Error("Relation API returned invalid targets array.");
      }
      // targetsToCountsByCommunityId converts the 0-indexed array to a {"1": val, ..., "77": val} map
      setCounts(targetsToCountsByCommunityId(targets));
      setLoading(false);
    }).catch((err) => {
      if (err?.name === "AbortError") return;
      if (cancelled) return;
      console.error("relationModel failed:", err);
      setError(String(err?.message ?? err));
      setCounts(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeMode, layer, relationSelectedId, model, dataMode, pastStart, pastDays, futureStart, futureEnd, direction]);

  //Return the counts, loading state, and error state
  return { counts, loading, error };
}