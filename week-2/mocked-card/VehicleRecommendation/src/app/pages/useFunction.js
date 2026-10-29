import { useState } from "react";
import { hubspot } from "@hubspot/ui-extensions";

// Same hook as cards/useFunction.js. Each component folder is bundled on its
// own, so the pages keep their own copy.
//
// It wraps hubspot.serverless(uid, { parameters }) and turns the function's
// { statusCode, body } return value into loading / loaded / error state. Any
// statusCode of 400 or above becomes an error with the function's own message.
export function useFunction(uid) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  const call = async (options = {}) => {
    // Keep the previous data while reloading, so the page doesn't collapse to a
    // spinner and back.
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
