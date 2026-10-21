# Week 3: Serverless Functions

Last week the card was fake on purpose. Every value came from `mockData.js`, and that's what let you iterate with the rep until the design was right. This week the fake values start becoming real, and the thing that makes them real is a **serverless function**: a small piece of Node.js that HubSpot runs for you, that your card calls by name.

**The point:** a function is where your card does anything it can't do in the browser. Call an outside API. Use a secret. Talk to the HubSpot API with your app's token. Use any npm package. Shape the data so the card only has to render it.

## What's in this folder

| Path | What it is |
| --- | --- |
| [`functions-kit/`](functions-kit/RentalFunctions) | A runnable project: one card, three functions. Upload it, install it, click the three buttons, read the code in order. |
| [`function-recipes.md`](function-recipes.md) | Copy-paste patterns: the function skeleton, external API with Axios, HubSpot API with Axios, associations, search, GraphQL, secrets, error handling. |
| [`prompts.md`](prompts.md) | The Claude Code prompts for each step, ready to copy. |
| [`../week-2/build-plan.md`](../week-2/build-plan.md) | Your plan from last week. Section 2 lists the functions you need. That's your to-do list for the breakout. |

## How a card talks to a function

```
src/app/cards/MyCard.jsx                       src/app/functions/getRentalHistory.js
┌──────────────────────────────────┐           ┌────────────────────────────────────┐
│ hubspot.serverless(              │  ──────▶  │ exports.main = async (context) => {│
│   "getRentalHistory",            │           │   context.parameters.contactId     │
│   { parameters: { contactId },   │           │   context.propertiesToSend         │
│     propertiesToSend: ["zip"] }  │           │   context.portalId, context.user   │
│ )                                │  ◀──────  │   return { statusCode, body }      │
└──────────────────────────────────┘           └────────────────────────────────────┘
                                                  getRentalHistory-hsmeta.json
                                                  { "uid": "getRentalHistory",
                                                    "type": "app-function",
                                                    "config": { "entrypoint": "/app/functions/getRentalHistory.js" } }
```

Three things to get right, and they're the only three:

1. **The uid is the name.** The string you pass to `hubspot.serverless()` is the `uid` in the function's `*-hsmeta.json`. Not the file name, not the export name. `Function "x" not found` means these don't match.
2. **`parameters` go in, `body` comes out.** Send what the function needs in `parameters`. Return `{ statusCode, body }`. Put a short, human-readable `error` string in `body` when `statusCode` is 400 or above. The card in `functions-kit/` has a 20-line `useFunction` hook that turns that shape into loading / loaded / error state.
3. **`context` is trustworthy; `parameters` are not.** HubSpot sets `portalId` and `user` on the server from the signed-in user. A card can't spoof them. Anything in `parameters` came from the browser, so validate it before you spend a network call.

Functions have a **15 second** timeout and may cold-start. Set a timeout on every outbound request, keep functions small, and don't do work at module level.

## Hook or function?

Not everything needs a function. The UI extensions SDK ships hooks that read CRM data straight from the card, with no code on the server. Reach for them first.

| You need to... | Use | Why |
| --- | --- | --- |
| Show properties of the record the card is on | `useCrmProperties` | One line, no function, no scopes beyond the object's read scope. This was your Week 2 first slice. |
| List records associated with this one, with a few properties | `useAssociations` | Pagination and formatting built in. |
| Search any object type with filters or free text | `useCrmSearch` | Same filter syntax as the CRM search API. Pair with `useDebounce` for type-ahead. |
| Call an API outside HubSpot | **function** | The browser can't hold your API key. The function can. |
| Use a secret of any kind | **function** | Secrets are only injected into functions. |
| Write to the CRM (create a deal, update a property) | **function** | Hooks are read-only. |
| Combine several HubSpot calls into one result | **function** | One round trip from the card, and the shaping happens on the server. |
| Run a GraphQL or HubSQL query | **function** | See below. |
| Use an npm package the card can't bundle | **function** | Functions bundle anything public on npm. |

Rule of thumb: if the hook can do it, use the hook. The moment you need a key, a write, or more than one call to answer the question, write a function.

`hubspot.fetch()` is a third option: the card calls *your own* backend directly. It needs `permittedUrls` in `app-hsmeta.json` and a server you run. Use it when you already have that server. Otherwise a function is less to operate.

## Three ways to read HubSpot data from a function

A function gets a built-in secret, `PRIVATE_APP_ACCESS_TOKEN`, whose permissions are the `requiredScopes` in `app-hsmeta.json`. Use it with any HubSpot API.

1. **REST with Axios.** What `getRentalHistory.js` does: associations v4, then a batch read. Every CRM endpoint works this way. Best when you know exactly which records you want.
2. **GraphQL.** One `POST` to `/collector/graphql` can walk contact → rental agreements → vehicle in a single query and return only the fields you ask for. Needs `collector.graphql_schema.read` and `collector.graphql_query.execute` scopes plus the read scope for each object in the query. Build the query in HubSpot's GraphiQL tool first. Recipe in [`function-recipes.md`](function-recipes.md#graphql).
3. **HubSQL.** SQL with HubSpot extensions, the same engine behind the Agent CLI's `hubspot query` command and the remote MCP server's `query_crm_data` tool. Filtering, aggregation and sorting in one statement. It's the newest of the three. Check the developer docs for the current endpoint and scopes before you depend on it from a function, and expect a HubSQL hook in React cards before long. When that lands, most "aggregate this for the card" functions become one hook call.

## Any npm package

Functions bundle whatever is in `src/app/functions/package.json`. All functions in a project share that one file.

```bash
cd src/app/functions
npm install axios dayjs
hs project upload
```

`getRentalHistory.js` uses `dayjs` to fill in `total_days` when the agreement doesn't have it. It could have used plain `Date`. It uses `dayjs` to make the point: if it's public on npm, it works.

Why Axios instead of `fetch`? Node 20 has `fetch` built in, and it's fine. Axios gives you `params` (no hand-built query strings), `timeout`, `axios.create()` for a preconfigured client, and `err.response` with the upstream status and body already parsed. For code that talks to two or three APIs, that's less to get wrong.

## Secrets

The two keyless APIs in `getPickupWeather.js` were chosen so nobody has to sign up for anything. Real APIs need keys. Never put one in code or `parameters`.

```bash
hs secret add WEATHER_API_KEY        # prompts for the value
```

```json
{ "uid": "getPickupWeather", "type": "app-function",
  "config": { "entrypoint": "/app/functions/getPickupWeather.js", "secretKeys": ["WEATHER_API_KEY"] } }
```

```js
const key = process.env.WEATHER_API_KEY;
```

Then `hs project upload`. The secret only exists in functions that list it in `secretKeys`.

## The process

```
1. Scaffold    Project with a card and an app-function. Check the same 3 things as Week 2.
2. Handshake   Make the card call a function that echoes its input. Get the uid right.
3. External    Call an outside API with Axios. Add a timeout. Map errors to messages.
4. HubSpot     Call the HubSpot API with PRIVATE_APP_ACCESS_TOKEN. Add the scope. Upload.
5. Slice       Open build-plan.md. Replace one mocked value with a real function. Repeat.
```

### 1. Scaffold

Use the setup prompt in [`prompts.md`](prompts.md#1-scaffold), or do it by hand:

```bash
hs project create --project-base app --features card app-function --auth static --distribution private
cd <your-project>/src/app/functions && npm install axios && cd ../cards && npm install hs-uix && cd ../../..
hs project upload
hs project open        # Distribution tab → install
hs project dev
```

Or skip straight to the finished version: `cd functions-kit/RentalFunctions`, then the same `upload`, `open`, `dev`. Add the **Serverless Playground** card to a contact record tab (on a dev view, not the team's default view).

### 2. Handshake

Click **Call echo**. The DescriptionList shows what the function received: your account ID, the parameters, the properties, and the Node version it ran on. "Called by" is empty during `hs project dev` and filled in after upload. Now change the uid in `echo-hsmeta.json`, upload, and click again. That error is the one you'll see most often this week.

### 3. External API

Enter a zip and click **Get pickup weather**. Read `getPickupWeather.js` top to bottom: validate input, call with a timeout, chain a second call, shape the result, map every failure to a short message. Try zip `00000` to see a 404 become a readable error in the card.

### 4. HubSpot API

Click **Load rental history**. If this contact has Rental Agreement records associated, you get a table. If not, an empty state. Read `getRentalHistory.js`: an `axios.create()` client with the token, associations v4, batch read, shaping and sorting on the server. Now remove `crm.objects.custom.read` from `app-hsmeta.json`, upload, click again. That 403 is the second error you'll see most often.

### 5. Slice the real card

Open your [`build-plan.md`](../week-2/build-plan.md) from Week 2. Section 2 lists the functions. Build the first one, wire it into the mocked card from last week, delete that value from `mockData.js`. The card stays mocked everywhere else. Use the slice prompt in [`prompts.md`](prompts.md#5-wire-one-slice).

## Debugging

- `console.log` in a function prints to the terminal running `hs project dev`.
- Function changes do **not** hot-reload. Edit, `hs project upload`, click again. Card changes do hot-reload.
- Test a function from the command line before you upload it. Fake the context:
  ```bash
  cd src/app/functions
  node -e "require('./getPickupWeather').main({ parameters: { zip: '37203' } }).then(r => console.log(JSON.stringify(r, null, 2)))"
  ```
  This works for anything that doesn't need `PRIVATE_APP_ACCESS_TOKEN`. For HubSpot calls, export a private app token as that variable locally, or test after upload.
- `hs project validate` catches schema mistakes in `*-hsmeta.json`. It doesn't run your code.

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Function "getX" not found` | uid in `*-hsmeta.json` doesn't match the string in `hubspot.serverless()` | Make them identical, `hs project upload` |
| 403 from the HubSpot API inside a function | Missing scope in `requiredScopes` | Add it to `app-hsmeta.json`, upload, reinstall if prompted |
| 404 for `p_rental_agreements` | Custom objects not imported into this account | Follow [`data/README.md`](../data/README.md) |
| `Function execution timed out` | More than 15 seconds, usually a hung upstream call | Set `timeout` on every Axios call, split the function |
| `Cannot find module 'axios'` | Package not in `src/app/functions/package.json` | `npm install` from that folder, upload |
| Secret is `undefined` | Not in `secretKeys`, or added after the last upload | Add to `secretKeys`, `hs project upload` |
| Function edit does nothing | Functions don't hot-reload | `hs project upload` |
| `context.user` is undefined | Running under `hs project dev` | Expected. Present after upload. Don't rely on `user.email`; use `user.userId`. |
| Card shows `[object Object]` | Rendered `result` instead of `result.body` | Return `{ statusCode, body }` and read `body` |
| Build fails: OAuth app | Serverless functions need static auth and private distribution | `"auth": { "type": "static" }`, `"distribution": "private"` |

## Breakout

Take your Week 2 mockup. Build the first function from your build plan, wire one value, delete it from `mockData.js`. Demo the card with one real value and the rest still mocked. If the real value is a hook (`useCrmProperties`, `useAssociations`), you already did it last week. Pick one that needs a function.

## Quiz

1. What links the string in `hubspot.serverless("getVehicles", …)` to the function's code?
2. The rep needs the contact's zip on the card. Hook or function?
3. The rep needs the weather at the pickup location. Hook or function? Why?
4. Your function returns 403 from `api.hubapi.com`. What do you change, and where?
5. You added `lodash` to a function and uploaded. The card still errors. Which folder did you `npm install` in?
6. Name the secret every private function gets without you adding it.

<details>
<summary>Answers</summary>

1. The `uid` in the function's `*-hsmeta.json`.
2. Hook. `useCrmProperties(["zip"])`.
3. Function. It's an external API, and in real life it needs a key the browser can't hold.
4. Add the missing scope to `requiredScopes` in `src/app/app-hsmeta.json`, then `hs project upload`.
5. `src/app/functions/`. All functions share that one `package.json`.
6. `PRIVATE_APP_ACCESS_TOKEN`.
</details>
