import React, { useEffect, useState } from "react";
import { Divider, Flex, Text, hubspot } from "@hubspot/ui-extensions";
import { useCrmProperties } from "@hubspot/ui-extensions/crm";
import { MOCK_CUSTOMER } from "./mockData";
import { callFunction, useFunction } from "./useFunction";
import { toDay, withPriceLabels } from "./lib/pricing";
import { BookedView } from "./components/BookedView";
import { BookingPanel } from "./components/BookingPanel";
import { CustomerSummary } from "./components/CustomerSummary";
import { RecommendView } from "./components/RecommendView";
import { Empty, Loading, LoadError } from "./components/States";
import { ZIP_PATTERN, ZipSearch } from "./components/ZipSearch";

// Started as the Week 2 mockup. Real data replaces mockData.js one slice
// at a time; whatever is still in mockData.js is still fake.
//
// Flow: Recommend → Offer (booking panel) → Create rental → Booked.
//
// This file owns the state and data calls; the pieces it renders live in
// components/, and the price math in lib/pricing.js.

// The customer's name, and the zip that prefills the pickup zip.
const CONTACT_PROPERTIES = ["firstname", "lastname", "zip"];

hubspot.extend(({ context, actions }) => (
  <Extension
    contactId={context.crm.objectId}
    sendAlert={actions.addAlert}
    closeOverlay={actions.closeOverlay}
  />
));

const Extension = ({ contactId, sendAlert, closeOverlay }) => {
  // Set once Create rental has written the Rental Agreement record.
  const [booking, setBooking] = useState(null);
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
  // Latest history wins: a search returns it too, in case it changed since load.
  const customer = result?.customer ?? history.data?.customer;

  // Writes the agreement through the createRental function. Throws on failure so
  // the booking panel can show the error and stay open.
  const createRental = async (vehicle, values, panelId) => {
    const agreement = await callFunction("createRental", {
      parameters: {
        contactId,
        vehicleId: vehicle.id,
        startDate: toDay(values.pickupDate),
        endDate: toDay(values.returnDate),
        insurance: Boolean(values.insurance),
      },
    });
    setBooking({
      ...values,
      agreementId: agreement.name,
      // The function charges the vehicle's current price, which may differ from the card's copy.
      vehicle: { ...vehicle, dailyPrice: agreement.costPerDay },
      locationName: location?.name ?? "--",
    });
    setConfirmationSent(false);
    closeOverlay(panelId);
    sendAlert({ type: "success", message: `Rental ${agreement.name} created for ${customerName}.` });
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
    if (booking) {
      return (
        <BookedView
          booking={booking}
          confirmationSent={confirmationSent}
          onSendConfirmation={sendConfirmation}
          onStartOver={() => setBooking(null)}
        />
      );
    }

    // Recommend: real data from the recommendVehicles function.
    if (recommendation.status === "idle") {
      return (
        <Empty
          title="Enter a pickup zip"
          message="Ask where the customer wants to pick up, then find vehicles at the nearest location."
        />
      );
    }

    // Spinner only on the first search; a re-search keeps the current results on screen.
    if (recommendation.isLoading && !result) return <Loading label="Finding vehicles..." />;

    if (recommendation.status === "error") {
      return <LoadError title="Trouble loading vehicles." message={recommendation.error} onRetry={() => findVehicles(zip)} />;
    }

    if (!result?.topPick) {
      return <Empty title="No vehicles available" message="No vehicles are available at the locations nearest this zip." />;
    }

    // Keyed so a search that lands on a different location or top pick resets the selection.
    return (
      <RecommendView
        key={`${location?.id}-${result.topPick.id}`}
        bookingPanel={bookingPanel}
        alternatives={result.alternatives.map(withPriceLabels)}
        topPick={withPriceLabels(result.topPick)}
      />
    );
  };

  return (
    <Flex direction="column" gap="sm">
      <CustomerSummary
        customerName={customerName}
        customer={customer}
        historyLoading={history.isLoading}
        historyFailed={Boolean(history.error)}
        location={location}
      />

      <ZipSearch
        zip={zip}
        onZipChange={setZip}
        isSearching={recommendation.isLoading}
        onSearch={() => {
          setBooking(null);
          findVehicles(zip);
        }}
      />

      {renderBody()}

      <Divider />
      <Text variant="microcopy">
        Partly mocked: the Trip line, the insurance rate and the confirmation email are still sample data.
      </Text>
    </Flex>
  );
};
