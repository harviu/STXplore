//array of colors for the choropleth map
/**
 * Colors for the choropleth and relation maps. 
 * Each array is ordered from low to high values, with 5 stops each. 
 * Yellow → orange → red choropleth colors for crime counts
 * Light blue → teal → dark green relation colors for relation counts
 * 
 */
export const CHOROPLETH_STOPS = [
  "#ffffb2", // light yellow (low)
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026", // dark red (high)
];

export const RELATION_STOPS = [
  "#0acaff", //light blue (low)
  "#4ae4e4",
  "#66c2a4",
  "#2ca25f",
  "#006d2c", //dark green (high)
];