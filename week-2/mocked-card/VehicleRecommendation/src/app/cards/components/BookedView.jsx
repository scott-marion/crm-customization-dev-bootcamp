import React from "react";
import { Box, Button, DescriptionListItem, Flex, Inline, StatusTag, Text, Tile } from "@hubspot/ui-extensions";
import { priceBooking } from "../lib/pricing";
import { PriceSummary } from "./PriceSummary";

// After Create rental: what was booked, plus the confirmation step.
// The new agreement also shows in the contact's Rental Agreements association card.
export const BookedView = ({ booking, confirmationSent, onSendConfirmation, onStartOver }) => {
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

      <PriceSummary price={price}>
        <DescriptionListItem label="Notes">
          <Text>{booking.notes || "--"}</Text>
        </DescriptionListItem>
      </PriceSummary>

      <Flex direction="row" gap="sm">
        <Button variant="transparent" onClick={onStartOver}>
          Start a new offer
        </Button>
      </Flex>
    </Flex>
  );
};
