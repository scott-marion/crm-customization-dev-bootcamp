// Rental agreements for the app page: every agreement with its contact,
// vehicle, dates, total and status (Active / Upcoming / Ended).
//
// Status and totals are worked out here, so the page only renders.
//
// Auth is the built-in PRIVATE_APP_ACCESS_TOKEN; its scopes are requiredScopes in app-hsmeta.json.

const axios = require("axios");

// Date-based API version for every HubSpot call in this function.
const HS_API_VERSION = "2026-09";

// Custom objects by their short name. If the API answers 404 for these,
// switch to the fully qualified names (p<portalId>_vehicles, ...).
const OBJECTS = {
  agreements: "p_rental_agreements",
  vehicles: "p_vehicles",
  contacts: "contacts",
};

const AGREEMENT_PROPERTIES = ["name", "start_date", "end_date", "cost_per_day", "total_days", "insurance"];
const STATUS_ORDER = { Active: 0, Upcoming: 1, Ended: 2 };

const fail = (statusCode, error) => ({ statusCode, body: { error } });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Date properties come back as "YYYY-MM-DD", so plain string comparison works.
const rentalStatus = (start, end, today) => {
  if (start && start > today) return "Upcoming";
  if (end && end < today) return "Ended";
  return "Active";
};

const daysBetween = (start, end) =>
  start && end ? Math.max(Math.round((Date.parse(end) - Date.parse(start)) / 86400000), 0) : null;

exports.main = async () => {
  const hubspot = axios.create({
    baseURL: "https://api.hubapi.com",
    timeout: 8000,
    headers: {
      Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const objectsPath = (type) => `/crm/objects/${HS_API_VERSION}/${type}`;

  const batchRead = async (type, ids, properties) => {
    const results = [];
    for (const ids100 of chunk(ids, 100)) {
      const res = await hubspot.post(`${objectsPath(type)}/batch/read`, {
        inputs: ids100.map((id) => ({ id: String(id) })),
        properties,
      });
      results.push(...res.data.results);
    }
    return results;
  };

  const listAgreements = async () => {
    const all = [];
    let after;
    do {
      const res = await hubspot.get(objectsPath(OBJECTS.agreements), {
        params: { limit: 100, properties: AGREEMENT_PROPERTIES.join(","), after },
      });
      all.push(...res.data.results);
      after = res.data.paging?.next?.after;
    } while (after);
    return all;
  };

  // First linked record of toType for each agreement.
  const firstLinked = async (ids, toType) => {
    const byAgreement = new Map();
    for (const ids100 of chunk(ids, 100)) {
      const res = await hubspot.post(`/crm/associations/${HS_API_VERSION}/${OBJECTS.agreements}/${toType}/batch/read`, {
        inputs: ids100.map((id) => ({ id: String(id) })),
      });
      for (const r of res.data.results) {
        if (r.to[0]) byAgreement.set(String(r.from.id), String(r.to[0].toObjectId));
      }
    }
    return byAgreement;
  };

  try {
    const raw = await listAgreements();
    const ids = raw.map((a) => a.id);
    const [contactByAgreement, vehicleByAgreement] = ids.length
      ? await Promise.all([firstLinked(ids, OBJECTS.contacts), firstLinked(ids, OBJECTS.vehicles)])
      : [new Map(), new Map()];

    const contactIds = [...new Set(contactByAgreement.values())];
    const vehicleIds = [...new Set(vehicleByAgreement.values())];
    const [contacts, vehicles] = await Promise.all([
      contactIds.length ? batchRead(OBJECTS.contacts, contactIds, ["firstname", "lastname", "email"]) : [],
      vehicleIds.length ? batchRead(OBJECTS.vehicles, vehicleIds, ["year", "make", "model"]) : [],
    ]);
    const contactById = new Map(contacts.map((c) => [String(c.id), c.properties]));
    const vehicleById = new Map(vehicles.map((v) => [String(v.id), v.properties]));

    const today = new Date().toISOString().slice(0, 10);
    const agreements = raw
      .map((a) => {
        const p = a.properties;
        // Trim in case a date comes back as a full timestamp.
        const startDate = p.start_date ? p.start_date.slice(0, 10) : null;
        const endDate = p.end_date ? p.end_date.slice(0, 10) : null;
        const contactId = contactByAgreement.get(String(a.id));
        const contact = contactId ? contactById.get(contactId) : null;
        const vehicle = vehicleById.get(vehicleByAgreement.get(String(a.id)));
        const days = p.total_days != null ? Number(p.total_days) : daysBetween(startDate, endDate);
        const dailyPrice = p.cost_per_day != null ? Number(p.cost_per_day) : null;
        return {
          id: a.id,
          name: p.name || "--",
          contactId: contactId ?? null,
          contactName: contact ? `${contact.firstname ?? ""} ${contact.lastname ?? ""}`.trim() || contact.email || "--" : "--",
          vehicleName: vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "--",
          startDate,
          endDate,
          days,
          dailyPrice,
          total: dailyPrice != null && days != null ? dailyPrice * days : null,
          insurance: p.insurance === "true",
          status: rentalStatus(startDate, endDate, today),
        };
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || String(a.startDate).localeCompare(String(b.startDate)));

    const count = (status) => agreements.filter((a) => a.status === status).length;
    return {
      statusCode: 200,
      body: {
        agreements,
        summary: { active: count("Active"), upcoming: count("Upcoming"), ended: count("Ended") },
      },
    };
  } catch (err) {
    const status = err.response?.status;
    console.error("rentalAgreements failed:", status, err.config?.url, err.response?.data?.message ?? err.message);
    if (err.code === "ECONNABORTED") return fail(504, "A lookup timed out. Try again.");
    if (status === 403) return fail(403, "Missing scope. Check requiredScopes in app-hsmeta.json, then hs project upload.");
    if (status === 404) return fail(404, "A rental object wasn't found. Check the custom object names in rentalAgreements.js.");
    return fail(502, "Couldn't load rental agreements right now.");
  }
};
