import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Flex,
  Link,
  LoadingSpinner,
  Statistics,
  StatisticsItem,
  StatusTag,
  Text,
  hubspot,
} from "@hubspot/ui-extensions";
import {
  PageBreadcrumbs,
  PageHeader,
  PageLink,
  PageRoutes,
  PageTitle,
  createPageRouter,
  usePageRoute,
} from "@hubspot/ui-extensions/pages";
import { DataTable } from "hs-uix/datatable";
import { formatCurrency, formatDate } from "hs-uix/utils";
import { useFunction } from "./useFunction";

// App pages for views across the whole business, which don't fit on a
// contact card. The card answers "what do I offer this customer?"; these pages
// answer "where are the cars?" and "who has one right now?".
//
//   /                          every location, its available and total vehicles
//   /locations/:locationId     one location's vehicles
//   /rentals                   rental agreements, current ones first, linked to their contact
//
// Counting, status and sorting happen in the fleetAvailability and
// rentalAgreements functions.

const STATUS_VARIANT = { Available: "success", Low: "warning", "Sold out": "danger" };
const RENTAL_VARIANT = { Active: "success", Upcoming: "info", Ended: "default" };

// The account ID, for links to CRM records. Set from the extension context below.
const PortalId = createContext(null);

const contactUrl = (portalId, contactId) => `https://app.hubspot.com/contacts/${portalId}/record/0-1/${contactId}`;

// "2026-08-01" -> a local date, so it doesn't shift a day in US time zones.
const parseDay = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toOptions = (values) => [...new Set(values)].sort().map((value) => ({ label: value, value }));

const Loading = ({ label }) => (
  <Flex direction="row" justify="center">
    <LoadingSpinner label={label} layout="centered" showLabel={true} />
  </Flex>
);

const LoadError = ({ message, onRetry }) => (
  <ErrorState title="Trouble loading the fleet.">
    <Text>{message}</Text>
    <Button variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  </ErrorState>
);

const FleetOverviewPage = () => {
  const fleet = useFunction("fleetAvailability");

  useEffect(() => {
    fleet.call();
  }, []);

  const renderBody = () => {
    if (fleet.status === "error") return <LoadError message={fleet.error} onRetry={() => fleet.call()} />;
    if (!fleet.data) return <Loading label="Loading locations..." />;

    const { locations, summary } = fleet.data;
    const columns = [
      {
        field: "name",
        label: "Location",
        sortable: true,
        renderCell: (value, row) => (
          <PageLink to="/locations/:locationId" params={{ locationId: row.id }}>
            {value}
          </PageLink>
        ),
      },
      { field: "postalCode", label: "Zip", width: "min", cellWidth: "min" },
      { field: "available", label: "Available", sortable: true, align: "right", width: "min", cellWidth: "min" },
      { field: "fleetSize", label: "Fleet", sortable: true, align: "right", width: "min", cellWidth: "min" },
      {
        field: "status",
        label: "Status",
        sortable: true,
        width: "min",
        cellWidth: "min",
        renderCell: (value) => <StatusTag variant={STATUS_VARIANT[value] ?? "default"}>{value}</StatusTag>,
      },
    ];

    return (
      <Flex direction="column" gap="md">
        <Statistics>
          <StatisticsItem label="Locations" number={String(summary.locations)} />
          <StatisticsItem label="Vehicles" number={String(summary.vehicles)} />
          <StatisticsItem label="Available now" number={String(summary.available)} />
          <StatisticsItem label="Sold-out locations" number={String(summary.soldOut)} />
        </Statistics>
        <DataTable
          data={locations}
          columns={columns}
          rowIdField="id"
          searchFields={["name", "postalCode", "address"]}
          searchPlaceholder="Search city, state or zip"
          filters={[
            { name: "state", label: "State", options: toOptions(locations.map((l) => l.state)) },
            { name: "status", label: "Status", options: toOptions(locations.map((l) => l.status)) },
          ]}
          pageSize={25}
          emptyTitle="No matching locations"
          emptyMessage="Try a different search or filter."
          bordered={true}
        />
      </Flex>
    );
  };

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Fleet availability</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Fleet availability</PageTitle>
      {renderBody()}
    </>
  );
};

const LocationPage = () => {
  const { params } = usePageRoute();
  const locationId = params.locationId;
  const detail = useFunction("fleetAvailability");

  useEffect(() => {
    detail.call({ parameters: { locationId } });
  }, [locationId]);

  const location = detail.data?.location;

  const renderBody = () => {
    if (detail.status === "error") {
      return <LoadError message={detail.error} onRetry={() => detail.call({ parameters: { locationId } })} />;
    }
    if (!detail.data) return <Loading label="Loading vehicles..." />;

    const { vehicles, summary } = detail.data;
    const rows = vehicles.map((v) => ({
      ...v,
      priceLabel: v.dailyPrice != null ? `${formatCurrency(v.dailyPrice)}/day` : "--",
      odometerLabel: v.odometer != null ? `${v.odometer.toLocaleString("en-US")} mi` : "--",
      availability: v.available ? "Available" : "Rented",
    }));
    const columns = [
      { field: "vehicleName", label: "Vehicle", sortable: true },
      { field: "vehicleClass", label: "Class", sortable: true, width: "min", cellWidth: "min" },
      { field: "vin", label: "VIN", width: "min", cellWidth: "min" },
      {
        field: "odometerLabel",
        label: "Odometer",
        align: "right",
        width: "min",
        cellWidth: "min",
        sortable: true,
        sortComparator: (a, b, rowA, rowB) => (rowA.odometer ?? 0) - (rowB.odometer ?? 0),
      },
      {
        field: "priceLabel",
        label: "Daily price",
        align: "right",
        width: "min",
        cellWidth: "min",
        sortable: true,
        sortComparator: (a, b, rowA, rowB) => (rowA.dailyPrice ?? 0) - (rowB.dailyPrice ?? 0),
      },
      {
        field: "availability",
        label: "Status",
        sortable: true,
        width: "min",
        cellWidth: "min",
        renderCell: (value) => <StatusTag variant={value === "Available" ? "success" : "default"}>{value}</StatusTag>,
      },
    ];

    return (
      <Flex direction="column" gap="md">
        <Text>{location.address}</Text>
        <Statistics>
          <StatisticsItem label="Available now" number={String(summary.available)} />
          <StatisticsItem label="Fleet" number={String(summary.vehicles)} />
          <StatisticsItem
            label="Median available price"
            number={summary.medianDailyPrice != null ? formatCurrency(summary.medianDailyPrice) : "--"}
          />
        </Statistics>
        {rows.length === 0 ? (
          <EmptyState title="No vehicles at this location" layout="vertical">
            <Text>No vehicles are linked to this location yet.</Text>
          </EmptyState>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            rowIdField="id"
            searchFields={["vehicleName", "vin"]}
            searchPlaceholder="Search make, model or VIN"
            filters={[
              { name: "vehicleClass", label: "Class", options: toOptions(rows.map((r) => r.vehicleClass)) },
              { name: "availability", label: "Status", options: toOptions(rows.map((r) => r.availability)) },
            ]}
            emptyTitle="No matching vehicles"
            emptyMessage="Try a different search or filter."
            bordered={true}
          />
        )}
      </Flex>
    );
  };

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.PageLink to="/">Fleet availability</PageBreadcrumbs.PageLink>
        <PageBreadcrumbs.Current>{location?.name ?? "Location"}</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>{location?.name ?? "Location"}</PageTitle>
      {renderBody()}
    </>
  );
};

// "Current" = active now or starting later; Ended and All are one click away.
const SHOW_OPTIONS = [
  { label: "Current", value: "current" },
  { label: "Active now", value: "Active" },
  { label: "Upcoming", value: "Upcoming" },
  { label: "Ended", value: "Ended" },
];

const RentalAgreementsPage = () => {
  const portalId = useContext(PortalId);
  const rentals = useFunction("rentalAgreements");
  const [filterValues, setFilterValues] = useState({ show: "current" });

  useEffect(() => {
    rentals.call();
  }, []);

  const renderBody = () => {
    if (rentals.status === "error") return <LoadError message={rentals.error} onRetry={() => rentals.call()} />;
    if (!rentals.data) return <Loading label="Loading rental agreements..." />;

    const { agreements, summary } = rentals.data;
    const rows = agreements.map((a) => ({
      ...a,
      datesLabel:
        a.startDate || a.endDate
          ? `${a.startDate ? formatDate(parseDay(a.startDate)) : "--"} – ${a.endDate ? formatDate(parseDay(a.endDate)) : "--"}`
          : "--",
      daysLabel: a.days != null ? String(a.days) : "--",
      priceLabel: a.dailyPrice != null ? `${formatCurrency(a.dailyPrice)}/day` : "--",
      totalLabel: a.total != null ? formatCurrency(a.total) : "--",
    }));
    const columns = [
      { field: "name", label: "Agreement", sortable: true, width: "min", cellWidth: "min" },
      {
        field: "contactName",
        label: "Contact",
        sortable: true,
        renderCell: (value, row) =>
          row.contactId && portalId ? <Link href={contactUrl(portalId, row.contactId)}>{value}</Link> : <Text>{value}</Text>,
      },
      { field: "vehicleName", label: "Vehicle", sortable: true },
      {
        field: "datesLabel",
        label: "Dates",
        sortable: true,
        sortComparator: (a, b, rowA, rowB) => String(rowA.startDate).localeCompare(String(rowB.startDate)),
      },
      { field: "daysLabel", label: "Days", align: "right", width: "min", cellWidth: "min" },
      { field: "priceLabel", label: "Daily", align: "right", width: "min", cellWidth: "min" },
      {
        field: "totalLabel",
        label: "Total",
        align: "right",
        width: "min",
        cellWidth: "min",
        sortable: true,
        sortComparator: (a, b, rowA, rowB) => (rowA.total ?? 0) - (rowB.total ?? 0),
      },
      {
        field: "status",
        label: "Status",
        sortable: true,
        width: "min",
        cellWidth: "min",
        renderCell: (value) => <StatusTag variant={RENTAL_VARIANT[value] ?? "default"}>{value}</StatusTag>,
      },
    ];

    return (
      <Flex direction="column" gap="md">
        <Statistics>
          <StatisticsItem label="Active now" number={String(summary.active)} />
          <StatisticsItem label="Upcoming" number={String(summary.upcoming)} />
          <StatisticsItem label="Ended" number={String(summary.ended)} />
        </Statistics>
        <DataTable
          data={rows}
          columns={columns}
          rowIdField="id"
          searchFields={["name", "contactName", "vehicleName"]}
          searchPlaceholder="Search agreement, contact or vehicle"
          filters={[
            {
              name: "show",
              label: "Show",
              options: SHOW_OPTIONS,
              includeAll: true,
              allLabel: "All",
              filterFn: (row, value) => (value === "current" ? row.status !== "Ended" : row.status === value),
            },
          ]}
          filterValues={filterValues}
          onFilterChange={setFilterValues}
          pageSize={25}
          emptyTitle="No matching rental agreements"
          emptyMessage="Nothing matches this filter. Set Show to All to see past rentals."
          bordered={true}
        />
      </Flex>
    );
  };

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.PageLink to="/">Fleet availability</PageBreadcrumbs.PageLink>
        <PageBreadcrumbs.Current>Rental agreements</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Rental agreements</PageTitle>
      {renderBody()}
    </>
  );
};

const NotFoundPage = () => (
  <>
    <PageBreadcrumbs>
      <PageBreadcrumbs.PageLink to="/">Fleet availability</PageBreadcrumbs.PageLink>
      <PageBreadcrumbs.Current>Not found</PageBreadcrumbs.Current>
    </PageBreadcrumbs>
    <PageTitle>Page not found</PageTitle>
    <EmptyState title="There's nothing here" layout="vertical">
      <PageLink to="/">Back to fleet availability</PageLink>
    </EmptyState>
  </>
);

// One PageHeader for the whole app (the docs advise against adding or removing it per page).
const AppLayout = ({ children }) => (
  <>
    <PageHeader>
      <PageHeader.PrimaryAction>
        <PageHeader.PageLink to="/rentals">Rental agreements</PageHeader.PageLink>
      </PageHeader.PrimaryAction>
      <PageHeader.SecondaryActions>
        <PageHeader.PageLink to="/">Fleet availability</PageHeader.PageLink>
      </PageHeader.SecondaryActions>
    </PageHeader>
    {children}
  </>
);

const PageRouter = createPageRouter(
  <PageRoutes layoutComponent={AppLayout}>
    <PageRoutes.IndexRoute id="fleet" component={FleetOverviewPage} />
    <PageRoutes.Route id="location" path="/locations/:locationId" component={LocationPage} />
    <PageRoutes.Route id="rentals" path="/rentals" component={RentalAgreementsPage} />
    <PageRoutes.AnyRoute id="not-found" component={NotFoundPage} />
  </PageRoutes>
);

hubspot.extend(({ context }) => (
  <PortalId.Provider value={context.portal.id}>
    <PageRouter />
  </PortalId.Provider>
));
