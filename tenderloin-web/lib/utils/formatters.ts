/** Formatting utilities for the Spanish locale. */

const NUMBER_FMT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Format a budget amount as "€ 40.000" (Spanish locale). */
export function formatBudget(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return NUMBER_FMT.format(amount);
}

const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Format an ISO date string as "15 ene 2025". */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return DATE_FMT.format(new Date(isoDate));
}

/** Return "X días" remaining until a deadline, or "Vencido" if past. */
export function daysUntil(isoDate: string | null | undefined): {
  label: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!isoDate) return { label: "Sin fecha", urgent: false, expired: false };

  const diff = Math.ceil(
    (new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (diff < 0) return { label: "Vencido", urgent: false, expired: true };
  if (diff === 0) return { label: "Hoy", urgent: true, expired: false };
  if (diff === 1) return { label: "1 día", urgent: true, expired: false };
  return { label: `${diff} días`, urgent: diff <= 5, expired: false };
}

/** Truncate text to maxLength characters, adding "…" if needed. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
