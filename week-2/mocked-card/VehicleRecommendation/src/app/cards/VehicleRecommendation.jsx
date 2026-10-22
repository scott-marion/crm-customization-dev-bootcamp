import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  DescriptionList,
  DescriptionListItem,
  Divider,
  EmptyState,
  ErrorState,
  Flex,
  Inline,
  Input,
  LoadingSpinner,
  Panel,
  PanelBody,
  PanelFooter,
  StatusTag,
  Text,
  Tile,
  hubspot,
} from "@hubspot/ui-extensions";
import { useCrmProperties } from "@hubspot/ui-extensions/crm";
import { DataTable } from "hs-uix/datatable";
import { FormBuilder } from "hs-uix/form";
import { formatCurrency, formatDate } from "hs-uix/utils";
import { MOCK_BOOKING, MOCK_CUSTOMER, MOCK_INSURANCE_PER_DAY, MOCK_TRIP } from "./mockData";
import { useFunction } from "./useFunction";

// Started as the Week 2 mockup. Real data replaces mockData.js one slice
// at a time; whatever is still in mockData.js is still fake.
//
// Flow: Recommend → Offer (booking panel) → Create rental → Booked.

// The customer's name, and the zip that prefills the pickup zip.
const CONTACT_PROPERTIES = ["firstname", "lastname", "zip"];
const ZIP_PATTERN = /^\d{5}$/;

const VIEW_MODES = [
  { value: "recommend", label: "Recommend" },
  { value: "booked", label: "Booked" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Error" },
  { value: "empty", label: "Empty" },
];

const toDate = (d) => (d ? new Date(d.year, d.month, d.date) : null);

const returnAfterPickup = (returnDate, { pickupDate }) => {
  const start = toDate(pickupDate);
  const end = toDate(returnDate);
  if (!start || !end) return true;
  return end > start ? true : "Return date must be after the pickup date";
};

const BOOKING_FIELDS = [
  { name: "pickupDate", type: "date", label: "Pickup date", required: true },
  {
    name: "returnDate",
    type: "date",
    label: "Return date",
    required: true,
    validators: [returnAfterPickup],
  },
  {
    name: "insurance",
    type: "toggle",
    label: "Add insurance",
    description: `${formatCurrency(MOCK_INSURANCE_PER_DAY)}/day`,
    colSpan: 2,
  },
  { name: "notes", type: "textarea", label: "Notes for the location", width: "full" },
];

const INITIAL_BOOKING_VALUES = {
  pickupDate: MOCK_TRIP.pickupDate,
  returnDate: MOCK_TRIP.returnDate,
  insurance: false,
  notes: "",
};

const countDays = (pickup, dropoff) => {
  const start = toDate(pickup);
  const end = toDate(dropoff);
  if (!start || !end) return 0;
  return Math.max(Math.round((end - start) / 86400000), 0);
};

const priceBooking = ({ vehicle, pickupDate, returnDate, insurance }) => {
  const days = countDays(pickupDate, returnDate);
  const rental = vehicle.dailyPrice * days;
  const insuranceTotal = insurance ? MOCK_INSURANCE_PER_DAY * days : 0;
  return {
    days,
    rentalLabel: formatCurrency(rental),
    insuranceLabel: insurance ? formatCurrency(insuranceTotal) : "--",
    totalLabel: formatCurrency(rental + insuranceTotal),
    datesLabel: `${formatDate(toDate(pickupDate))} – ${formatDate(toDate(returnDate))}`,
  };
};

// Trip dates are still mocked, so trip totals use the mocked trip length.
const TRIP_DAYS = countDays(MOCK_TRIP.pickupDate, MOCK_TRIP.returnDate);

const withPriceLabels = (vehicle) => {
  const daily = `${formatCurrency(vehicle.dailyPrice)}/day`;
  const total = formatCurrency(vehicle.dailyPrice * TRIP_DAYS);
  return { ...vehicle, priceLabel: daily, totalLabel: total, summaryLabel: `${daily} · ${total} total` };
};

// e.g. "SUV, Van · up to $150/day (2 rentals)". Priciest class first.
const usualRentalLabel = (customer) => {
  if (!customer) return "--";
  if (customer.rentals === 0) return "No rental history";
  const classes = customer.rentedClasses.join(", ");
  const price = customer.targetDailyPrice != null ? `up to ${formatCurrency(customer.targetDailyPrice)}/day` : "";
  const rentals = `${customer.rentals} rental${customer.rentals === 1 ? "" : "s"}`;
  return `${[classes, price].filter(Boolean).join(" · ") || "--"} (${rentals})`;
};

const locationLabel = (location) => (location ? `${location.name} (${location.distanceMiles} mi)` : "--");

hubspot.extend(({ context, actions }) => (
  <Extension
    contactId={context.crm.objectId}
    sendAlert={actions.addAlert}
    closeOverlay={actions.closeOverlay}
  />
));

const Extension = ({ contactId, sendAlert, closeOverlay }) => {
  const [viewMode, setViewMode] = useState("recommend");
  const [booking, setBooking] = useState(MOCK_BOOKING);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [zip, setZip] = useState("");
  const { properties, isLoading } = useCrmProperties(CONTACT_PROPERTIES);
  const recommendation = useFunction("recommendVehicles");
  // Same function without a zip: rental history only, loaded with the card.
  const history = useFunction("recommendVehicles");
  const customerName = isLoading
    ? "…"
    : `${properties.firstname ?? ""} ${properties.lastname ?? ""}`.trim() || "--";

  const findVehicles = (pickupZip) => {
    if (ZIP_PATTERN.test(pickupZip)) {
      recommendation.call({ parameters: { contactId, zip: pickupZip } });
    }
  };

  useEffect(() => {
    history.call({ parameters: { contactId } });
  }, [contactId]);

  // Prefill the pickup zip from the contact once, and search right away.
  useEffect(() => {
    if (isLoading) return;
    const contactZip = String(properties.zip ?? "").trim().slice(0, 5);
    if (ZIP_PATTERN.test(contactZip)) {
      setZip(contactZip);
      findVehicles(contactZip);
    }
  }, [isLoading]);

  const result = recommendation.data;
  const location = result?.location ?? null;
  const zipIsValid = ZIP_PATTERN.test(zip);
  // Flag only what can't become a zip (letters, too long); partial input is fine.
  const zipHasError = !/^\d{0,5}$/.test(zip);
  // Latest history wins: a search returns it too, in case it changed since load.
  const customer = result?.customer ?? history.data?.customer;
  const usualRentsLabel = history.isLoading && !customer ? "…" : history.error && !customer ? "--" : usualRentalLabel(customer);

  const createRental = (vehicle, values, panelId) => {
    setBooking({ ...MOCK_BOOKING, vehicle, locationName: location?.name ?? "--", ...values });
    setConfirmationSent(false);
    setViewMode("booked");
    closeOverlay(panelId);
    sendAlert({ type: "success", message: `Rental ${MOCK_BOOKING.agreementId} created for ${customerName}.` });
  };

  const sendConfirmation = () => {
    setConfirmationSent(true);
    sendAlert({ type: "info", message: `Mock only: would email the confirmation to ${MOCK_CUSTOMER.email}.` });
  };

  const bookingPanel = (vehicle) => (
    <BookingPanel
      vehicle={vehicle}
      customerName={customerName}
      locationName={location?.name ?? "--"}
      onCreate={createRental}
      closeOverlay={closeOverlay}
    />
  );

  const renderBody = () => {
    if (viewMode === "loading") {
      return (
        <Flex direction="row" justify="center">
          <LoadingSpinner label="Loading vehicles..." layout="centered" showLabel={true} />
        </Flex>
      );
    }

    if (viewMode === "error") {
      return (
        <ErrorState title="Trouble loading vehicles.">
          <Text>Please try again in a few moments.</Text>
        </ErrorState>
      );
    }

    if (viewMode === "empty") {
      return (
        <EmptyState title="No vehicles available" layout="vertical" reverseOrder={false}>
          <Text>No vehicles are available at this location for these dates.</Text>
        </EmptyState>
      );
    }

    if (viewMode === "booked") {
      return (
        <BookedView
          booking={booking}
          confirmationSent={confirmationSent}
          onSendConfirmation={sendConfirmation}
          onViewAgreement={() =>
            sendAlert({ type: "info", message: `Mock only: would open rental agreement ${booking.agreementId}.` })
          }
          onStartOver={() => setViewMode("recommend")}
        />
      );
    }

    // Recommend: real data from the recommendVehicles function.
    if (recommendation.status === "idle") {
      return (
        <EmptyState title="Enter a pickup zip" layout="vertical" reverseOrder={false}>
          <Text>Ask where the customer wants to pick up, then find vehicles at the nearest location.</Text>
        </EmptyState>
      );
    }

    // Spinner only on the first search; a re-search keeps the current results on screen.
    if (recommendation.isLoading && !result) {
      return (
        <Flex direction="row" justify="center">
          <LoadingSpinner label="Finding vehicles..." layout="centered" showLabel={true} />
        </Flex>
      );
    }

    if (recommendation.status === "error") {
      return (
        <ErrorState title="Trouble loading vehicles.">
          <Text>{recommendation.error}</Text>
          <Button variant="secondary" onClick={() => findVehicles(zip)}>
            Try again
          </Button>
        </ErrorState>
      );
    }

    if (!result?.topPick) {
      return (
        <EmptyState title="No vehicles available" layout="vertical" reverseOrder={false}>
          <Text>No vehicles are available at the locations nearest this zip.</Text>
        </EmptyState>
      );
    }

    return (
      <RecommendView
        bookingPanel={bookingPanel}
        alternatives={result.alternatives.map(withPriceLabels)}
        topPick={withPriceLabels(result.topPick)}
      />
    );
  };

  return (
    <Flex direction="column" gap="sm">
      <DescriptionList direction="row">
        <DescriptionListItem label="Customer">
          <Text>{customerName}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Usually rents">
          <Text>{usualRentsLabel}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Trip">
          <Text>{MOCK_TRIP.label}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Nearest location">
          <Text>{locationLabel(location)}</Text>
        </DescriptionListItem>
      </DescriptionList>

      <Flex direction="row" align="end" gap="sm">
        <Box flex={1}>
          <Input
            name="pickupZip"
            label="Pickup zip"
            value={zip}
            onInput={setZip}
            description="5-digit US zip code"
            error={zipHasError}
          />
        </Box>
        <Box flex="none">
          <Button
            variant="secondary"
            disabled={!zipIsValid || recommendation.isLoading}
            onClick={() => {
              setViewMode("recommend");
              findVehicles(zip);
            }}
          >
            {recommendation.isLoading ? "Finding…" : "Find vehicles"}
          </Button>
        </Box>
      </Flex>

      {renderBody()}

      <Divider />
      <Flex direction="row" justify="between" align="center" wrap="wrap" gap="sm">
        <Text variant="microcopy">Partly mocked: trip dates, insurance and booking are still sample data.</Text>
        <Inline gap="xs">
          {VIEW_MODES.map((mode) => (
            <Button
              key={mode.value}
              size="xs"
              variant={viewMode === mode.value ? "secondary" : "transparent"}
              onClick={() => setViewMode(mode.value)}
            >
              {mode.label}
            </Button>
          ))}
        </Inline>
      </Flex>
    </Flex>
  );
};

const RecommendView = ({ topPick, alternatives, bookingPanel }) => {
  const alternativeColumns = [
    { field: "vehicleName", label: "Vehicle", width: "auto" },
    { field: "priceLabel", label: "Daily", width: "min", cellWidth: "min" },
    { field: "totalLabel", label: "Trip total", width: "min", cellWidth: "min" },
    { field: "note", label: "Why", width: "min", cellWidth: "min" },
    {
      field: "id",
      label: "",
      width: "min",
      renderCell: (value, row) => (
        <Button variant="transparent" size="xs" overlay={bookingPanel(row)}>
          Offer
        </Button>
      ),
    },
  ];

  return (
    <Flex direction="column" gap="sm">
      <Tile>
        <Flex direction="row" align="center" gap="md">
          <Box flex={1}>
            <Flex direction="column" gap="xs">
              <Text variant="microcopy">Recommended</Text>
              <Text format={{ fontWeight: "demibold" }}>{topPick.vehicleName}</Text>
              <Text>{topPick.summaryLabel}</Text>
              <Inline gap="sm">
                {topPick.reasons.map((reason) => (
                  <StatusTag key={reason} variant="success">
                    {reason}
                  </StatusTag>
                ))}
              </Inline>
            </Flex>
          </Box>
          <Box flex="none">
            <Button variant="primary" overlay={bookingPanel(topPick)}>
              Offer this vehicle
            </Button>
          </Box>
        </Flex>
      </Tile>

      <Text format={{ fontWeight: "demibold" }}>Other options at this location</Text>
      <DataTable
        data={alternatives}
        columns={alternativeColumns}
        showSearch={false}
        showRowCount={false}
        bordered={true}
        flush={true}
      />
    </Flex>
  );
};

// Opens when the rep offers a vehicle and the customer says yes.
// "Create rental" is what will write the Rental Agreement record in Week 3.
const BookingPanel = ({ vehicle, customerName, locationName, onCreate, closeOverlay }) => {
  const panelId = `book-${vehicle.id}`;
  const formRef = useRef();
  const [values, setValues] = useState(INITIAL_BOOKING_VALUES);
  const price = priceBooking({ vehicle, ...values });

  return (
    <Panel id={panelId} title="Book rental" width="medium" variant="modal">
      <PanelBody>
        <Flex direction="column" gap="md">
          <DescriptionList direction="row">
            <DescriptionListItem label="Customer">
              <Text>{customerName}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Vehicle">
              <Text>{vehicle.vehicleName}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Pickup location">
              <Text>{locationName}</Text>
            </DescriptionListItem>
          </DescriptionList>

          <FormBuilder
            ref={formRef}
            columns={2}
            fields={BOOKING_FIELDS}
            initialValues={INITIAL_BOOKING_VALUES}
            onChange={setValues}
            submitPosition="none"
            onSubmit={(submitted) => onCreate(vehicle, submitted, panelId)}
          />

          <Divider />

          <DescriptionList direction="row">
            <DescriptionListItem label={`Rental (${price.days} days)`}>
              <Text>{price.rentalLabel}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Insurance">
              <Text>{price.insuranceLabel}</Text>
            </DescriptionListItem>
            <DescriptionListItem label="Total">
              <Text format={{ fontWeight: "demibold" }}>{price.totalLabel}</Text>
            </DescriptionListItem>
          </DescriptionList>
        </Flex>
      </PanelBody>
      <PanelFooter>
        <Flex direction="column">
          <Flex direction="row" justify="between">
            <Button variant="secondary" onClick={() => closeOverlay(panelId)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => formRef.current?.submit()}>
              Create rental
            </Button>
          </Flex>
        </Flex>
      </PanelFooter>
    </Panel>
  );
};

const BookedView = ({ booking, confirmationSent, onSendConfirmation, onViewAgreement, onStartOver }) => {
  const price = priceBooking(booking);

  return (
    <Flex direction="column" gap="sm">
      <Tile>
        <Flex direction="row" align="center" gap="md">
          <Box flex={1}>
            <Flex direction="column" gap="xs">
              <Inline gap="sm" align="center">
                <StatusTag variant="success">Reserved</StatusTag>
                <Text variant="microcopy">Rental agreement {booking.agreementId}</Text>
              </Inline>
              <Text format={{ fontWeight: "demibold" }}>{booking.vehicle.vehicleName}</Text>
              <Text>
                {price.datesLabel} · {booking.locationName}
              </Text>
            </Flex>
          </Box>
          <Box flex="none">
            {confirmationSent ? (
              <StatusTag variant="info">Confirmation sent</StatusTag>
            ) : (
              <Button variant="primary" onClick={onSendConfirmation}>
                Send confirmation
              </Button>
            )}
          </Box>
        </Flex>
      </Tile>

      <DescriptionList direction="row">
        <DescriptionListItem label={`Rental (${price.days} days)`}>
          <Text>{price.rentalLabel}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Insurance">
          <Text>{price.insuranceLabel}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Total">
          <Text format={{ fontWeight: "demibold" }}>{price.totalLabel}</Text>
        </DescriptionListItem>
        <DescriptionListItem label="Notes">
          <Text>{booking.notes || "--"}</Text>
        </DescriptionListItem>
      </DescriptionList>

      <Flex direction="row" gap="sm">
        <Button variant="secondary" onClick={onViewAgreement}>
          View agreement
        </Button>
        <Button variant="transparent" onClick={onStartOver}>
          Start a new offer
        </Button>
      </Flex>
    </Flex>
  );
};
