/**
 * A reusable panel component for consistent styling and structure.
 * 
 * @param {Object} props - The properties for the panel.
 * @param {string} props.title - The title of the panel.
 * @param {React.ReactNode} props.children - The child nodes to render inside the panel.
 * @param {Object} [props.style] - Additional styles for the panel.
 * @param {boolean} [props.fill=false] - Whether the panel should fill its container.
 * @returns {JSX.Element} The rendered panel component.
 */
export default function Panel({ title, children, style, fill = false }) {
  //Reuseable panel component to simplify repeated styling and structure
  return (
    <div
      style={{
        boxSizing: "border-box",
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
