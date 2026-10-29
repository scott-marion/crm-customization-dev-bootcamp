// Everything the card shows comes from this file during the mockup stage.
// Display labels are already formatted here so the card only renders them.
// In the "first slice" step you replace one value at a time with real data
// and delete it from here. When this file is empty, the card is built.

// Real now:
// - The customer's name comes from the contact record (useCrmProperties).
// - The location, usual rental, top pick and alternatives come from the
//   recommendVehicles function.
// - Create rental writes a Rental Agreement through the createRental function.
export const MOCK_CUSTOMER = {
  email: "jordan.rivera@example.com",
};

// Dates use the DateInput shape: month starts at 0 (9 = October).
export const MOCK_TRIP = {
  pickupDate: { year: 2026, month: 9, date: 20 },
  returnDate: { year: 2026, month: 9, date: 24 },
  label: "Oct 20 – 24 (4 days)",
};

export const MOCK_INSURANCE_PER_DAY = 15;
