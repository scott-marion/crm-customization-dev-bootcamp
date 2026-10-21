// Function 3: the HubSpot API with Axios.
//
// Reads the Rental Agreements associated with the contact the card is open on.
// Two calls:
//   1. Associations v4   contact -> rental agreement IDs
//   2. Batch read        IDs -> properties
//
// Auth is the built-in PRIVATE_APP_ACCESS_TOKEN secret. You don't add it; it
// is injected into every private function. Its permissions are the
// requiredScopes in app-hsmeta.json, so a 403 here means "add the scope and
// upload again", not "wrong token".
//
// dayjs is here to prove the point that any public npm package works. It
// fills in total_days when the agreement doesn't have it.

const axios = require("axios");
const dayjs = require("dayjs");

// Custom objects are addressed as p_<object name> in API paths.
const AGREEMENT_TYPE = "p_rental_agreements";
const AGREEMENT_PROPERTIES = ["name", "start_date", "end_date", "cost_per_day", "total_days", "insurance"];

const fail = (statusCode, error) => ({ statusCode, body: { error } });

exports.main = async (context) => {
  const contactId = context.parameters?.contactId;
  if (!contactId) {
    return fail(400, "contactId is required");
  }

  // One client for every HubSpot call: base URL, auth header, timeout.
  const hubspot = axios.create({
    baseURL: "https://api.hubapi.com",
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  try {
    const assoc = await hubspot.get(`/crm/v4/objects/contacts/${contactId}/associations/${AGREEMENT_TYPE}`);
    const ids = assoc.data.results.map((r) => r.toObjectId);

    if (ids.length === 0) {
      return { statusCode: 200, body: { agreements: [] } };
    }

    const batch = await hubspot.post(`/crm/v3/objects/${AGREEMENT_TYPE}/batch/read`, {
      inputs: ids.map((id) => ({ id })),
      properties: AGREEMENT_PROPERTIES,
    });

    // Shape the data for the card here, on the server. The card should only
    // have to render it.
    const agreements = batch.data.results
      .map((record) => {
        const p = record.properties;
        const start = p.start_date ? dayjs(p.start_date) : null;
        const end = p.end_date ? dayjs(p.end_date) : null;
        const totalDays =
          p.total_days != null ? Number(p.total_days) : start && end ? Math.max(end.diff(start, "day"), 1) : null;
        const costPerDay = p.cost_per_day != null ? Number(p.cost_per_day) : null;

        return {
          id: record.id,
          name: p.name ?? null,
          startDate: p.start_date ?? null,
          endDate: p.end_date ?? null,
          totalDays,
          costPerDay,
          total: totalDays != null && costPerDay != null ? totalDays * costPerDay : null,
          insurance: p.insurance === "true" || p.insurance === true,
        };
      })
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

    return { statusCode: 200, body: { agreements } };
  } catch (err) {
    const status = err.response?.status;
    console.error("getRentalHistory failed:", status, err.response?.data?.message ?? err.message);
    if (status === 403) {
      return fail(403, "Missing scope. Add crm.objects.custom.read to app-hsmeta.json and run hs project upload.");
    }
    if (status === 404) {
      return fail(404, `Object type ${AGREEMENT_TYPE} not found. Did you import data/ into this account?`);
    }
    return fail(status ?? 500, err.response?.data?.message ?? "HubSpot API request failed.");
  }
};
