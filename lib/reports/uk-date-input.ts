const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UK_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Parse a UK `dd/mm/yyyy` (or ISO `yyyy-mm-dd`) entry to ISO, or null if invalid. */
export function isoDateFromUkInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(ISO_DATE);
  if (isoMatch) {
    return toIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const ukMatch = trimmed.match(UK_DATE);
  if (!ukMatch) return null;

  return toIsoDate(
    Number(ukMatch[3]),
    Number(ukMatch[2]),
    Number(ukMatch[1])
  );
}

/** Format a stored ISO date as `dd/mm/yyyy` for the report-period field. */
export function ukDateFromIso(value: string): string {
  const match = value.trim().match(ISO_DATE);
  if (!match) return "";
  if (!isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return "";
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}
