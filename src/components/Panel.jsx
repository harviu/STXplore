export default function Panel({ title, children, style, fill = false }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        padding: 12,
        ...(fill ? { height: "100%", minHeight: 0, display: "flex", flexDirection: "column" } : {}),
        ...style,
      }}
    >
      {title ? <h3 style={{ margin: "0 0 10px 0" }}>{title}</h3> : null}
      {children}
    </div>
  );
}
