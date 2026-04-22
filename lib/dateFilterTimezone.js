const MS_PER_MINUTE = 60 * 1000;

function parseDateParts(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

export function parseTimezoneOffsetMinutes(rawOffset) {
  const parsed = Number.parseInt(rawOffset, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateTimeToUtcDate(year, month, day, hours, minutes, seconds, milliseconds, tzOffsetMinutes) {
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds) + (tzOffsetMinutes * MS_PER_MINUTE);
  return new Date(utcMs);
}

export function getUtcBoundsForLocalDateRange(startDateStr, endDateStr, tzOffsetMinutes = 0) {
  const start = parseDateParts(startDateStr);
  const end = parseDateParts(endDateStr);
  if (!start || !end) return { startDate: null, endDate: null };

  return {
    startDate: localDateTimeToUtcDate(start.year, start.month, start.day, 0, 0, 0, 0, tzOffsetMinutes),
    endDate: localDateTimeToUtcDate(end.year, end.month, end.day, 23, 59, 59, 999, tzOffsetMinutes)
  };
}

export function getUserLocalTodayDateString(tzOffsetMinutes = 0) {
  const localNow = new Date(Date.now() - (tzOffsetMinutes * MS_PER_MINUTE));
  const year = localNow.getUTCFullYear();
  const month = String(localNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localNow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
