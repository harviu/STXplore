//coloring for the box in tooltip
const CHOROPLETH_STOPS = [
  "#ffffb2",
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026",
];
const RELATION_STOPS = [
  "#0acaff", //light blue (low)
  "#4ae4e4",
  "#66c2a4",
  "#2ca25f",
  "#006d2c", //dark green (high)
];

//Converts hex color to rgb color
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

//simple linear interpolation 
function lerp(a, b, t) {
  return a + (b - a) * t;
}

//linerly interpolates between two hex colors (gets middle values)
function lerpColor(aHex, bHex, t) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const b2 = Math.round(lerp(a.b, b.b, t));
  return `rgb(${r}, ${g}, ${b2})`;
}

//Assigns a color
function choroplethColor(t, isRelationMap = false) {
  const stops = isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS;
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.floor(x);
  const frac = x - i;
  if (i >= n) return stops[n];
  return lerpColor(stops[i], stops[i + 1], frac);
}

//The box component you see when you hover
export default function TooltipMap({ days, height = 12, isRelationMap = false }) {
  const max = (days ?? []).reduce((m, d) => Math.max(m, d.count || 0), 0);
  const tickHeight = height + 8; // taller than bars
  const tickTop = -4; // extend above and below bar row

  return (
    <div
      style={{
        position: "relative",
        marginTop: 6,
        width: "100%",
      }}
    >
      {/* Bars */}
      <div style={{ display: "flex", gap: 1, width: "100%" }}>
        {(days ?? []).map((d, idx) => {
          const c = d.count || 0;

          const background =
            c === 0 || max === 0
              ? "rgba(255,255,255, 0.9)"
              : choroplethColor(c / max, isRelationMap);

          return (
            <div
              key={d.date}
              title={`${d.date}: ${c}`}
              style={{
                flex: "1 1 0",
                height,
                borderRadius: 2,
                background,
              }}
            />
          );
        })}
      </div>

      {/* Weekly tick marks (every 7 days) */}
      {(days ?? []).map((_, idx) => {
        if (idx === 0) return null;
        if (idx % 7 !== 0) return null;

        // tick position as % across the row
        const leftPct = (idx / (days.length || 1)) * 100;

        return (
          <div
            key={`tick-${idx}`}
            style={{
              position: "absolute",
              top: tickTop,
              left: `calc(${leftPct}% - 0.5px)`,
              width: 1,
              height: tickHeight,
              background: "rgba(255,255,255,0.9)",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}