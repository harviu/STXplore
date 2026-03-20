/** One map "facet": choropleth layer + selected feature id (per tab). */
export const initialMapFaces = {
  source: { layer: "community", selectedId: null },
  relation: { layer: "community", selectedId: null },
  instance: { layer: "community", selectedId: null },
  target: { layer: "community", selectedId: null },
  actual: { layer: "community", selectedId: null },
  error: { layer: "community", selectedId: null },
};

/**
 * @param {typeof initialMapFaces} state
 * @param {{ type: 'SET_FACET_LAYER', facet: string, layer: string, clearSelection?: boolean } | { type: 'SET_FACET_SELECTION', facet: string, selectedId: string | null }} action
 */
export function mapFacesReducer(state, action) {
  switch (action.type) {
    case "SET_FACET_LAYER": {
      const { facet, layer, clearSelection = true } = action;
      const cur = state[facet];
      if (!cur) return state;
      return {
        ...state,
        [facet]: {
          layer,
          selectedId: clearSelection ? null : cur.selectedId,
        },
      };
    }
    case "SET_FACET_SELECTION": {
      const { facet, selectedId } = action;
      const cur = state[facet];
      if (!cur) return state;
      return {
        ...state,
        [facet]: { ...cur, selectedId },
      };
    }
    default:
      return state;
  }
}
