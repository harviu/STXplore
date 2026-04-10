import "./Panel.css";

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
  return (
    <div className={`panel${fill ? " panel--fill" : ""}`} style={style}>
      {title ? <h3 className="panel__title">{title}</h3> : null}
      {children}
    </div>
  );
}
