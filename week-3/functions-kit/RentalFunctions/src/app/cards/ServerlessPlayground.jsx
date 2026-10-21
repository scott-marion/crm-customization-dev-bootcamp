import { useState } from "react";
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListItem,
  Divider,
  EmptyState,
  Flex,
  Heading,
  Input,
  LoadingSpinner,
  StatusTag,
  Text,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import { useCrmProperties } from "@hubspot/ui-extensions/crm";
import { DataTable } from "hs-uix/datatable";
import { formatCurrency, formatDate } from "hs-uix/utils";
import { useFunction } from "./useFunction";

// Week 3: one card, three serverless functions.
//
// Each section calls one function and shows what came back. Read them in order:
//   1. echo              the handshake (what goes in, what comes out)
//   2. getPickupWeather  an external API with Axios
//   3. getRentalHistory  the HubSpot API with Axios
//
// The contact's own properties come from useCrmProperties, not a function.
// The README explains when to use a hook and when to use a function.

const CONTACT_PROPERTIES = ["firstname", "lastname", "email", "zip"];
// HubSpot date properties are date-only strings; format them in UTC so the day doesn't shift.
const DATE_UTC = { timeZone: "UTC" };

hubspot.extend(() => <ServerlessPlayground />);

const ServerlessPlayground = () => {
  const { crm } = useExtensionContext();
  const { properties, isLoading } = useCrmProperties(CONTACT_PROPERTIES);

  if (isLoading) {
    return (
      <Flex align="center" justify="center">
        <LoadingSpinner label="Loading contact..." layout="centered" showLabel={true} />
      </Flex>
    );
  }

  const contactName = `${properties.firstname ?? ""} ${properties.lastname ?? ""}`.trim() || "--";

  return (
    <Flex direction="column" gap="sm">
      <Heading>Serverless Playground</Heading>

      <DescriptionList direction="row">
        <DescriptionListItem label="Contact">{contactName}</DescriptionListItem>
        <DescriptionListItem label="Email">{properties.email || "--"}</DescriptionListItem>
        <DescriptionListItem label="Zip">{properties.zip || "--"}</DescriptionListItem>
        <DescriptionListItem label="Record ID">{String(crm.objectId)}</DescriptionListItem>
      </DescriptionList>

      <Divider />
      <HandshakeSection contactName={contactName} />

      <Divider />
      <WeatherSection defaultZip={properties.zip ?? ""} />

      <Divider />
      <RentalHistorySection contactId={crm.objectId} />
    </Flex>
  );
};

// 1. The handshake ---------------------------------------------------------

const HandshakeSection = ({ contactName }) => {
  const echo = useFunction("echo");

  const handleCall = () =>
    echo.call({
      parameters: { greeting: `Hello from ${contactName}`, sentAt: new Date().toISOString() },
      propertiesToSend: ["firstname", "lastname"],
    });

  return (
    <Flex direction="column" gap="xs">
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "demibold" }}>1. The handshake</Text>
        <Button variant="secondary" onClick={handleCall} disabled={echo.isLoading}>
          Call echo
        </Button>
      </Flex>
      <Text variant="microcopy">
        Sends parameters and propertiesToSend to the function and shows what the function saw.
      </Text>

      <SectionState state={echo} loadingLabel="Calling echo...">
        {echo.data && (
          <DescriptionList direction="row">
            <DescriptionListItem label="Account">{String(echo.data.portalId ?? "--")}</DescriptionListItem>
            <DescriptionListItem label="Called by">{echo.data.user?.email ?? "-- (not set in hs project dev)"}</DescriptionListItem>
            <DescriptionListItem label="Parameters received">{JSON.stringify(echo.data.parameters)}</DescriptionListItem>
            <DescriptionListItem label="Properties received">{JSON.stringify(echo.data.propertiesToSend ?? "--")}</DescriptionListItem>
            <DescriptionListItem label="Node">{echo.data.nodeVersion ?? "--"}</DescriptionListItem>
          </DescriptionList>
        )}
      </SectionState>
    </Flex>
  );
};

// 2. External API with Axios ------------------------------------------------

const WEATHER_COLUMNS = [
  { field: "dateLabel", label: "Day", width: "min", cellWidth: "min" },
  { field: "conditions", label: "Conditions", width: "auto" },
  { field: "rangeLabel", label: "High / low", width: "min", cellWidth: "min" },
  { field: "rainLabel", label: "Rain", width: "min", cellWidth: "min" },
];

const WeatherSection = ({ defaultZip }) => {
  const [zip, setZip] = useState(defaultZip);
  const weather = useFunction("getPickupWeather");

  const handleCall = () => weather.call({ parameters: { zip } });

  // Precompute display strings before the JSX (DSM-05, PLT-04).
  // Date-only strings ("2026-10-21") parse as UTC midnight, so format them in
  // UTC or the day shifts for anyone west of Greenwich.
  const days = (weather.data?.days ?? []).map((d) => ({
    id: d.date,
    dateLabel: formatDate(d.date, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }),
    conditions: d.conditions ?? "--",
    rangeLabel: `${d.high}° / ${d.low}°`,
    rainLabel: d.rainChance != null ? `${d.rainChance}%` : "--",
  }));

  return (
    <Flex direction="column" gap="xs">
      <Text format={{ fontWeight: "demibold" }}>2. External API with Axios</Text>
      <Text variant="microcopy">
        Zip to coordinates (zippopotam.us), coordinates to a 3-day forecast (open-meteo.com). No API key needed.
      </Text>

      <Flex direction="row" gap="sm" align="end">
        <Input label="Pickup zip" name="zip" value={zip} onChange={setZip} placeholder="37203" />
        <Button variant="primary" onClick={handleCall} disabled={weather.isLoading || zip.length !== 5}>
          Get pickup weather
        </Button>
      </Flex>

      <SectionState state={weather} loadingLabel="Asking two APIs...">
        {weather.data && (
          <Flex direction="column" gap="xs">
            <Text>
              Pickup in {weather.data.city}, {weather.data.state}
            </Text>
            <DataTable
              data={days}
              columns={WEATHER_COLUMNS}
              pageSize={3}
              showSearch={false}
              showRowCount={false}
              bordered={true}
              flush={true}
            />
          </Flex>
        )}
      </SectionState>
    </Flex>
  );
};

// 3. HubSpot API with Axios -------------------------------------------------

const HISTORY_COLUMNS = [
  { field: "name", label: "Agreement", width: "auto" },
  { field: "datesLabel", label: "Dates", width: "min", cellWidth: "min", sortable: true },
  { field: "daysLabel", label: "Days", width: "min", cellWidth: "min" },
  { field: "dailyLabel", label: "Daily", width: "min", cellWidth: "min" },
  { field: "totalLabel", label: "Total", width: "min", cellWidth: "min" },
  {
    field: "insuranceLabel",
    label: "Insurance",
    width: "min",
    cellWidth: "min",
    renderCell: (value, row) => <StatusTag variant={row.insuranceVariant}>{value}</StatusTag>,
  },
];

const RentalHistorySection = ({ contactId }) => {
  const history = useFunction("getRentalHistory");

  const handleCall = () => history.call({ parameters: { contactId } });

  const rows = (history.data?.agreements ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? "--",
    datesLabel:
      a.startDate && a.endDate ? `${formatDate(a.startDate, DATE_UTC)} – ${formatDate(a.endDate, DATE_UTC)}` : "--",
    daysLabel: a.totalDays != null ? String(a.totalDays) : "--",
    dailyLabel: a.costPerDay != null ? formatCurrency(a.costPerDay) : "--",
    totalLabel: a.total != null ? formatCurrency(a.total) : "--",
    insuranceLabel: a.insurance ? "Insured" : "None",
    insuranceVariant: a.insurance ? "success" : "default",
  }));

  return (
    <Flex direction="column" gap="xs">
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "demibold" }}>3. HubSpot API with Axios</Text>
        <Button variant="secondary" onClick={handleCall} disabled={history.isLoading}>
          Load rental history
        </Button>
      </Flex>
      <Text variant="microcopy">
        Associations v4, then a batch read, using the built-in PRIVATE_APP_ACCESS_TOKEN.
      </Text>

      <SectionState state={history} loadingLabel="Reading rental agreements...">
        {history.data &&
          (rows.length === 0 ? (
            <EmptyState title="No rental agreements" layout="vertical" reverseOrder={false}>
              <Text>This contact has no associated Rental Agreement records yet.</Text>
            </EmptyState>
          ) : (
            <DataTable
              data={rows}
              columns={HISTORY_COLUMNS}
              pageSize={5}
              showSearch={rows.length > 5}
              showRowCount={false}
              bordered={true}
              flush={true}
            />
          ))}
      </SectionState>
    </Flex>
  );
};

// Shared loading / error wrapper ---------------------------------------------

const SectionState = ({ state, loadingLabel, children }) => {
  if (state.status === "loading") {
    return (
      <Flex direction="row" align="center" gap="xs">
        <LoadingSpinner size="xs" layout="inline" />
        <Text format={{ italic: true }}>{loadingLabel}</Text>
      </Flex>
    );
  }
  if (state.status === "error") {
    return (
      <Alert title="Function failed" variant="error">
        {state.error}
      </Alert>
    );
  }
  return children ?? null;
};
