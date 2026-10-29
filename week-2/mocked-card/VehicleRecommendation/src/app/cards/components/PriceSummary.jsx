import React from "react";
import { DescriptionList, DescriptionListItem, Text } from "@hubspot/ui-extensions";

// Rental / insurance / total row, shared by the booking panel and the Booked view.
// `price` comes from priceBooking(); extra DescriptionListItems go in as children.
export const PriceSummary = ({ price, children }) => (
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
    {children}
  </DescriptionList>
);
