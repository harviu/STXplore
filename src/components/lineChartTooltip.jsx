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
 * @param {number} [props.height=30] - The height of the bars in pixels. Default is 30.
 * @param {boolean} [props.isRelationMap=false] - A flag indicating whether to use relation map color stops. Default is false.
 * @param {boolean} [props.isSageMap=false] - A flag indicating whether to use sage map color stops. Default is false.
 * @param {Array} [props.highlightDates=null] - An array of dates to highlight.
 * @returns {JSX.Element}
 */
export function LineChart({ days, height = 30, isRelationMap = false, isSageMap = false }) {
  const data = days ?? [];
  if (data.length === 0) return null;

  const labelGutter = 35;

  const max = data.reduce((m, d) => Math.max(m, d.count || 0), 0);
  const min = data.reduce((m, d) => Math.min(m, d.count || 0), 0);
  
  // Chart dimensions
  const width = 100; // Use viewBox for scaling
  const chartHeight = height;
  const padding = 2;

  // Generate points for the line: x is % index, y is scaled value
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    // Inverse Y because SVG 0 is top. If max=min, put line in middle.
    const y = max === min 
      ? chartHeight / 2 
      : chartHeight - ((d.count - min) / (max - min)) * (chartHeight - padding * 2) - padding;
    return `${x},${y}`;
  }).join(" ");

 return (
    <div style={{ 
      position: "relative", 
      marginTop: 12, 
      width: "100%", 
      paddingLeft: labelGutter, // Shift everything right to make room for Y-scale
      boxSizing: "border-box" 
    }}>
      
      {/* Y-Axis Scale (Moved to the left of the chart) */}
      <div style={{ 
        position: "absolute", 
        left: 0, 
        top: 0, 
        height: chartHeight,
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "space-between",
        fontSize: "9px", 
        fontWeight: "bold", 
        opacity: 0.7, 
        textAlign: "right", 
        width: labelGutter - 6 
      }}>
        <span>{Math.ceil(max*100)/100}</span>
        <span>{min}</span>
      </div>

      {/* Chart Wrapper */}
      <div style={{ position: "relative" }}>
        <svg 
          viewBox={`0 0 ${width} ${chartHeight}`} 
          style={{ width: "100%", height: chartHeight, overflow: "visible", display: "block" }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              {data.map((d, i) => {
                const offset = (i / (data.length - 1)) * 100;
                const val = d.count || 0;
                const color = isSageMap
                  ? choroplethColor((max === min ? 0.5 : (val - min) / (Math.max(1, max - min))), false, true)
                  : choroplethColor((max === min ? 1 : (val - min) / (Math.max(1, max - min))), isRelationMap);
                return <stop key={i} offset={`${offset}%`} stopColor={color} />;
              })}
            </linearGradient>
          </defs>

          {/* Line and Area */}
          <polyline fill="none" stroke="url(#line-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
          <polyline fill="url(#line-gradient)" fillOpacity="0.1" points={`${width},${chartHeight} 0,${chartHeight} ${points}`} />
        </svg>

        {/* Weekly tick marks */}
        {data.map((_, idx) => {
          if (idx === 0 || idx % 7 !== 0) return null;
          const leftPct = (idx / (data.length - 1)) * 100;
          return (
            <div key={`tick-${idx}`} style={{
                position: "absolute", top: 0, left: `${leftPct}%`, width: "1px", height: chartHeight,
                background: "rgba(255,255,255,0.15)", pointerEvents: "none"
            }} />
          );
        })}
      </div>

      {/* X-Axis Scale (Start date at bottom left, End date at bottom right) */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginTop: 4, 
        fontSize: "9px", 
        opacity: 0.6 
      }}>
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/**
 * Component for the small bar chart you see when you hover over a boundary. 
 * It shows the daily counts for the past and future days relative to the anchor date for multiple sets, with weekly tick marks. 
 * The color of the bars is determined by the choroplethColor function, which maps counts to colors based on the provided color stops.
 * 
 * @param {Object} props - The properties for the TooltipMap component.
 * @param {Array} props.days - An array of arrays of objects representing sets(arrays) of daily counts, where each object has a 'date' and 'count' property. Date ranges should be the same across all arrays.
 * @param {number} [props.height=30] - The height of the bars in pixels. Default is 30.
 * @param {boolean} [props.isRelationMap=false] - A flag indicating whether to use relation map color stops. Default is false.
 * @param {boolean} [props.isSageMap=false] - A flag indicating whether to use sage map color stops. Default is false.
 * @param {Array} [props.highlightDates=null] - An array of dates to highlight.
 * @returns {JSX.Element}
 */
export function MultiLineChart({ days, height = 30, isRelationMap = false, isSageMap = false }) {
  const data = days ?? [[]];
  if (data.length === 0) return null;

  const labelGutter = 35;

  const flatData = data.flatMap(row=>row?.map(d=>d.count || 0))
  const max = Math.max(...flatData);
  const min = Math.min(...flatData);
  
  // Chart dimensions
  const width = 100; // Use viewBox for scaling
  const chartHeight = height;
  const padding = 2;

  // Generate points for the line: x is % index, y is scaled value
  const getPoints = (dataset) => {
    return dataset.map((d, i) => {
      const x = (i / (dataset.length - 1)) * width;
      // Inverse Y because SVG 0 is top. If max=min, put line in middle.
      const y = max === min 
        ? chartHeight / 2 
        : chartHeight - ((d.count - min) / (max - min)) * (chartHeight - padding * 2) - padding;
      return `${x},${y}`;
    }).join(" ");
  };
  if (data[0] === null || data[1] === null) return;
 return (
    <div style={{ position: "relative", marginTop: 12, width: "100%", paddingLeft: labelGutter, boxSizing: "border-box" }}>
      
      {/* Shared Y-Axis */}
      <div style={{ position: "absolute", left: 0, top: 0, height: chartHeight, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "9px", fontWeight: "bold", opacity: 0.7, textAlign: "right", width: labelGutter - 6 }}>
        <span>{Math.ceil(max * 100) / 100}</span>
        <span>{min}</span>
      </div>

      <div style={{ position: "relative" }}>
        <svg 
          viewBox={`0 0 ${width} ${chartHeight}`} 
          style={{ width: "100%", height: chartHeight, overflow: "visible", display: "block" }}
          preserveAspectRatio="none"
        >
          {/* Loop to create unique gradients for each dataset if desired */}
          <defs>
            {data.map((_, j) => (
              <linearGradient key={`line-${j}`} id={`gradient-${j}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {data[j].map((d, i) => {
                const offset = (i / (data[j].length - 1)) * 100;
                const val = d.count || 0;
                const color = isSageMap
                  ? choroplethColor((max === min ? 0.5 : (val - min) / (Math.max(1, max - min))), false, true)
                  : choroplethColor((max === min ? 1 : (val - min) / (Math.max(1, max - min))), isRelationMap);
                return <stop key={i} offset={`${offset}%`} stopColor={color} />;
              })}
            </linearGradient>
            ))}
          </defs>

          {/* Loop to draw the lines */}
          {data.map((dataset, i) => {
            const points = getPoints(dataset);

            return (
              <polyline 
                key={`line-${i}`}
                fill="none" 
                stroke={`url(#gradient-${i})`} // Uses the dynamic gradient
                strokeWidth={i === 0 ? "2" : "1.5"} // Make the primary line slightly thicker
                strokeOpacity={i === 0 ? "1" : "0.6"} // Fade secondary lines
                strokeLinecap="round" 
                strokeLinejoin="round" 
                points={points} 
              />
            );
          })}
        </svg>

        {/* Weekly tick marks */}
        {data.map((_, idx) => {
          if (idx === 0 || idx % 7 !== 0) return null;
          const leftPct = (idx / (data.length - 1)) * 100;
          return (
            <div key={`tick-${idx}`} style={{
                position: "absolute", top: 0, left: `${leftPct}%`, width: "1px", height: chartHeight,
                background: "rgba(255,255,255,0.15)", pointerEvents: "none"
            }} />
          );
        })}
      </div>

      {/* X-Axis Scale (Start date at bottom left, End date at bottom right) */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginTop: 4, 
        fontSize: "9px", 
        opacity: 0.6 
      }}>
        <span>{data[0][0]?.date}</span>
        <span>{data[0][data.length - 1]?.date}</span>
      </div>
    </div>
  );
}