import React from "react";
import { Box, Button, Flex, Input } from "@hubspot/ui-extensions";

export const ZIP_PATTERN = /^\d{5}$/;

// Pickup zip input with its search button.
export const ZipSearch = ({ zip, onZipChange, onSearch, isSearching }) => {
  // Flag only what can't become a zip (letters, too long); partial input is fine.
  const hasError = !/^\d{0,5}$/.test(zip);

  return (
    <Flex direction="row" align="end" gap="sm">
      <Box flex={1}>
        {/* onInput, not onChange: onChange only fires on blur, so the button stayed disabled. */}
        <Input
          name="pickupZip"
          label="Pickup zip"
          value={zip}
          onInput={onZipChange}
          description="5-digit US zip code"
          error={hasError}
        />
      </Box>
      <Box flex="none">
        <Button variant="secondary" disabled={!ZIP_PATTERN.test(zip) || isSearching} onClick={onSearch}>
          {isSearching ? "Finding…" : "Find vehicles"}
        </Button>
      </Box>
    </Flex>
  );
};
