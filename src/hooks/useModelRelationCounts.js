import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { RELATION_TARGET_LEN, targetsToCountsByCommunityId } from "../lib/relationTargets.js";

/** Model-level relation map counts when left tab is "relation" and a community is selected. */
export function useModelRelationCounts(activeMode, layer, relationSelectedId) {
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
      setCounts(null);
      setLoading(false);
      setError(null);
      return;
    }

    //Get the source index
    const sourceIdx = Number(relationSelectedId) - 1;
    if (!Number.isFinite(sourceIdx) || sourceIdx < 0 || sourceIdx > 76) {
      setError("Invalid community id for relation mapping.");
      setCounts(null);
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
    api
      .relationalModel(sourceIdx, { signal: ac.signal })
      .then((data) => {
        if (cancelled) return;
        //Format the data
        const targets = data?.targets;
        if (!Array.isArray(targets) || targets.length !== RELATION_TARGET_LEN) {
          throw new Error("Relation API returned invalid targets array.");
        }
        //Set the counts to the formatted data
        setCounts(targetsToCountsByCommunityId(targets));
        setLoading(false);
      })
      .catch((err) => {
        //If the error is an abort error, return
        if (err?.name === "AbortError") return;
        //If the request is cancelled, return
        if (cancelled) return;
        console.error("relationModel failed:", err);
        //Set the error to the error message
        setError(String(err?.message ?? err));
        //Set the counts to null
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
  }, [activeMode, layer, relationSelectedId]);

  //Return the counts, loading state, and error state
  return { counts, loading, error };
}
