import { formatCurrency, formatDate } from "hs-uix/utils";
import { MOCK_INSURANCE_PER_DAY, MOCK_TRIP } from "../mockData";

// Dates here use the DateInput shape: { year, month (0-based), date }.
export const toDate = (d) => (d ? new Date(d.year, d.month, d.date) : null);

// DateInput -> "YYYY-MM-DD", the format HubSpot date properties take.
export const toDay = (d) =>
  d ? `${d.year}-${String(d.month + 1).padStart(2, "0")}-${String(d.date).padStart(2, "0")}` : null;

export const countDays = (pickup, dropoff) => {
  const start = toDate(pickup);
  const end = toDate(dropoff);
  if (!start || !end) return 0;
  return Math.max(Math.round((end - start) / 86400000), 0);
};

// Rental, insurance and total for a booking, as display labels.
export const priceBooking = ({ vehicle, pickupDate, returnDate, insurance }) => {
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

export const withPriceLabels = (vehicle) => {
  const daily = `${formatCurrency(vehicle.dailyPrice)}/day`;
  const total = formatCurrency(vehicle.dailyPrice * TRIP_DAYS);
  return { ...vehicle, priceLabel: daily, totalLabel: total, summaryLabel: `${daily} · ${total} total` };
};
