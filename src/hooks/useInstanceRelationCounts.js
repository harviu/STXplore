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
      setCounts(null);
      setLoading(false);
      setError(null);
      return;
    }

    //Get the source index
    const sourceIdx = Number(instanceSelectedId) - 1;
    if (!Number.isFinite(sourceIdx) || sourceIdx < 0 || sourceIdx > 76) {
      setError("Invalid community id for instance relation.");
      setLoading(false);
      setCounts(null);
      return;
    }

    //Abort controller for the instance relation counts
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    //Set the error to null
    setError(null);

    //Fetch the instance relation counts
    (dataMode === "sage"
    ? api.instanceLevelSage(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
    : api.instanceLevelRelation(sourceIdx, model, pastStart, pastDays, futureStart, futureEnd, { signal: ac.signal })
    ).then((data) => {
        if (cancelled) return;
        //Format the data
        const targets = data?.targets;
        if (!Array.isArray(targets) || targets.length !== RELATION_TARGET_LEN) {
          throw new Error("Instance relation API returned invalid targets array.");
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
        console.error("instanceLevelRelation failed:", err);
        //Set the error to the error message
        setError(String(err?.message ?? err));
        //Set the counts to null
        setCounts(null);
        setLoading(false);
      });

    return () => {
      //Set the cancelled flag to true
      cancelled = true;
      //Abort the abort controller
      ac.abort();
    };
  }, [activeMode, instanceSelectedId, model, pastStart, pastDays, futureStart, futureEnd, dataMode]);

  //Return the counts, loading state, and error state
  return { counts, loading, error };
}
