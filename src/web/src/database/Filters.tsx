import { type Filter, type FilterCondition, type FilterOp, type Property } from '@fortnight/shared';
const operations: Record<string, FilterOp[]> = {
  title: ['contains', 'not_contains', 'equals', 'starts_with', 'is_empty', 'is_not_empty'],
  text: ['contains', 'not_contains', 'equals', 'starts_with', 'is_empty', 'is_not_empty'],
  url: ['contains', 'equals', 'starts_with', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  select: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  multi_select: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
  date: [
    'on',
    'before',
    'after',
    'on_or_before',
    'on_or_after',
    'between',
    'past_week',
    'next_week',
    'this_week',
    'this_month',
    'is_empty',
    'is_not_empty',
  ],
  checkbox: ['is'],
  relation: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
};
export function emptyCondition(properties: Property[]): FilterCondition {
  return {
    propertyId: properties[0]!.id,
    op: (operations[properties[0]!.type] ?? ['contains'])[0]!,
    value: '',
  };
}
export function FilterEditor({
  filter,
  properties,
  onChange,
  depth = 0,
}: {
  filter: Filter;
  properties: Property[];
  onChange: (value: Filter) => void;
  depth?: number;
}) {
  if ('and' in filter || 'or' in filter) {
    const mode = 'and' in filter ? 'and' : 'or',
      items = 'and' in filter ? filter.and : filter.or;
    return (
      <div className="filter-group">
        <select
          aria-label="Filter group"
          value={mode}
          onChange={(e) => onChange(e.target.value === 'and' ? { and: items } : { or: items })}
        >
          <option value="and">All conditions</option>
          <option value="or">Any condition</option>
        </select>
        {items.map((item, index) => (
          <div key={index} className="filter-group-item">
            <FilterEditor
              filter={item}
              properties={properties}
              depth={depth + 1}
              onChange={(next) => {
                const all = items.map((value, i) => (i === index ? next : value));
                onChange(mode === 'and' ? { and: all } : { or: all });
              }}
            />
            <button
              aria-label="Remove filter"
              onClick={() => {
                const all = items.filter((_, i) => i !== index);
                onChange(mode === 'and' ? { and: all } : { or: all });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onChange(
              mode === 'and'
                ? { and: [...items, emptyCondition(properties)] }
                : { or: [...items, emptyCondition(properties)] },
            )
          }
        >
          + Condition
        </button>
        {depth < 2 && (
          <button
            onClick={() =>
              onChange(
                mode === 'and'
                  ? { and: [...items, { or: [emptyCondition(properties)] }] }
                  : { or: [...items, { and: [emptyCondition(properties)] }] },
              )
            }
          >
            + Group
          </button>
        )}
      </div>
    );
  }
  const property = properties.find((p) => p.id === filter.propertyId) ?? properties[0]!;
  const ops = operations[property.type] ?? ['contains'];
  const noValue = [
    'is_empty',
    'is_not_empty',
    'past_week',
    'next_week',
    'this_week',
    'this_month',
  ].includes(filter.op);
  const options =
    property.type === 'select' || property.type === 'multi_select' ? property.config.options : null;
  return (
    <div className="filter-condition">
      <select
        aria-label="Filter property"
        value={property.id}
        onChange={(e) => {
          const p = properties.find((p) => p.id === e.target.value)!;
          onChange({
            propertyId: p.id,
            op: operations[p.type]![0]!,
            value: p.type === 'checkbox' ? true : p.type === 'number' ? 0 : '',
          });
        }}
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter operation"
        value={filter.op}
        onChange={(e) =>
          onChange({
            ...filter,
            op: e.target.value as FilterOp,
            ...(e.target.value === 'between' ? { value: { start: '', end: '' } } : {}),
          })
        }
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {op.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      {!noValue &&
        (property.type === 'checkbox' ? (
          <select
            aria-label="Filter value"
            value={String(filter.value ?? true)}
            onChange={(e) => onChange({ ...filter, value: e.target.value === 'true' })}
          >
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        ) : options ? (
          <select
            aria-label="Filter value"
            value={typeof filter.value === 'string' ? filter.value : ''}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
          >
            <option value="">Choose option</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : filter.op === 'between' ? (
          <>
            <input
              aria-label="Filter start"
              type="date"
              value={typeof filter.value === 'object' ? filter.value.start : ''}
              onChange={(e) =>
                onChange({
                  ...filter,
                  value: {
                    start: e.target.value,
                    end: typeof filter.value === 'object' ? filter.value.end : '',
                  },
                })
              }
            />
            <input
              aria-label="Filter end"
              type="date"
              value={typeof filter.value === 'object' ? filter.value.end : ''}
              onChange={(e) =>
                onChange({
                  ...filter,
                  value: {
                    start: typeof filter.value === 'object' ? filter.value.start : '',
                    end: e.target.value,
                  },
                })
              }
            />
          </>
        ) : (
          <input
            aria-label="Filter value"
            type={
              property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'
            }
            value={
              typeof filter.value === 'string' || typeof filter.value === 'number'
                ? filter.value
                : ''
            }
            placeholder="Value"
            onChange={(e) =>
              onChange({
                ...filter,
                value: property.type === 'number' ? Number(e.target.value) : e.target.value,
              })
            }
          />
        ))}
    </div>
  );
}
