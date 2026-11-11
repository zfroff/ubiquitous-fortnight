import { Temporal } from 'temporal-polyfill';
import type { DateValue, EventOccurrence } from '@fortnight/shared';
export function localDateTime(value: string, zone: string) {
  return Temporal.Instant.from(value)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}
export function zonedInput(value: string, zone: string) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(zone)
    .toString({ timeZoneName: 'never' });
}
export function moveSeries(
  original: EventOccurrence,
  start: string,
  end: string | null,
  allDay: boolean,
  zone: string,
): DateValue {
  if (allDay) {
    const days = Temporal.PlainDate.from(start.slice(0, 10)).since(
      Temporal.PlainDate.from(original.occurrenceStart.slice(0, 10)),
    ).days;
    const base = original.allDay
      ? Temporal.PlainDate.from(original.start)
      : Temporal.Instant.from(original.start).toZonedDateTimeISO(zone).toPlainDate();
    const next = base.add({ days });
    const duration = end
      ? Temporal.PlainDate.from(end.slice(0, 10)).since(Temporal.PlainDate.from(start.slice(0, 10)))
          .days
      : 0;
    return {
      start: next.toString(),
      end: duration ? next.add({ days: duration }).toString() : null,
      allDay: true,
      recurrence: original.recurrence,
    };
  }
  const oldLocal = original.allDay
    ? Temporal.PlainDate.from(original.occurrenceStart).toPlainDateTime()
    : Temporal.Instant.from(original.occurrenceStart).toZonedDateTimeISO(zone).toPlainDateTime();
  const newLocal = Temporal.Instant.from(start).toZonedDateTimeISO(zone).toPlainDateTime();
  const delta = newLocal.since(oldLocal, { largestUnit: 'day' });
  const base = original.allDay
    ? Temporal.PlainDate.from(original.start).toPlainDateTime()
    : Temporal.Instant.from(original.start).toZonedDateTimeISO(zone).toPlainDateTime();
  const next = base.add(delta).toZonedDateTime(zone);
  const milliseconds = end
    ? Temporal.Instant.from(end).epochMilliseconds - Temporal.Instant.from(start).epochMilliseconds
    : 0;
  return {
    start: next.toString({ timeZoneName: 'never' }),
    end: milliseconds ? next.add({ milliseconds }).toString({ timeZoneName: 'never' }) : null,
    allDay: false,
    recurrence: original.recurrence,
  };
}
