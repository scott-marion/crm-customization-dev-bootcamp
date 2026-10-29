// Creates a Rental Agreement for the contact the card is open on, and links it
// to the contact and the vehicle.
//
//   1. Check the inputs, and read the vehicle's current price and availability
//      (the card's copy could be stale, so the price is never taken from it)
//   2. Create the agreement: name, dates, days, cost per day, insurance
//   3. Link it to the contact and the vehicle (default, unlabeled associations)
//
// The vehicle stays marked available; booking doesn't take it out of the pool yet.
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

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fail = (statusCode, error) => ({ statusCode, body: { error } });

const daysBetween = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000);

exports.main = async (context) => {
  const p = context.parameters ?? {};
  const contactId = String(p.contactId ?? "").trim();
  const vehicleId = String(p.vehicleId ?? "").trim();
  const startDate = String(p.startDate ?? "").trim();
  const endDate = String(p.endDate ?? "").trim();
  const insurance = p.insurance === true || p.insurance === "true";

  if (!/^\d+$/.test(contactId)) return fail(400, "contactId is required");
  if (!/^\d+$/.test(vehicleId)) return fail(400, "vehicleId is required");
  if (!DAY_PATTERN.test(startDate) || !DAY_PATTERN.test(endDate)) return fail(400, "Pickup and return dates are required");
  const totalDays = daysBetween(startDate, endDate);
  if (!(totalDays > 0)) return fail(400, "Return date must be after the pickup date");

  const hubspot = axios.create({
    baseURL: "https://api.hubapi.com",
    timeout: 8000,
    headers: {
      Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const objectsPath = (type) => `/crm/objects/${HS_API_VERSION}/${type}`;
  const linkDefault = (fromType, fromId, toType, toId) =>
    hubspot.put(`${objectsPath(fromType)}/${fromId}/associations/default/${toType}/${toId}`);

  let agreementId = null;
  try {
    const [vehicleRes, contactRes] = await Promise.all([
      hubspot.get(`${objectsPath(OBJECTS.vehicles)}/${vehicleId}`, { params: { properties: "daily_price,available" } }),
      hubspot.get(`${objectsPath(OBJECTS.contacts)}/${contactId}`, { params: { properties: "lastname" } }),
    ]);
    const vehicle = vehicleRes.data.properties;
    if (vehicle.available !== "true") return fail(409, "That vehicle is no longer available. Search again.");
    const costPerDay = Number(vehicle.daily_price);
    if (!(costPerDay > 0)) return fail(409, "That vehicle has no daily price set.");

    // e.g. "RA-Johnson-2026-10-20"
    const name = `RA-${(contactRes.data.properties.lastname || contactId).replace(/\s+/g, "")}-${startDate}`;

    const created = await hubspot.post(objectsPath(OBJECTS.agreements), {
      properties: {
        name,
        start_date: startDate,
        end_date: endDate,
        total_days: String(totalDays),
        cost_per_day: String(costPerDay),
        insurance: String(insurance),
      },
    });
    agreementId = created.data.id;

    await Promise.all([
      linkDefault(OBJECTS.agreements, agreementId, OBJECTS.contacts, contactId),
      linkDefault(OBJECTS.agreements, agreementId, OBJECTS.vehicles, vehicleId),
    ]);

    return {
      statusCode: 200,
      body: { id: agreementId, name, startDate, endDate, totalDays, costPerDay, insurance },
    };
  } catch (err) {
    const status = err.response?.status;
    console.error("createRental failed:", status, err.config?.url, err.response?.data?.message ?? err.message);
    // Created but not linked: say so, so the rep doesn't book twice.
    if (agreementId) {
      return fail(502, `Agreement ${agreementId} was created but couldn't be linked to the contact or vehicle. Link it by hand.`);
    }
    if (err.code === "ECONNABORTED") return fail(504, "Creating the rental timed out. Check the contact's rentals before trying again.");
    if (status === 403) return fail(403, "Missing scope. Check requiredScopes in app-hsmeta.json, then hs project upload.");
    if (status === 404) return fail(404, "The contact or vehicle wasn't found.");
    if (status === 400) return fail(400, err.response?.data?.message ?? "HubSpot rejected the rental.");
    return fail(502, "Couldn't create the rental right now.");
  }
};
