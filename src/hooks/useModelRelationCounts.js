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
    const targetIdx = Number(relationSelectedId) - 1;
    if (!Number.isFinite(targetIdx) || targetIdx < 0 || targetIdx > 76) {
      setError("Invalid community id for relation mapping.");
      setLoading(false);
      return;
    }

    //Abort controller for the model relation counts
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    //Set the error to null
    setError(null);

    //Fetch the model relation counts
    //Fetch the model relation counts
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
    //Abort the abort controller
    return () => {
      //Set the cancelled flag to true
      cancelled = true;
      //Abort the abort controller
      ac.abort();
    };
  }, [activeMode, layer, relationSelectedId, model, dataMode, pastStart, pastDays, futureStart, futureEnd, direction]);

  //Return the counts, loading state, and error state
  return { counts, loading, error };
}
