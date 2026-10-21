# Functions

Three serverless functions, one per lesson:

| File | uid (what the card calls) | Lesson |
| --- | --- | --- |
| `echo.js` | `echo` | The handshake: what goes in (`parameters`, `propertiesToSend`, `context`) and what comes out (`{ statusCode, body }`). No dependencies. |
| `getPickupWeather.js` | `getPickupWeather` | An external API with Axios. Two keyless APIs chained, with timeouts and error mapping. |
| `getRentalHistory.js` | `getRentalHistory` | The HubSpot API with Axios, using the built-in `PRIVATE_APP_ACCESS_TOKEN`. Uses `dayjs` to show any npm package works. |

All functions share this one `package.json`. Add packages from this folder:

```bash
cd src/app/functions
npm install <package>
```

Function changes don't hot-reload. After editing anything in here, run `hs project upload`.
