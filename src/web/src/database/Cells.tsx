import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateValue, type Property, type PropertyValue, type Row } from '@fortnight/shared';
import { databaseApi, type RowPatch } from '../api/databases';
import { localDateTime, zonedInput } from './dates';
export function DateForm({
  value,
  zone,
  onSave,
  onCancel,
}: {
  value: DateValue | null;
  zone: string;
  onSave: (value: DateValue | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const [allDay, setAllDay] = useState(value?.allDay ?? true);
  const [start, setStart] = useState(
    value ? (value.allDay ? value.start : localDateTime(value.start, zone)) : '',
  );
  const [end, setEnd] = useState(
    value?.end ? (value.allDay ? value.end : localDateTime(value.end, zone)) : '',
  );
  const [recurrence, setRecurrence] = useState(value?.recurrence ?? '');
  const [error, setError] = useState('');
  async function save() {
    try {
      if (!start) {
        await onSave(null);
        return;
      }
      const parsed = DateValue.parse({
        start: allDay
          ? start.slice(0, 10)
          : zonedInput(start.includes('T') ? start : start + 'T09:00', zone),
        end: end
          ? allDay
            ? end.slice(0, 10)
            : zonedInput(end.includes('T') ? end : end + 'T10:00', zone)
          : null,
        allDay,
        recurrence: recurrence.trim() || null,
      });
      await onSave(parsed);
      onCancel?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the dates and try again.');
    }
  }
  return (
    <div className="date-form">
      <label>
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => {
            setAllDay(e.target.checked);
            if (e.target.checked) {
              setStart(start.slice(0, 10));
              setEnd(end.slice(0, 10));
            } else {
              if (start.length === 10) setStart(start + 'T09:00');
              if (end.length === 10) setEnd(end + 'T10:00');
            }
          }}
        />
        All day
      </label>
      <label>
        Start
        <input
          aria-label="Start date"
          type={allDay ? 'date' : 'datetime-local'}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        End {allDay ? '(exclusive)' : ''}
        <input
          aria-label="End date"
          type={allDay ? 'date' : 'datetime-local'}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label>
        Repeat
        <input
          aria-label="Recurrence rule"
          placeholder="FREQ=WEEKLY;BYDAY=FR"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
        />
      </label>
      {!allDay && <small>Time zone: {zone}</small>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" onClick={() => void save()}>
          Save date
        </button>
        <button onClick={() => void onSave(null)}>Clear</button>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
function TextCell({
  value,
  kind = 'text',
  label,
  save,
}: {
  value: string | number | null;
  kind?: 'text' | 'number' | 'url';
  label: string;
  save: (value: PropertyValue) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const dirty = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dirty.current) setDraft(value === null ? '' : String(value));
  }, [value]);
  async function commit() {
    if (!dirty.current) return;
    try {
      const next = kind === 'number' ? (draft === '' ? null : Number(draft)) : draft || null;
      if (typeof next === 'number' && !Number.isFinite(next))
        throw new Error('Enter a valid number.');
      await save(next);
      dirty.current = false;
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    }
  }
  return (
    <div className="cell-input">
      <input
        aria-label={label}
        type={kind === 'number' ? 'number' : 'text'}
        value={draft}
        placeholder="Empty"
        onChange={(e) => {
          dirty.current = true;
          setDraft(e.target.value);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {error && (
        <span className="cell-error" role="alert">
          {error}
          <button onClick={() => void commit()}>Retry</button>
        </span>
      )}
    </div>
  );
}
export function PropertyCell({
  row,
  property,
  zone,
  save,
}: {
  row: Row;
  property: Property;
  zone: string;
  save: (patch: RowPatch) => Promise<void>;
}) {
  const value = property.type === 'title' ? row.title : row.properties[property.id];
  const [error, setError] = useState('');
  const relation = useQuery({
    queryKey: [
      'relation-options',
      property.type === 'relation' ? property.config.targetDatabaseId : null,
    ],
    queryFn: () =>
      databaseApi.query(property.type === 'relation' ? property.config.targetDatabaseId : '', {
        limit: 200,
      }),
    enabled: property.type === 'relation',
  });
  async function put(next: PropertyValue) {
    try {
      await save(
        property.type === 'title'
          ? { title: typeof next === 'string' ? next : '' }
          : { properties: { [property.id]: next } },
      );
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      throw e;
    }
  }
  if (
    property.type === 'title' ||
    property.type === 'text' ||
    property.type === 'url' ||
    property.type === 'number'
  )
    return (
      <TextCell
        label={property.name + ' for ' + (row.title || 'Untitled')}
        value={typeof value === 'string' || typeof value === 'number' ? value : null}
        kind={property.type === 'number' ? 'number' : property.type === 'url' ? 'url' : 'text'}
        save={put}
      />
    );
  if (property.type === 'checkbox')
    return (
      <input
        className="todo-check"
        type="checkbox"
        aria-label={property.name + ' for ' + row.title}
        checked={value === true}
        onChange={(e) => void put(e.target.checked).catch(() => {})}
      />
    );
  if (property.type === 'date') {
    const parsed = DateValue.safeParse(value);
    return (
      <details className="date-cell">
        <summary>
          {parsed.success
            ? parsed.data.start.replace('T', ' ').slice(0, 16) +
              (parsed.data.recurrence ? ' ↻' : '')
            : 'Set date'}
        </summary>
        <DateForm
          key={JSON.stringify(value)}
          value={parsed.success ? parsed.data : null}
          zone={zone}
          onSave={put}
        />
        {error && <p className="error">{error}</p>}
      </details>
    );
  }
  const options =
    property.type === 'select' || property.type === 'multi_select'
      ? property.config.options
      : (relation.data?.rows.map((r) => ({
          id: r.id,
          name: r.title || 'Untitled',
          color: 'default',
        })) ?? []);
  const multiple = property.type !== 'select';
  return (
    <div className="select-cell">
      <select
        aria-label={property.name + ' for ' + row.title}
        multiple={multiple}
        value={
          multiple ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? value : ''
        }
        onChange={(e) =>
          void put(
            multiple
              ? [...e.target.selectedOptions].map((option) => option.value)
              : e.target.value || null,
          ).catch(() => {})
        }
      >
        {!multiple && <option value="">Empty</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {error && (
        <span className="cell-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
