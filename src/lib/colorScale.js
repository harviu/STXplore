import * as d3 from "d3";
import {
  CHOROPLETH_STOPS,
  ERROR_STOPS,
  RELATION_STOPS,
  SAGE_STOPS,
} from "./colors.js";

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Return a non-degenerate symmetric domain based on the observed values. */
export function getSymmetricColorDomain(minValue, maxValue) {
  const min = finiteOr(minValue, 0);
  const max = finiteOr(maxValue, 0);
  const observedAbsMax = Math.max(Math.abs(min), Math.abs(max));
  // D3 and Mapbox require distinct domain endpoints. This fallback is used
  // only when every value is exactly zero; it is not a visible minimum range.
  const absMax = observedAbsMax || Number.EPSILON;
  return [-absMax, absMax];
}

/**
 * Build the shared sequential color scale used by heatmap cells and temporal
 * tooltip bars.
 *
 * SAGE/SHAP and error values use a symmetric domain around zero. MI and raw
 * counts use [0, max]. Piecewise RGB interpolation visits every configured
 * color stop exactly, so SAGE/SHAP value 0 maps to the white midpoint.
 */
export function createColorScale(
  minValue,
  maxValue,
  {
    isRelationMap = false,
    isSageMap = false,
    isErrorMap = false,
    useObservedDomain = false,
  } = {},
) {
  const min = finiteOr(minValue, 0);
  const max = finiteOr(maxValue, 0);
  const isDiverging = isSageMap || isErrorMap;
  const stops = isSageMap
    ? SAGE_STOPS
    : isErrorMap
      ? ERROR_STOPS
      : isRelationMap
        ? RELATION_STOPS
        : CHOROPLETH_STOPS;

  const observedDomain = min === max
    ? [min, min + Number.EPSILON]
    : [min, max];
  const domain = isDiverging
    ? getSymmetricColorDomain(min, max)
    : useObservedDomain || isRelationMap
      ? observedDomain
      : [0, Math.max(0, max) || 1];

  return d3
    .scaleSequential()
    .interpolator(d3.piecewise(d3.interpolateRgb, stops))
    .domain(domain);
}
