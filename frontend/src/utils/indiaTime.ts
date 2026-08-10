export const INDIA_TIME_ZONE = 'Asia/Kolkata';
export const RATE_REMINDER_HOUR_IST = 8;

interface IndiaDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const INDIA_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const LONG_INDIA_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export const getIndiaDateParts = (date: Date): IndiaDateParts => {
  const partByType = new Map(
    INDIA_PARTS_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(partByType.get('year')),
    month: Number(partByType.get('month')),
    day: Number(partByType.get('day')),
    hour: Number(partByType.get('hour')),
    minute: Number(partByType.get('minute')),
  };
};

export const getIndiaDateKey = (date: Date): string => {
  const { year, month, day } = getIndiaDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const formatLongIndiaDate = (date: Date): string =>
  LONG_INDIA_DATE_FORMATTER.format(date);

export const isAtOrAfterRateReminderTime = (date: Date): boolean =>
  getIndiaDateParts(date).hour >= RATE_REMINDER_HOUR_IST;

export const getNextRateReminderAt = (date: Date): Date => {
  const { year, month, day } = getIndiaDateParts(date);
  const todayAtEightIst = new Date(Date.UTC(year, month - 1, day, 2, 30));
  return date < todayAtEightIst
    ? todayAtEightIst
    : new Date(Date.UTC(year, month - 1, day + 1, 2, 30));
};

export const getNextIndiaMidnightAt = (date: Date): Date => {
  const { year, month, day } = getIndiaDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 18, 30));
};
