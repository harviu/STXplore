import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { addDaysISO, sourceRange, targetRange } from "../lib/dates.js";
import { fillDaily } from "../lib/crimeAggregates.js";

/**
 * Debounced fetch of daily series for the map hover tooltip (standard selectionDaily or 4D relation path).
 */
/** @param {string|null|undefined} tensorSourceId Community id used as tensor source for relation/instance visualization (Predicted map selection). */
export function useHoverDailySeries({ hover, activeMode, secondaryMode, tensorSourceId, model, dataMode = "mi", pastStart = 0, pastEnd, tPastStart = 0, tPastDays, futureStart, futureEnd, anchorDate, forecastAnchorDate, shapHorizon }) {
  // canShowHoverData gates whether the tooltip actually fetches and displays data.
  // Left map: always show for source mode; only show for relation/instance if a target community
  //   is already selected (tensorSourceId) — without it there's nothing to slice the tensor against.
  // Right map: only show in actual mode, since predicted/error values are choropleth totals
  //   not day-by-day series, and relation mode attribution isn't per-day.
  const canShowHoverData = useMemo(
    () =>
      !!(
        hover &&
        ((hover.which === "left" &&
          (activeMode === "source" ||
            (activeMode === "relation" && !!tensorSourceId) ||
            (activeMode === "instance" && !!tensorSourceId))) ||
          (hover.which === "right" && secondaryMode === "actual"))
      ),
    [hover, activeMode, secondaryMode, tensorSourceId]
  );

  //State for the hover daily series
  const [hoverDaily, setHoverDaily] = useState(null);
  const [hoverDailyLoading, setHoverDailyLoading] = useState(false);
  //Cache for the hover daily series
  const hoverCacheRef = useRef(new Map());
  //Abort controller for the hover daily series
  const hoverAbortRef = useRef(null);
  //Timer for the hover daily series
  const hoverTimerRef = useRef(null);
  //Effect to fetch the hover daily series

  useEffect(() => {
    //If the hover data is not valid, set the hover daily series to null and set the loading to false
    if (!hover || !hover.id || !hover.layer || !canShowHoverData) {
      setHoverDaily(null);
      setHoverDailyLoading(false);
      return;
    }


     //Check if the hover is on the left or right
    const isLeft = hover.which === "left";
    const isInstance = isLeft && activeMode === "instance";
    const isRelation = isLeft && activeMode === "relation";

    //Get the start and end dates
    let start;
    let end;
    if (isLeft) {
      ({ start, end } = sourceRange(pastStart, pastEnd, anchorDate));
    } else {
      ({ start, end } = targetRange(futureStart, futureEnd, anchorDate));
    }

    // Cache key encodes all inputs that determine a unique data response.
    // Instance mode needs a different key shape because the data comes from SHAP
    // (anchored to forecastAnchorDate + shapHorizon + tensorSourceId) rather than
    // a date range query — the same hovered community can have different values
    // depending on which target and horizon are currently selected.
    const key = isInstance
      ? `instance:${hover.id}:${forecastAnchorDate}:${shapHorizon}:${tensorSourceId}`
      : `${hover.which}:${hover.layer}:${hover.id}:${start}:${end}:${isRelation}`;

    //Check if the hover daily series is cached
    const cached = hoverCacheRef.current.get(key);
    if (cached) {
      setHoverDaily(cached);
      setHoverDailyLoading(false);
      return;
    }

    //Clear the timeout and abort controller
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (hoverAbortRef.current) hoverAbortRef.current.abort();

    //Set the timeout and abort controller
    hoverTimerRef.current = setTimeout(() => {
      const ac = new AbortController();
      hoverAbortRef.current = ac;

      //Set the hover daily series to null and set the loading to true
      setHoverDaily(null);
      setHoverDailyLoading(true);

    //Instance Level: fetch SHAP values and extract daily series for hovered community
    if (isInstance && tensorSourceId && forecastAnchorDate && shapHorizon) {
      api
        .predictionInstanceShap(forecastAnchorDate, model, shapHorizon, Number(tensorSourceId), { signal: ac.signal })
        .then((data) => {
          const commIdx = Number(hover.id) - 1;
          const rows = data?.shap_values ?? [];
          // shap_values is ordered oldest→newest; map each history row to a real date
          const formatted = rows.map((row, i) => ({
            date: addDaysISO(anchorDate, -(rows.length - 1 - i)),
            count: row.values?.[commIdx] ?? 0,
          }));
          hoverCacheRef.current.set(key, formatted);
          setHoverDaily(formatted);
          setHoverDailyLoading(false);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("Instance SHAP hover fetch failed:", err);
          setHoverDaily(null);
          setHoverDailyLoading(false);
        });
      //Model/Data Level: fetch daily relation values from 4D tensor
      // Args: source community (hovered, 0-based), target community (tensorSourceId, 0-based),
      // sliced to the current past window. Returns a 1D array of values over history days.
      } else if (isRelation && tensorSourceId) {
        api
          .get4dData(tPastDays ?? pastEnd, true, Number(hover.id) - 1, 30, true, Number(tensorSourceId) - 1, model, dataMode, {
            signal: ac.signal,
            d3Start: 0,
            d1Start: tPastStart ?? 0,
          })
          .then((data) => {
            const nDays = data.length;
            const formatted = data.map((count, i) => ({
              date: addDaysISO(anchorDate, -(nDays -1 - i)),
              count,
            }));
            hoverCacheRef.current.set(key, formatted);
            setHoverDaily(formatted);
            setHoverDailyLoading(false);
          })
          .catch((err) => {
            if (err?.name === "AbortError") return;
            console.error("Get data for hover failed:", err);
            setHoverDaily(null);
            setHoverDailyLoading(false);
          });
      } else {
        if (!start || !end) {
          setHoverDaily(null);
          setHoverDailyLoading(false);
          return;
        }
        //Source mode or right map: fetch actual daily crime counts
        api
          .selectionDailyCsv(hover.id, start, end, { signal: ac.signal })
          .then((data) => {
            //Fill the data
            const filled = fillDaily(start, end, data?.daily);
            hoverCacheRef.current.set(key, filled);
            setHoverDaily(filled);
            //Set the hover daily series to the filled data and set the loading to false
            setHoverDailyLoading(false);
          })
          .catch((err) => {
            if (err?.name === "AbortError") return;
            console.error("selection Daily Failed:", err);
            setHoverDaily(null);
            setHoverDailyLoading(false);
          });
      }
    }, 200);

    return () => {
      //Clear the timeout and abort controller
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (hoverAbortRef.current) hoverAbortRef.current.abort();
    };
    }, [hover?.which, hover?.id, hover?.layer, activeMode, secondaryMode, tensorSourceId, pastEnd, tPastStart, tPastDays, futureStart, futureEnd, anchorDate, canShowHoverData, model, dataMode, forecastAnchorDate, shapHorizon]);
  //Return the hover daily series, loading state, and whether the hover data can be shown
  return { hoverDaily, hoverDailyLoading, canShowHoverData };
}