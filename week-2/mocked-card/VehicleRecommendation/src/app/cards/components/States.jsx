import React from "react";
import { Button, EmptyState, ErrorState, Flex, LoadingSpinner, Text } from "@hubspot/ui-extensions";

// The card's loading / error / empty states, so each one looks the same wherever it's used.

export const Loading = ({ label }) => (
  <Flex direction="row" justify="center">
    <LoadingSpinner label={label} layout="centered" showLabel={true} />
  </Flex>
);

export const LoadError = ({ title, message, onRetry }) => (
  <ErrorState title={title}>
    <Text>{message}</Text>
    {onRetry && (
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </ErrorState>
);

export const Empty = ({ title, message }) => (
  <EmptyState title={title} layout="vertical" reverseOrder={false}>
    <Text>{message}</Text>
  </EmptyState>
);
