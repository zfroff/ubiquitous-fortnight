import { useRef, useState } from 'react';
import FullCalendar, {
  type CalendarRef,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from '@fullcalendar/react';
import dayGrid from '@fullcalendar/react/daygrid';
import timeGrid from '@fullcalendar/react/timegrid';
import interaction from '@fullcalendar/react/interaction';
import monarch from '@fullcalendar/react/themes/monarch';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/monarch/theme.css';
import '@fullcalendar/react/themes/monarch/palettes/green.css';
import { DateValue, EventOccurrence, type Property, type View } from '@fortnight/shared';
import { databaseApi, patchRow } from '../api/databases';
import { DateForm } from './Cells';
import { moveSeries } from './dates';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useQueryClient } from '@tanstack/react-query';
export function CalendarView({
  databaseId,
  properties,
  view,
  zone,
  onRow,
  onView,
}: {
  databaseId: string;
  properties: Property[];
  view: View;
  zone: string;
  onRow: (id: string) => void;
  onView: (config: View['config']) => Promise<void>;
}) {
  const calendar = useRef<CalendarRef>(null);
  const [create, setCreate] = useState<DateValue | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const { notify } = useWorkspace();
  const dateProperty = properties
    .filter((p) => p.type === 'date')
    .sort((a, b) => (a.position < b.position ? -1 : 1))[0];
  async function moved(info: EventDropInfo | EventResizeDoneInfo) {
    try {
      const original = EventOccurrence.parse(info.event.extendedProps.occurrence);
      await patchRow(original.rowId, {
        properties: {
          [original.datePropertyId]: moveSeries(
            original,
            info.event.startStr,
            info.event.endStr || null,
            info.event.allDay,
            zone,
          ),
        },
      });
      void client.invalidateQueries({ queryKey: ['rows', databaseId] });
      void client.invalidateQueries({ queryKey: ['row', original.rowId] });
      calendar.current?.getApi().refetchEvents();
      notify(original.recurring ? 'Recurring series rescheduled' : 'Event rescheduled');
    } catch (e) {
      info.revert();
      notify(e instanceof Error ? e.message : 'Could not reschedule this event.');
    }
  }
  if (!dateProperty)
    return (
      <div className="db-empty">
        <h2>A calendar needs a date.</h2>
        <p>Add a Date property, then return to this view.</p>
      </div>
    );
  const initialView =
    view.config.calendarMode === 'week'
      ? 'timeGridWeek'
      : view.config.calendarMode === 'day'
        ? 'timeGridDay'
        : 'dayGridMonth';
  return (
    <div className="calendar-view">
      <p className="calendar-note">
        Dates from {dateProperty.name} · {zone} · Moving a recurring event moves its whole series.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <FullCalendar
        ref={calendar}
        plugins={[monarch, dayGrid, timeGrid, interaction]}
        initialView={initialView}
        timeZone={zone}
        height="auto"
        headerToolbar={{
          start: 'title',
          end: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay',
        }}
        editable
        selectable
        selectMirror
        dayMaxEvents
        events={(range, success, failure) => {
          void databaseApi
            .events(range.startStr, range.endStr, [databaseId])
            .then((response) => {
              setError('');
              success(
                response.events.map((event) => ({
                  id: event.id,
                  title: (event.recurring ? '↻ ' : '') + (event.title || 'Untitled'),
                  start: event.occurrenceStart,
                  end: event.occurrenceEnd ?? undefined,
                  allDay: event.allDay,
                  extendedProps: { occurrence: event },
                })),
              );
            })
            .catch((e: unknown) => {
              const error = e instanceof Error ? e : new Error('Calendar could not load.');
              setError(error.message);
              failure(error);
            });
        }}
        dateClick={(info) => {
          setTitle('');
          setCreate({ start: info.dateStr, end: null, allDay: info.allDay, recurrence: null });
        }}
        select={(info) => {
          setTitle('');
          setCreate({
            start: info.startStr,
            end: info.endStr,
            allDay: info.allDay,
            recurrence: null,
          });
        }}
        eventClick={(info) => onRow(String(info.event.extendedProps.occurrence.rowId))}
        eventDrop={(info) => void moved(info)}
        eventResize={(info) => void moved(info)}
        datesSet={(info) => {
          const mode =
            info.view.type === 'timeGridWeek'
              ? 'week'
              : info.view.type === 'timeGridDay'
                ? 'day'
                : 'month';
          if (mode !== (view.config.calendarMode ?? 'month'))
            void onView({ ...view.config, calendarMode: mode }).catch(() => {});
        }}
      />
      {create && (
        <div className="modal-backdrop">
          <section className="event-dialog" role="dialog" aria-modal="true" aria-label="New event">
            <h2>A little time for something.</h2>
            <label>
              Event title
              <input
                aria-label="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="What is happening?"
              />
            </label>
            <DateForm
              key={JSON.stringify(create)}
              value={create}
              zone={zone}
              onCancel={() => setCreate(null)}
              onSave={async (date) => {
                if (!date) {
                  setCreate(null);
                  return;
                }
                await databaseApi.createRow(databaseId, {
                  title: title || 'Untitled event',
                  properties: { [dateProperty.id]: date },
                });
                setCreate(null);
                calendar.current?.getApi().refetchEvents();
                void client.invalidateQueries({ queryKey: ['rows', databaseId] });
                notify('Event created');
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
