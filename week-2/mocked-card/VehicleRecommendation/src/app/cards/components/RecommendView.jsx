import React, { useState } from "react";
import { Box, Button, Flex, Inline, StatusTag, Text, Tile } from "@hubspot/ui-extensions";
import { DataTable } from "hs-uix/datatable";

// The selected vehicle in a tile with one Offer button, then the other options at
// the same location. Selecting a row swaps it into the tile; the recommended
// vehicle drops into the table so the rep can switch back.
// bookingPanel(vehicle) returns the overlay the Offer button opens.
export const RecommendView = ({ topPick, alternatives, bookingPanel }) => {
  const [selectedId, setSelectedId] = useState(topPick.id);
  const vehicles = [{ ...topPick, note: "Recommended" }, ...alternatives];
  const selected = vehicles.find((v) => v.id === selectedId) ?? vehicles[0];
  const isRecommended = selected.id === topPick.id;
  const others = vehicles.filter((v) => v.id !== selected.id);

  const columns = [
    { field: "vehicleName", label: "Vehicle", width: "auto" },
    { field: "priceLabel", label: "Daily", width: "min", cellWidth: "min" },
    { field: "totalLabel", label: "Trip total", width: "min", cellWidth: "min" },
    { field: "note", label: "Why", width: "min", cellWidth: "min" },
    {
      field: "id",
      label: "",
      width: "min",
      cellWidth: "min",
      renderCell: (value) => (
        <Button variant="secondary" size="xs" onClick={() => setSelectedId(value)}>
          Select
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
              <Text variant="microcopy">{isRecommended ? "Recommended" : "Selected instead of the recommendation"}</Text>
              <Text format={{ fontWeight: "demibold" }}>{selected.vehicleName}</Text>
              <Text>{selected.summaryLabel}</Text>
              <Inline gap="sm">
                {isRecommended ? (
                  selected.reasons.map((reason) => (
                    <StatusTag key={reason} variant="success">
                      {reason}
                    </StatusTag>
                  ))
                ) : (
                  <StatusTag variant="info">{selected.note}</StatusTag>
                )}
              </Inline>
            </Flex>
          </Box>
          <Box flex="none">
            <Button variant="primary" overlay={bookingPanel(selected)}>
              Offer this vehicle
            </Button>
          </Box>
        </Flex>
      </Tile>

      <Text format={{ fontWeight: "demibold" }}>Other options at this location</Text>
      <DataTable
        data={others}
        columns={columns}
        rowIdField="id"
        showSearch={false}
        showRowCount={false}
        bordered={true}
        flush={true}
      />
    </Flex>
  );
};
