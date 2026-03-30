import { CHOROPLETH_STOPS, RELATION_STOPS, SAGE_STOPS} from "../lib/colors.js"

//Helper functions:
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
function choroplethColor(t, isRelationMap = false, isSageMap = false) {
  const stops = isSageMap ? SAGE_STOPS : isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS;
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.floor(x);
  const frac = x - i;
  if (i >= n) return stops[n];
  return lerpColor(stops[i], stops[i + 1], frac);
}

/**
 * Component for the small bar chart you see when you hover over a boundary. 
 * It shows the daily counts for the past and future days relative to the anchor date, with weekly tick marks. 
 * The color of the bars is determined by the choroplethColor function, which maps counts to colors based on the provided color stops.
 * 
 * @param {Object} props - The properties for the TooltipMap component.
 * @param {Array} props.days - An array of objects representing daily counts, where each object has a 'date' and 'count' property. 
 * @param {number} [props.height=12] - The height of the bars in pixels. Default is 12.
 * @param {boolean} [props.isRelationMap=false] - A flag indicating whether to use relation map color stops. Default is false.
 * @returns {JSX.Element}
 */
//The box component you see when you hover
export default function TooltipMap({ days, height = 12, isRelationMap = false, isSageMap = false }) {
  const max = (days ?? []).reduce((m, d) => Math.max(m, d.count || 0), 0);
  const min = (days ?? []).reduce((m, d) => Math.min(m, d.count || max), max);
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
              :  isSageMap
              // SAGE: map signed value to [0,1] where 0.5 = zero, <0.5 = suppressive (red), >0.5 = amplifying (green)
              ? choroplethColor((max === min ? 0.5 : (c-min) / (max - min)), false, true)
              : choroplethColor((max === min ? 1 : (c-min) / (max - min)), isRelationMap);

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