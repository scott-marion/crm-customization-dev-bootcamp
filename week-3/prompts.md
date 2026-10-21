# Week 3 Prompts

Copy these into Claude Code with the HubSpot Developer MCP connected. Run them from inside your project folder. One stage per prompt.

## 1. Scaffold

```
Using the HubSpot CLI and Developer MCP: scaffold a private, static-auth app on platform 2026.09 named rental_functions with one app card on contacts and one app function. Install axios in src/app/functions and hs-uix in src/app/cards. Upload it, install it into my developer test account, and tell me the account ID you deployed to.
```

Then check: `platformVersion` is `2026.09`, `hs account info` shows a developer test account, the app is installed (Distribution tab).

## 2. Handshake

```
Rename the scaffolded function to `echo`: uid "echo" in its hsmeta, entrypoint /app/functions/echo.js. It should return { statusCode: 200, body: { portalId, user, parameters, propertiesToSend } } from context. Add a "Call echo" button to the card that calls hubspot.serverless("echo", { parameters: { greeting: "hi" }, propertiesToSend: ["firstname"] }) and renders body in a DescriptionList, with loading and error states. Use the hubspot-card-design skill. Then hs project upload and tell me what to click.
```

## 3. External API

```
Add a function `getPickupWeather` that takes { zip } in parameters, validates it is 5 digits, calls https://api.zippopotam.us/us/{zip} with axios (timeout 5000) to get lat/lng, then https://api.open-meteo.com/v1/forecast with axios params for a 3-day daily forecast in Fahrenheit, and returns { statusCode, body: { city, state, days: [{ date, conditions, high, low, rainChance }] } }. Map any axios error to a 4xx/5xx with a short body.error string. Test it locally with node -e before uploading. Then add a zip Input and a "Get pickup weather" button to the card and render the days in a DataTable from hs-uix/datatable.
```

## 4. HubSpot API

```
Add a function `getRentalHistory` that takes { contactId }, creates an axios client for https://api.hubapi.com with Bearer process.env.PRIVATE_APP_ACCESS_TOKEN and a 10s timeout, calls GET /crm/v4/objects/contacts/{contactId}/associations/p_rental_agreements, then POST /crm/v3/objects/p_rental_agreements/batch/read for name, start_date, end_date, cost_per_day, total_days, insurance. Return { statusCode: 200, body: { agreements } } sorted by start_date desc, with a 403 mapped to "Missing scope" and 404 to "object type not found". Add crm.objects.custom.read to requiredScopes in app-hsmeta.json. Upload, then add a "Load rental history" button and DataTable to the card with an EmptyState when there are no agreements.
```

## 5. Wire one slice

Paste the row from your build plan.

```
From week-2/build-plan.md, do only this slice:

<row from section 1, plus the matching function row from section 2>

Write the function in src/app/functions with its hsmeta, validate parameters, use axios with a timeout, return { statusCode, body }, and map errors to short messages. Add any scope it needs to app-hsmeta.json. Wire it into the card with the useFunction hook, replace that one mocked value, delete the value from mockData.js, and leave everything else mocked. Don't touch any other section of the card. Upload and tell me what to click to verify it.
```

## 6. Debug a function

Paste the terminal output from `hs project dev` or the card's error.

```
This function is failing. Here is the function code, its hsmeta, the relevant part of the card, and the error:

<code and error>

Tell me which of these it is before changing anything: uid mismatch, missing scope, missing package in src/app/functions/package.json, missing secret in secretKeys, timeout, or a bug in the code. Then fix only that.
```

## 7. Hook or function?

```
For each value in week-2/build-plan.md section 1, say whether it should come from useCrmProperties, useAssociations, useCrmSearch, or a serverless function, and why in one sentence each. Don't write code.
```
