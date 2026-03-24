import { useEffect, useState } from "react";
import { request } from "../lib/api";

/**
 * A component for checking the health of the API.
 * Can be used to verify that the backend is running and responding correctly.
 * Currently not used in the main app, but can be rendered in isolation for testing purposes.
 * 
 * @returns {JSX.Element}
 */
//Debugging for API. Not used but is kept for future development and testing purposes
//Use when first setting up api
export default function HealthCheck() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    request("/api/health")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div style={{ color: "red" }}>{err}</div>;
  if (!data) return <div>Loading...</div>;

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
