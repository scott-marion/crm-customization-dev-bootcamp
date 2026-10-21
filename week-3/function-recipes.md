# Function Recipes

Copy-paste patterns for 2026.09 app functions. Each one is self-contained. Every recipe returns `{ statusCode, body }`, with `body.error` set when something went wrong, so the card-side helper at the bottom works with all of them.

## The skeleton

```js
// src/app/functions/myFunction.js
exports.main = async (context) => {
  const { portalId, user, parameters, propertiesToSend } = context;
  // user is undefined under `hs project dev`; present after upload.

  if (!parameters?.thing) {
    return { statusCode: 400, body: { error: "thing is required" } };
  }

  try {
    const result = await doWork(parameters.thing);
    return { statusCode: 200, body: result };
  } catch (err) {
    console.error("myFunction failed:", err.message);
    return { statusCode: 500, body: { error: "Something went wrong. Try again." } };
  }
};
```

```json
// src/app/functions/myFunction-hsmeta.json
{
  "uid": "myFunction",
  "type": "app-function",
  "config": { "entrypoint": "/app/functions/myFunction.js", "secretKeys": [] }
}
```

```jsx
// in the card
const result = await hubspot.serverless("myFunction", {
  parameters: { thing: "value" },
  propertiesToSend: ["firstname", "zip"],   // optional; only on CRM record cards
});
```

## External API with Axios

```js
const axios = require("axios");

exports.main = async (context) => {
  const { query } = context.parameters;
  try {
    const res = await axios.get("https://api.example.com/search", {
      params: { q: query, limit: 10 },   // Axios encodes the query string
      timeout: 5000,                      // always; functions die at 15s
      headers: { Authorization: `Bearer ${process.env.EXAMPLE_API_KEY}` },
    });
    return { statusCode: 200, body: { items: res.data.items } };
  } catch (err) {
    const status = err.response?.status;          // upstream HTTP status, if any
    console.error("search failed:", status, err.response?.data ?? err.message);
    if (err.code === "ECONNABORTED") return { statusCode: 504, body: { error: "Upstream timed out." } };
    if (status === 401 || status === 403) return { statusCode: 502, body: { error: "API key rejected." } };
    if (status === 404) return { statusCode: 404, body: { error: "Nothing found." } };
    return { statusCode: 502, body: { error: "Upstream unavailable." } };
  }
};
```

Add the key with `hs secret add EXAMPLE_API_KEY`, list it in `secretKeys`, upload.

## HubSpot API with Axios

```js
const axios = require("axios");

const hubspot = () =>
  axios.create({
    baseURL: "https://api.hubapi.com",
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`,  // built in
      "Content-Type": "application/json",
    },
  });
```

Create the client inside `main`, not at module level, so nothing runs during cold start before the function is called.

### Read one record

```js
const res = await hubspot().get(`/crm/v3/objects/contacts/${id}`, {
  params: { properties: "firstname,lastname,zip" },
});
return { statusCode: 200, body: res.data.properties };
```

### Associations, then batch read

```js
const assoc = await hubspot().get(`/crm/v4/objects/contacts/${contactId}/associations/p_rental_agreements`);
const ids = assoc.data.results.map((r) => r.toObjectId);
if (ids.length === 0) return { statusCode: 200, body: { agreements: [] } };

const batch = await hubspot().post("/crm/v3/objects/p_rental_agreements/batch/read", {
  inputs: ids.map((id) => ({ id })),
  properties: ["name", "start_date", "end_date", "cost_per_day", "total_days", "insurance"],
});
return { statusCode: 200, body: { agreements: batch.data.results } };
```

Custom objects are `p_<object name>` in paths. Scope: `crm.objects.custom.read`.

### Search

```js
const res = await hubspot().post("/crm/v3/objects/p_vehicles/search", {
  filterGroups: [{ filters: [
    { propertyName: "available", operator: "EQ", value: "true" },
    { propertyName: "daily_price", operator: "LTE", value: String(maxPrice) },
  ] }],
  sorts: [{ propertyName: "daily_price", direction: "ASCENDING" }],
  properties: ["make", "model", "year", "daily_price"],
  limit: 20,
});
return { statusCode: 200, body: { vehicles: res.data.results } };
```

If the card only needs a search and nothing else, `useCrmSearch` in the card does this without a function.

### Write

```js
const res = await hubspot().post("/crm/v3/objects/p_rental_agreements", {
  properties: { name, start_date, end_date, cost_per_day, total_days, insurance },
  associations: [
    { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: contactTypeId }] },
  ],
});
return { statusCode: 201, body: { id: res.data.id } };
```

Writes need the `.write` scope for the object. Look up `associationTypeId` with `GET /crm/v4/associations/contacts/p_rental_agreements/labels`.

### Error mapping for HubSpot calls

```js
} catch (err) {
  const status = err.response?.status;
  const message = err.response?.data?.message ?? err.message;
  console.error("hubspot call failed:", status, message);
  if (status === 403) return { statusCode: 403, body: { error: "Missing scope. Add it to app-hsmeta.json and upload." } };
  if (status === 429) return { statusCode: 429, body: { error: "Rate limited. Try again in a moment." } };
  return { statusCode: status ?? 500, body: { error: message } };
}
```

## GraphQL

One request, nested data, only the fields you name. Build and test the query in HubSpot's GraphiQL tool first. Scopes: `collector.graphql_schema.read`, `collector.graphql_query.execute`, plus the read scope for each object in the query.

```js
const QUERY = `
  query rentalHistory($contactId: String!) {
    CRM {
      contact(uniqueIdentifier: "id", uniqueIdentifierValue: $contactId) {
        firstname
        associations {
          p_rental_agreements_collection__rental_agreement_to_contact {
            items { name start_date end_date cost_per_day }
          }
        }
      }
    }
  }`;

const res = await hubspot().post("/collector/graphql", {
  operationName: "rentalHistory",
  query: QUERY,
  variables: { contactId: String(contactId) },
});
if (res.data.errors) {
  console.error(JSON.stringify(res.data.errors));
  return { statusCode: 502, body: { error: res.data.errors[0].message } };
}
return { statusCode: 200, body: res.data.data.CRM.contact };
```

The association field name is `p_<object>_collection__<label suffix>`. GraphiQL's Explorer pane shows the exact name for your account. Responses include `extensions.query_complexity`; a single query is capped at 30,000 points.

## HubSQL

SQL with HubSpot extensions. Today it runs behind the Agent CLI (`hubspot query`) and the remote MCP server's `query_crm_data` tool. Before calling it from a function, check the developer docs for the current endpoint and scopes. A HubSQL hook for React cards is likely to land, and when it does, aggregate-for-the-card functions turn into one hook call.

## Secrets

```bash
hs secret add STRIPE_SECRET_KEY     # prompts for the value, never echoed
hs secret list
hs secret update STRIPE_SECRET_KEY
hs secret delete STRIPE_SECRET_KEY
```

```json
"config": { "entrypoint": "/app/functions/charge.js", "secretKeys": ["STRIPE_SECRET_KEY"] }
```

```js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
```

Upload after adding a secret. A secret is only visible to functions that list it.

## Card-side helper

```js
// src/app/cards/useFunction.js
import { useState } from "react";
import { hubspot } from "@hubspot/ui-extensions";

export function useFunction(uid) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const call = async (options = {}) => {
    setState({ status: "loading", data: null, error: null });
    try {
      const result = await hubspot.serverless(uid, options);
      if (result && result.statusCode >= 400) throw new Error(result.body?.error ?? `${uid} returned ${result.statusCode}`);
      setState({ status: "loaded", data: result?.body ?? result, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message ?? String(err) });
    }
  };
  return { ...state, call, isLoading: state.status === "loading" };
}
```

```jsx
const history = useFunction("getRentalHistory");
<Button onClick={() => history.call({ parameters: { contactId: crm.objectId } })} disabled={history.isLoading}>
  Load rental history
</Button>
{history.status === "error" && <Alert title="Function failed" variant="error">{history.error}</Alert>}
{history.data && <DataTable data={history.data.agreements} columns={COLUMNS} />}
```

For data the card needs on load, call it from a `useEffect` once, and show `LoadingSpinner` until `status === "loaded"`.

## Test locally before upload

```bash
cd src/app/functions
node -e "require('./getPickupWeather').main({ parameters: { zip: '37203' } }).then(r => console.log(JSON.stringify(r, null, 2)))"
```

For HubSpot calls, export a private app token first:

```bash
PRIVATE_APP_ACCESS_TOKEN=pat-na1-... node -e "require('./getRentalHistory').main({ parameters: { contactId: '123' } }).then(r => console.log(JSON.stringify(r, null, 2)))"
```
