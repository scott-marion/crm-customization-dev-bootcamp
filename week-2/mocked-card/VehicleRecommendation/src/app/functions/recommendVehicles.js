// Recommends vehicles for the contact the card is open on.
//
//   1. The contact's rental history: classes rented and the most they've paid per day
//   2. Pickup zip -> lat/lng (zippopotam.us, keyless)
//   3. Nearest location that has available vehicles
//   4. Top pick + up to 3 alternatives from that location
//
// Without a zip it returns only the history, so the card can show it on load.
//
// Pricing rule (the business wants mid-range or better, not the cheapest car):
//   - Only vehicles priced at or above the location's median are top-pick candidates.
//   - With history: the class of their priciest past rental, price closest to the
//     most they've paid per day. Customers who rented several classes get steered
//     to the higher-priced one.
//   - Without history: the cheapest candidate, i.e. the median-priced car.
//   - Ties go to the higher price.
//
// Auth is the built-in PRIVATE_APP_ACCESS_TOKEN; its scopes are requiredScopes in app-hsmeta.json.

const axios = require("axios");

// Date-based API version for every HubSpot call in this function.
const HS_API_VERSION = "2026-09";

// Custom objects by their short name. If the API answers 404 for these,
// switch to the fully qualified names (p<portalId>_vehicles, ...).
const OBJECTS = {
  locations: "p_locations",
  vehicles: "p_vehicles",
  agreements: "p_rental_agreements",
};

const VEHICLE_PROPERTIES = ["make", "model", "year", "daily_price", "available"];
const LOCATION_PROPERTIES = ["city", "state", "lat", "lng", "number_of_available_vehicles"];
const MAX_LOCATIONS_TO_TRY = 3;
const MAX_ALTERNATIVES = 3;
const NEAR_PRICE = 15; // $/day within the usual price counts as "near"

const fail = (statusCode, error) => ({ statusCode, body: { error } });

const milesBetween = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Closest to target price; ties go to the higher price.
const closestTo = (vehicles, target) =>
  [...vehicles].sort((a, b) => Math.abs(a.dailyPrice - target) - Math.abs(b.dailyPrice - target) || b.dailyPrice - a.dailyPrice)[0];

exports.main = async (context) => {
  const contactId = String(context.parameters?.contactId ?? "").trim();
  const zip = String(context.parameters?.zip ?? "").trim();

  if (!/^\d+$/.test(contactId)) return fail(400, "contactId is required");
  if (zip && !/^\d{5}$/.test(zip)) return fail(400, "Enter a 5-digit US zip code");

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

  const associatedIds = async (fromType, fromId, toType) => {
    const res = await hubspot.get(`${objectsPath(fromType)}/${fromId}/associations/${toType}`, { params: { limit: 500 } });
    return res.data.results.map((r) => r.toObjectId);
  };

  const listLocations = async () => {
    const all = [];
    let after;
    do {
      const res = await hubspot.get(objectsPath(OBJECTS.locations), {
        params: { limit: 100, properties: LOCATION_PROPERTIES.join(","), after },
      });
      all.push(...res.data.results);
      after = res.data.paging?.next?.after;
    } while (after);
    return all;
  };

  // Classes rented and the priciest rental, from the contact's past agreements.
  const readHistory = async () => {
    const agreementIds = await associatedIds("contacts", contactId, OBJECTS.agreements);
    if (agreementIds.length === 0) {
      return { rentals: 0, rentedClasses: [], preferredClass: null, targetDailyPrice: null };
    }

    const [agreements, links] = await Promise.all([
      batchRead(OBJECTS.agreements, agreementIds, ["cost_per_day"]),
      hubspot.post(`/crm/associations/${HS_API_VERSION}/${OBJECTS.agreements}/${OBJECTS.vehicles}/batch/read`, {
        inputs: agreementIds.map((id) => ({ id: String(id) })),
      }),
    ]);
    const vehicleByAgreement = new Map(links.data.results.map((r) => [String(r.from.id), r.to[0]?.toObjectId]));
    const rentedIds = [...new Set([...vehicleByAgreement.values()].filter(Boolean))];
    const rented = rentedIds.length ? await batchRead(OBJECTS.vehicles, rentedIds, ["model", "daily_price"]) : [];
    const vehicleById = new Map(rented.map((v) => [String(v.id), v.properties]));

    // One row per rental: what they paid per day (agreement, else the car's list price) and the class.
    const rentals = agreements
      .map((a) => {
        const vehicle = vehicleById.get(String(vehicleByAgreement.get(String(a.id))));
        const paid = Number(a.properties.cost_per_day) || Number(vehicle?.daily_price) || null;
        return { vehicleClass: vehicle?.model ?? null, dailyPrice: paid };
      })
      .sort((a, b) => (b.dailyPrice ?? 0) - (a.dailyPrice ?? 0));

    // Classes ordered by the most paid for each, so the priciest comes first.
    const rentedClasses = [...new Set(rentals.map((r) => r.vehicleClass).filter(Boolean))];
    const priciest = rentals.find((r) => r.dailyPrice != null);

    return {
      rentals: agreementIds.length,
      rentedClasses,
      preferredClass: rentedClasses[0] ?? null,
      targetDailyPrice: priciest?.dailyPrice ?? null,
    };
  };

  try {
    if (!zip) {
      return { statusCode: 200, body: { customer: await readHistory() } };
    }

    const geo = await axios.get(`https://api.zippopotam.us/us/${zip}`, { timeout: 5000 }).catch((err) => {
      if (err.response?.status === 404) return null;
      throw err;
    });
    const place = geo?.data?.places?.[0];
    if (!place) return fail(404, `No location found for zip ${zip}`);
    const origin = { lat: Number(place.latitude), lng: Number(place.longitude) };

    const [locations, history] = await Promise.all([listLocations(), readHistory()]);
    console.log("recommendVehicles history:", JSON.stringify(history));

    const nearest = locations
      .map((l) => ({
        id: l.id,
        name: `${l.properties.city}, ${l.properties.state}`,
        available: Number(l.properties.number_of_available_vehicles ?? 0),
        distanceMiles: milesBetween(origin, { lat: Number(l.properties.lat), lng: Number(l.properties.lng) }),
      }))
      .filter((l) => l.available > 0 && Number.isFinite(l.distanceMiles))
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, MAX_LOCATIONS_TO_TRY);

    let location = null;
    let fleet = [];
    for (const candidate of nearest) {
      const ids = await associatedIds(OBJECTS.locations, candidate.id, OBJECTS.vehicles);
      const vehicles = ids.length ? await batchRead(OBJECTS.vehicles, ids, VEHICLE_PROPERTIES) : [];
      fleet = vehicles
        .filter((v) => v.properties.available === "true")
        .map((v) => ({
          id: v.id,
          vehicleName: [v.properties.year, v.properties.make, v.properties.model].filter(Boolean).join(" "),
          vehicleClass: v.properties.model ?? null,
          dailyPrice: Number(v.properties.daily_price),
        }))
        .filter((v) => v.dailyPrice > 0)
        .sort((a, b) => a.dailyPrice - b.dailyPrice);
      if (fleet.length) {
        location = candidate;
        break;
      }
    }

    if (!location) {
      return { statusCode: 200, body: { location: null, customer: history, topPick: null, alternatives: [] } };
    }

    const medianDailyPrice = fleet[Math.floor((fleet.length - 1) / 2)].dailyPrice;
    const candidates = fleet.filter((v) => v.dailyPrice >= medianDailyPrice);
    const hasHistory = history.targetDailyPrice != null || history.preferredClass != null;

    let top;
    const reasons = [];
    if (hasHistory) {
      // Their priciest class first; if none is here, any class they've rented; else any candidate.
      const preferred = candidates.filter((v) => v.vehicleClass === history.preferredClass);
      const rentedBefore = candidates.filter((v) => history.rentedClasses.includes(v.vehicleClass));
      const pool = preferred.length ? preferred : rentedBefore.length ? rentedBefore : candidates;
      top = history.targetDailyPrice != null ? closestTo(pool, history.targetDailyPrice) : pool[pool.length - 1];
      if (history.rentedClasses.includes(top.vehicleClass)) reasons.push("Class they've rented");
      if (history.targetDailyPrice != null && Math.abs(top.dailyPrice - history.targetDailyPrice) <= NEAR_PRICE) {
        reasons.push("Near what they've paid");
      }
    } else {
      top = candidates[0];
      reasons.push("Mid-range price");
    }
    reasons.push("Available now");

    const others = fleet.filter((v) => v.id !== top.id);
    const alternatives = [];
    const add = (vehicle, note) => {
      if (vehicle && alternatives.length < MAX_ALTERNATIVES && !alternatives.some((a) => a.id === vehicle.id)) {
        alternatives.push({ ...vehicle, note });
      }
    };
    add(others.find((v) => v.dailyPrice > top.dailyPrice), "Upgrade");
    add(others.find((v) => v.vehicleClass === top.vehicleClass), "Same class");
    add(others[0], "Budget");
    for (const v of [...others].sort((a, b) => Math.abs(a.dailyPrice - top.dailyPrice) - Math.abs(b.dailyPrice - top.dailyPrice))) {
      add(v, "Similar price");
    }

    return {
      statusCode: 200,
      body: {
        location: { ...location, distanceMiles: Math.round(location.distanceMiles * 10) / 10 },
        customer: history,
        medianDailyPrice,
        availableCount: fleet.length,
        topPick: { ...top, reasons },
        alternatives,
      },
    };
  } catch (err) {
    const status = err.response?.status;
    console.error("recommendVehicles failed:", status, err.config?.url, err.response?.data?.message ?? err.message);
    if (err.code === "ECONNABORTED") return fail(504, "A lookup timed out. Try again.");
    if (status === 403) return fail(403, "Missing scope. Check requiredScopes in app-hsmeta.json, then hs project upload.");
    if (status === 404) return fail(404, "A rental object wasn't found. Check the custom object names in recommendVehicles.js.");
    return fail(502, "Couldn't load vehicles right now.");
  }
};
