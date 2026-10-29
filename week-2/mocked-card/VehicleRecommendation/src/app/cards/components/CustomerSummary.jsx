import React from "react";
import { DescriptionList, DescriptionListItem, Text } from "@hubspot/ui-extensions";
import { formatCurrency } from "hs-uix/utils";
import { MOCK_TRIP } from "../mockData";

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

// The row at the top of the card: who, what they usually rent, the trip, where.
// historyLoading / historyFailed only matter until a customer object arrives.
export const CustomerSummary = ({ customerName, customer, historyLoading, historyFailed, location }) => {
  const usualRents = historyLoading && !customer ? "…" : historyFailed && !customer ? "--" : usualRentalLabel(customer);

  return (
    <DescriptionList direction="row">
      <DescriptionListItem label="Customer">
        <Text>{customerName}</Text>
      </DescriptionListItem>
      <DescriptionListItem label="Usually rents">
        <Text>{usualRents}</Text>
      </DescriptionListItem>
      <DescriptionListItem label="Trip">
        <Text>{MOCK_TRIP.label}</Text>
      </DescriptionListItem>
      <DescriptionListItem label="Nearest location">
        <Text>{locationLabel(location)}</Text>
      </DescriptionListItem>
    </DescriptionList>
  );
};
