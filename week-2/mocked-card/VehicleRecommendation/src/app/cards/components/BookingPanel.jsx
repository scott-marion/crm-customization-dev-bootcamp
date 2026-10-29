import React, { useRef, useState } from "react";
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListItem,
  Divider,
  Flex,
  Panel,
  PanelBody,
  PanelFooter,
  Text,
} from "@hubspot/ui-extensions";
import { FormBuilder } from "hs-uix/form";
import { formatCurrency } from "hs-uix/utils";
import { MOCK_INSURANCE_PER_DAY, MOCK_TRIP } from "../mockData";
import { priceBooking, toDate } from "../lib/pricing";
import { PriceSummary } from "./PriceSummary";

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
  {
    name: "notes",
    type: "textarea",
    label: "Notes for the location",
    description: "Not saved yet: Rental Agreements have no notes property.",
    width: "full",
  },
];

const INITIAL_BOOKING_VALUES = {
  pickupDate: MOCK_TRIP.pickupDate,
  returnDate: MOCK_TRIP.returnDate,
  insurance: false,
  notes: "",
};

// Opens when the rep offers a vehicle and the customer says yes.
// "Create rental" writes the Rental Agreement record; onCreate returns a promise
// and throws with a message the panel shows inline.
export const BookingPanel = ({ vehicle, customerName, locationName, onCreate, closeOverlay }) => {
  const panelId = `book-${vehicle.id}`;
  const formRef = useRef();
  const [values, setValues] = useState(INITIAL_BOOKING_VALUES);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const price = priceBooking({ vehicle, ...values });

  const submit = async (submitted) => {
    setIsCreating(true);
    setError(null);
    try {
      await onCreate(vehicle, submitted, panelId);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setIsCreating(false);
    }
  };

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
            onSubmit={submit}
          />

          <Divider />

          <PriceSummary price={price} />

          {error && (
            <Alert title="Rental not created" variant="danger">
              {error}
            </Alert>
          )}
        </Flex>
      </PanelBody>
      <PanelFooter>
        <Flex direction="column">
          <Flex direction="row" justify="between">
            <Button variant="secondary" disabled={isCreating} onClick={() => closeOverlay(panelId)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={isCreating} onClick={() => formRef.current?.submit()}>
              {isCreating ? "Creating…" : "Create rental"}
            </Button>
          </Flex>
        </Flex>
      </PanelFooter>
    </Panel>
  );
};
