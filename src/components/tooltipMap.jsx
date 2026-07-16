import { createColorScale } from "../lib/colorScale.js";

/**
 * Component for the small bar chart you see when you hover over a boundary. 
 * It shows the daily counts for the past and future days relative to the anchor date, with weekly tick marks. 
 * Bar colors use the same shared domain and color stops as the cluster heatmap.
 * 
 * @param {Object} props - The properties for the TooltipMap component.
 * @param {Array} props.days - An array of objects representing daily counts, where each object has a 'date' and 'count' property. 
 * @param {number} [props.height=12] - The height of the bars in pixels. Default is 12.
 * @param {boolean} [props.isRelationMap=false] - A flag indicating whether to use relation map color stops. Default is false.
 * @param {boolean} [props.isSageMap=false] - A flag indicating whether to use sage map color stops. Default is false.
 * @param {Array} [props.highlightDates=null] - An array of dates to highlight.
 * @returns {JSX.Element}
 */
//The box component you see when you hover
export default function TooltipMap({ days, height = 12, isRelationMap = false, isSageMap = false, highlightDates = null, globalMin = null, globalMax = null }) {
  const values = (days ?? []).map((day) => Number(day.count) || 0);
  const max = globalMax ?? (values.length > 0 ? Math.max(...values) : 0);
  const min = globalMin ?? (values.length > 0 ? Math.min(...values) : 0);
  const colorScale = createColorScale(min, max, { isRelationMap, isSageMap });
  const tickHeight = height + 8; // taller than bars
  const tickTop = -4; // extend above and below bar row
  const hasHighlight = highlightDates != null && highlightDates.length > 0;

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
        {(days ?? []).map((d) => {
          const c = d.count || 0;

          const background = colorScale(c);

          const isHighlighted = hasHighlight && highlightDates.includes(d.date);
          const isDimmed = hasHighlight && !isHighlighted;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${c}`}
              style={{
                flex: "1 1 0",
                height,
                borderRadius: 2,
                background,
                opacity: isDimmed ? 0.2 : 1,
                outline: isHighlighted ? "1px solid cyan" : "none",
                outlineOffset: "-1px",
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
