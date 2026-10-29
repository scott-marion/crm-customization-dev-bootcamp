// Fleet availability for the app page.
//
//   No locationId -> every location with its available and total vehicle counts
//   locationId    -> that location and every vehicle linked to it
//
// The counts and summaries are worked out here, so the page only renders.
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
};

const LOCATION_PROPERTIES = ["city", "state", "postal_code", "full_address", "number_of_available_vehicles"];
const VEHICLE_PROPERTIES = ["vin", "make", "model", "year", "daily_price", "available", "odometer_reading"];
const LOW_STOCK = 2; // this many available or fewer counts as "Low"

const fail = (statusCode, error) => ({ statusCode, body: { error } });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const median = (sorted) => (sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null);

const stockStatus = (available) => (available === 0 ? "Sold out" : available <= LOW_STOCK ? "Low" : "Available");

const toLocation = (l) => ({
  id: l.id,
  name: `${l.properties.city ?? "--"}, ${l.properties.state ?? "--"}`,
  city: l.properties.city ?? "--",
  state: l.properties.state ?? "--",
  postalCode: l.properties.postal_code ?? "--",
  address: l.properties.full_address ?? "--",
  available: Number(l.properties.number_of_available_vehicles ?? 0),
});

exports.main = async (context) => {
  const locationId = String(context.parameters?.locationId ?? "").trim();
  if (locationId && !/^\d+$/.test(locationId)) return fail(400, "locationId must be a record ID");

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

  // Vehicle IDs per location, in batches of 100 locations.
  const vehicleIdsByLocation = async (ids) => {
    const byLocation = new Map();
    for (const ids100 of chunk(ids, 100)) {
      const res = await hubspot.post(`/crm/associations/${HS_API_VERSION}/${OBJECTS.locations}/${OBJECTS.vehicles}/batch/read`, {
        inputs: ids100.map((id) => ({ id: String(id) })),
      });
      for (const r of res.data.results) {
        byLocation.set(String(r.from.id), r.to.map((t) => t.toObjectId));
      }
    }
    return byLocation;
  };

  const overview = async () => {
    const raw = await listLocations();
    const vehicleIds = await vehicleIdsByLocation(raw.map((l) => l.id));

    const locations = raw
      .map((l) => {
        const location = toLocation(l);
        const fleetSize = vehicleIds.get(String(l.id))?.length ?? 0;
        return { ...location, fleetSize, status: stockStatus(location.available) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      locations,
      summary: {
        locations: locations.length,
        vehicles: locations.reduce((sum, l) => sum + l.fleetSize, 0),
        available: locations.reduce((sum, l) => sum + l.available, 0),
        soldOut: locations.filter((l) => l.status === "Sold out").length,
      },
    };
  };

  const locationDetail = async () => {
    const [locationRes, vehicleIds] = await Promise.all([
      hubspot.get(`${objectsPath(OBJECTS.locations)}/${locationId}`, {
        params: { properties: LOCATION_PROPERTIES.join(",") },
      }),
      vehicleIdsByLocation([locationId]),
    ]);
    const ids = vehicleIds.get(locationId) ?? [];
    const raw = ids.length ? await batchRead(OBJECTS.vehicles, ids, VEHICLE_PROPERTIES) : [];

    const vehicles = raw
      .map((v) => ({
        id: v.id,
        vehicleName: [v.properties.year, v.properties.make, v.properties.model].filter(Boolean).join(" ") || "--",
        vehicleClass: v.properties.model ?? "--",
        vin: v.properties.vin ?? "--",
        odometer: v.properties.odometer_reading != null ? Number(v.properties.odometer_reading) : null,
        dailyPrice: v.properties.daily_price != null ? Number(v.properties.daily_price) : null,
        available: v.properties.available === "true",
      }))
      .sort((a, b) => Number(b.available) - Number(a.available) || (a.dailyPrice ?? 0) - (b.dailyPrice ?? 0));

    const availablePrices = vehicles
      .filter((v) => v.available && v.dailyPrice > 0)
      .map((v) => v.dailyPrice)
      .sort((a, b) => a - b);

    return {
      location: toLocation(locationRes.data),
      vehicles,
      summary: {
        vehicles: vehicles.length,
        available: vehicles.filter((v) => v.available).length,
        medianDailyPrice: median(availablePrices),
      },
    };
  };

  try {
    return { statusCode: 200, body: locationId ? await locationDetail() : await overview() };
  } catch (err) {
    const status = err.response?.status;
    console.error("fleetAvailability failed:", status, err.config?.url, err.response?.data?.message ?? err.message);
    if (err.code === "ECONNABORTED") return fail(504, "A lookup timed out. Try again.");
    if (status === 403) return fail(403, "Missing scope. Check requiredScopes in app-hsmeta.json, then hs project upload.");
    if (status === 404) {
      return fail(404, locationId ? "That location wasn't found." : "A rental object wasn't found. Check the custom object names in fleetAvailability.js.");
    }
    return fail(502, "Couldn't load the fleet right now.");
  }
};
