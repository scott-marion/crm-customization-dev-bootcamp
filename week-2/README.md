# Week 2: Understand the Problem, Then Build the Card

AI can write UI extension code faster than you can type it. What it can't do is decide what the card should do. This week is about that part: figuring out who the card is for, what they're deciding, and what they need to see, then proving the design with a mockup before writing any real functionality.

**The point:** if you ask AI for a whole card in one prompt, you get a card that looks done and solves the wrong problem. Design it first, then build it in slices.

## What's in this folder

| Path | What it is |
| --- | --- |
| [`problem-brief.md`](problem-brief.md) | Template for the problem brief, plus a filled example for the rental rep |
| [`build-plan.md`](build-plan.md) | Checklist that turns an approved mockup into a build plan (this becomes your Week 3 prompt) |
| [`prompts.md`](prompts.md) | The Claude Code prompts for each stage, ready to copy |
| [`mocked-card/`](mocked-card/VehicleRecommendation) | Started as a static card with hardcoded data and no functions: what a good mockup looks like. In this fork it's now partly real (see the end of step 4), and the project also has Fleet availability and Rental agreements app pages (Week 4). |
| [`one-shot/`](one-shot/) | A card Claude Code built from one prompt with no design work. Compare it with the mockup. |
| [`../.claude/skills/hubspot-card-design`](../.claude/skills/hubspot-card-design/SKILL.md) | Claude Code skill with HubSpot's card design rules and the `hs-uix` components. Use it whenever you mock or build a card. |

## The process

```
1. Set up        AI scaffolds the project. You check the 3 things it gets wrong.
2. Understand    Interview the user. Fill in the problem brief.
3. Watch         Watch the user do the task today, without the card.
4. Mock          Static card, fake data, HubSpot UI components only. Put it in front of the user. Iterate.
5. Plan          Turn the approved mockup into a build checklist.
6. First slice   Replace one mocked value with real data. Leave the rest mocked.
```

### 1. Set up (let AI do it)

Use the setup prompt in [`prompts.md`](prompts.md#1-setup) with Claude Code and the HubSpot Developer MCP. You don't need to type the commands, but check these three things every time:

- **Platform version.** `hsproject.json` should say `"platformVersion": "2026.09"`.
- **Account.** Run `hs account info`. It should be a **developer test account**, not your production account. Uploading serverless functions to a non-Enterprise standard account fails.
- **Install.** After `hs project upload`, the app has to be **installed** (project page → Distribution tab → Install now / Add test installs). Otherwise the card won't show up in the card library.

<details>
<summary>Doing it by hand instead</summary>

```bash
npm install -g @hubspot/cli@latest   # 8.16.0 or newer, needs Node 20+
hs account auth
hs project create --project-base app --features card --auth static --distribution private
cd <your-project>
hs project upload
hs project open   # then Distribution tab → install
hs project dev
```

Add functions later with `hs project add`.
</details>

### 2. Understand the problem

Before you open an editor, interview the person who will use the card. Fill in [`problem-brief.md`](problem-brief.md):

- **User:** who opens this record, and what's their role?
- **Where:** which record or surface are they on?
- **Decision:** what are they trying to decide or get done?
- **Data:** what do they look at today, and which of it do they trust?
- **Success:** how would they know the card worked?

If you can't fill a row, you aren't ready to design yet.

### 3. Watch the user work

Have the user do the task today, without a card, while you watch. Write down every time they:

- switch tabs or open another record,
- copy and paste a value,
- hesitate or ask someone,
- do math in their head or in a spreadsheet.

Those are the card's real requirements. They often aren't what the user said in the interview.

### 4. Mock it

Build a **static** card: hardcoded data, HubSpot UI components and [`hs-uix`](https://github.com/05bmckay/hs-uix) only, no serverless functions, no API calls. If you're using Claude Code in this repo, the `hubspot-card-design` skill loads on its own and keeps the mockup looking like HubSpot. Ask it to "review this card against the hubspot-card-design rules" when you're done. See [`mocked-card/`](mocked-card/VehicleRecommendation) for an example. As a mockup it had a Recommend / Booked / Loading / Error / Empty toggle at the bottom so the user could react to every state, not just the happy path. In this fork the toggle is gone (Week 4): the real loading, error and empty states come from the data, and Booked appears after Create rental. The card is also split into reusable pieces (Week 4): `VehicleRecommendation.jsx` keeps the state and data calls, the parts it renders live in `cards/components/` (customer summary, zip search, recommendation, booking panel, booked view, a shared price summary, and the loading / error / empty states), and the price math is in `cards/lib/pricing.js`. Its data lives in [`mockData.js`](mocked-card/VehicleRecommendation/src/app/cards/mockData.js), except what has been sliced in so far:

- The customer's name comes from the contact record (the first slice in step 6).
- The Week 3 slice: the `recommendVehicles` function ([`src/app/functions/`](mocked-card/VehicleRecommendation/src/app/functions)) supplies the rental history ("Usually rents"), the nearest location to a pickup zip (prefilled from the contact's zip), the top pick and the alternatives. Top picks are priced at or above the location's median. With history, they lean to the class and price of the customer's priciest past rental. The app now needs `crm.objects.custom.read`.
- The write-back: **Create rental** calls the `createRental` function, which creates a real Rental Agreement (name like `RA-Johnson-2026-11-02`, dates, days, cost per day, insurance) and links it to the contact and the vehicle. It charges the vehicle's current price from HubSpot, refuses a vehicle that's no longer available, and shows any error inline in the booking panel. The rep can offer the recommended vehicle or select one of the alternatives first. The app now also needs `crm.objects.custom.write`.

The Trip line in the header, the insurance rate, the location notes (there's no property for them) and the confirmation email are still mocked. Booking doesn't mark the vehicle unavailable yet.

The same project has Week 4 app pages ([`src/app/pages/`](mocked-card/VehicleRecommendation/src/app/pages)). Business-wide questions don't fit on a contact card, so they get full pages, with a header to move between them:

- `/` (**Fleet availability**) lists every location with its available and total vehicles and a status (Available, Low at 2 or fewer, Sold out), with search and state/status filters.
- `/locations/:locationId` shows one location's vehicles (class, VIN, odometer, daily price, available or rented) and its median available price.
- `/rentals` (**Rental agreements**) lists agreements with a link to each contact's record, plus vehicle, dates, daily price, total and status (Active, Upcoming, Ended). It shows Current (active or upcoming) by default; the Show filter switches to Ended or All.

The `fleetAvailability` and `rentalAgreements` functions do the counting, status and sorting, so the pages only render. They need no new scopes. Open the page from the Marketplace menu (recently visited apps) or at `https://app.hubspot.com/app/{hubId}/{appId}`.

Run `hs project dev`, open a contact record, and put the card in front of the user. Card edits hot-reload, so you can change the design while they watch. Do at least two rounds of changes based on what they say.

A mockup is cheap to throw away. A wired-up card isn't, so get the design right while it's still fake.

### 5. Plan the build

Once the user approves the mockup, fill in [`build-plan.md`](build-plan.md): every value on the card, where its real data comes from, which functions and scopes you need, and what the loading, empty and error states look like. The plan becomes your prompt for Week 3.

### 6. First slice

Replace **one** mocked value with real data. The easiest first slice is the contact's name, using `useCrmProperties`:

```jsx
import { useCrmProperties } from "@hubspot/ui-extensions/crm";

const { properties, isLoading } = useCrmProperties(["firstname", "lastname"]);
const customerName = isLoading
  ? "…"
  : `${properties.firstname ?? ""} ${properties.lastname ?? ""}`.trim();
```

Delete that value from `mockData.js`. Everything else stays mocked until next week.

## Compare: mockup vs. one-shot

[`one-shot/`](one-shot/) holds the card Claude Code produced from the one-shot prompt in [`prompts.md`](prompts.md#one-shot-for-comparison), with no brief, no user and no mockup. Open both and ask:

- Who did the one-shot card assume the user was? Was it right?
- What decision does each card help with?
- Which data did the one-shot card fetch that the rep never looks at? What did it leave out that the rep needs?
- How much code would you have to throw away to turn the one-shot card into the approved design?

## Breakout

Each room picks its own card idea, writes a problem brief, and gets a **mocked** card rendering in a developer test account. No functionality yet.

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Serverless install or upload error | Uploading to a non-Enterprise standard account | Use a developer test account; check `hs account info` |
| Card missing from the card library | App uploaded but not installed | Distribution tab → install, then Customize |
| Card still missing after install | Record view was customized before | Add the card to the view manually; new cards don't appear on their own |
| Scope error on upload | `objectTypes` added without a matching scope in `app-hsmeta.json` | Add the scope (e.g. `crm.objects.companies.read`) and upload again |
| Function returns 403 / "Missing scope" right after you added a scope and uploaded | The installed app still has the old scopes; upload doesn't ask you to approve new ones | Reinstall the app (Distribution tab). In our test the reinstall didn't list the new scope either; it just reported success |
| Function change not showing in `hs project dev` | Functions don't hot-reload | Run `hs project upload` |
| `hs project watch` warning | Deprecated in CLI v8 | Use `hs project dev` |
| `hs upload` / `hs fetch` not found | CMS commands moved under `hs cms` in v8 | Use `hs cms upload`, etc. |
| CLI install fails | Node below 20, or global npm installed with sudo | Upgrade Node; reinstall Node/npm under your user account |
| Chrome asks about the local network | Chrome 142+ asks once for app.hubspot.com | Allow it, or local dev can't connect |
| Wrong portal got the deploy | Directory-linked or default account mismatch | `hs account info`, `hs account use`, or `--account` |
| `Build cannot be deployed from version '2025.1' to version '2026.09'` | The account already has last year's project with the same name | Rename the project in `hsproject.json` (e.g. `RentalCars-2026-09`), or migrate the old one with `hs project migrate` |
| `hs project validate` passes but upload fails | Validate doesn't check every value (e.g. an invented card `location`) | Read the build error; the upload is the real check |

## Quiz

1. Which CLI argument shows all options for a command?
2. You didn't add a feature when you created the project. What command adds it later?
3. Which platform version are we building on, and what did it bring back?
4. Your project uploaded but the card isn't in the card library. What step did you skip?
5. During `hs project dev`, you edit a serverless function. How do you get the change live?

<details>
<summary>Answers</summary>

1. `--help` (alias `-h`)
2. `hs project add`
3. 2026.09. Serverless functions came back in 2026.03.
4. Installing the app from the Distribution tab.
5. `hs project upload`
</details>
