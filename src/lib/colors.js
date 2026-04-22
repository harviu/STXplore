//array of colors for the choropleth map
/**
 * Colors for the choropleth and relation maps. 
 * Each array is ordered from low to high values, with 5 stops each. 
 * Yellow → orange → red choropleth colors for crime counts
 * Light blue → teal → dark green relation colors for relation counts
 * 
 */
//used for crime counts which should be positive
export const CHOROPLETH_STOPS = [
  "#ffffb2", // light yellow (low)
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026", // dark red (high)
];

//for positive relational values
export const RELATION_STOPS = [
  "#0acaff", //light blue (low)
  "#4ae4e4",
  "#66c2a4",
  "#2ca25f",
  "#006d2c", //dark green (high)
];

/**
 * SAGE attribution color stops: red (negative/suppressive) → white (zero) → green (positive/amplifying).
 * Used when visualizing SAGE values which are signed, unlike MI which is always non-negative.
 * Negative = source community suppresses target crime prediction.
 * Positive = source community amplifies target crime prediction.
 */
//Implicit color scale as people interpret red/green scales as good/bad
export const SAGE_STOPS = [
  "#d73027",
  "#f46d43",
  "#fee08b",
  "#a6d96a",
  "#66bd63",
  "#1a9850",
];

//Neutral color scale
export const ERROR_STOPS = [
  "#171e9b", 
  "#306dbc",
  "#d0d1c6", // white (zero error)
  "#ff511c",
  "#a50026", 
];