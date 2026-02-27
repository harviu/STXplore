import { useEffect, useState } from "react";
import { request } from "../lib/api";

//Debugging for API. Not used but is kept for future development and testing purposes
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
