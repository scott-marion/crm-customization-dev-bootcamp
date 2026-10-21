// Function 2: an external API with Axios.
//
// Two keyless public APIs, chained:
//   1. zippopotam.us   zip -> city, state, lat, lng
//   2. open-meteo.com  lat, lng -> 3-day forecast
//
// Why this matters for the rental card: the rep is on the phone deciding
// which car to offer. "It's raining at pickup all weekend" is a reason to
// steer away from the convertible. Neither API needs a key, so everyone in
// the bootcamp can run this. For a keyed API, see "Secrets" in the README.

const axios = require("axios");

// WMO weather codes -> short labels. Open-Meteo returns the code, not text.
const WEATHER_LABELS = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Showers",
  81: "Showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

const fail = (statusCode, error) => ({ statusCode, body: { error } });

exports.main = async (context) => {
  const zip = String(context.parameters?.zip ?? "").trim();

  // Validate before you spend a network call.
  if (!/^\d{5}$/.test(zip)) {
    return fail(400, "zip must be a 5-digit US zip code");
  }

  try {
    // Always set a timeout. Functions are killed at 15 seconds, and a hung
    // upstream API should fail fast with a message, not time out silently.
    const geo = await axios.get(`https://api.zippopotam.us/us/${zip}`, { timeout: 5000 });
    const place = geo.data.places?.[0];
    if (!place) {
      return fail(404, `No location found for zip ${zip}`);
    }

    const lat = Number(place.latitude);
    const lng = Number(place.longitude);

    // Axios builds the query string from `params`, so you don't hand-encode it.
    const forecast = await axios.get("https://api.open-meteo.com/v1/forecast", {
      timeout: 5000,
      params: {
        latitude: lat,
        longitude: lng,
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        temperature_unit: "fahrenheit",
        forecast_days: 3,
        timezone: "auto",
      },
    });

    const daily = forecast.data.daily;
    const days = daily.time.map((date, i) => ({
      date,
      conditions: WEATHER_LABELS[daily.weather_code[i]] ?? `Code ${daily.weather_code[i]}`,
      high: Math.round(daily.temperature_2m_max[i]),
      low: Math.round(daily.temperature_2m_min[i]),
      rainChance: daily.precipitation_probability_max[i],
    }));

    return {
      statusCode: 200,
      body: {
        zip,
        city: place["place name"],
        state: place["state abbreviation"],
        lat,
        lng,
        days,
      },
    };
  } catch (err) {
    // Axios puts the upstream HTTP response on err.response. Log the whole
    // thing for yourself, but send the card a short message it can show.
    console.error("getPickupWeather failed:", err.response?.status, err.message);
    if (err.response?.status === 404) {
      return fail(404, `No location found for zip ${zip}`);
    }
    if (err.code === "ECONNABORTED") {
      return fail(504, "Weather service timed out. Try again.");
    }
    return fail(502, "Weather service is unavailable right now.");
  }
};
