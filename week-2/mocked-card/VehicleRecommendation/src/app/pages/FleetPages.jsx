import React, { useEffect } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Flex,
  LoadingSpinner,
  Statistics,
  StatisticsItem,
  StatusTag,
  Text,
  hubspot,
} from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageLink, PageRoutes, PageTitle, createPageRouter, usePageRoute } from "@hubspot/ui-extensions/pages";
import { DataTable } from "hs-uix/datatable";
import { formatCurrency } from "hs-uix/utils";
import { useFunction } from "./useFunction";

// Fleet availability: the view across every location, which doesn't fit on a
// contact card. The card answers "what do I offer this customer?"; these pages
// answer "where are the cars?".
//
//   /                          every location, its available and total vehicles
//   /locations/:locationId     one location's vehicles
//
// All counting and sorting happens in the fleetAvailability function.

const STATUS_VARIANT = { Available: "success", Low: "warning", "Sold out": "danger" };

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

const PageRouter = createPageRouter(
  <PageRoutes>
    <PageRoutes.IndexRoute id="fleet" component={FleetOverviewPage} />
    <PageRoutes.Route id="location" path="/locations/:locationId" component={LocationPage} />
    <PageRoutes.AnyRoute id="not-found" component={NotFoundPage} />
  </PageRoutes>
);

hubspot.extend(() => <PageRouter />);
