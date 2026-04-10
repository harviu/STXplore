import { useApi } from "./useApi.js";
import { api } from "../lib/api.js";

/**
 * Fetches global min/max for SAGE and MI tensors for the given model.
 * Used to anchor color scales so 0 is always white and values are not normalized.
 * Re-fetches automatically when model changes.
 */
export function useValueBounds(model) {
  const { data, loading, error } = useApi(
    ({ signal }) => api.valueBounds(model, { signal }),
    [model]
  );
  return {
    sageBounds: data?.sage ?? null,
    miBounds:   data?.mi   ?? null,
    loading,
    error,
  };
}