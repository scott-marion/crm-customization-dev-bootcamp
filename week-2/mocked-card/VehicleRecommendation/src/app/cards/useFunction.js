import { useState } from "react";
import { hubspot } from "@hubspot/ui-extensions";

// One tiny hook for every function call in the card.
//
// It wraps hubspot.serverless(uid, { parameters, propertiesToSend }) and turns
// the function's { statusCode, body } return value into loading / loaded /
// error state the card can render. Any statusCode of 400 or above becomes an
// error with the function's own message, so the card never has to inspect
// the shape of a failed response.
export function useFunction(uid) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  const call = async (options = {}) => {
    // Keep the previous data while reloading, so the card doesn't collapse to a
    // spinner and back (that height change makes the record page jump).
    setState((prev) => ({ status: "loading", data: prev.data, error: null }));
    try {
      const result = await hubspot.serverless(uid, options);
      if (result && result.statusCode >= 400) {
        throw new Error(result.body?.error ?? `${uid} returned ${result.statusCode}`);
      }
      setState({ status: "loaded", data: result?.body ?? result, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message ?? String(err) });
    }
  };

  return { ...state, call, isLoading: state.status === "loading" };
}
