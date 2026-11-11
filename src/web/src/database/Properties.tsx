import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PropertyDefinition,
  PROPERTY_TYPES,
  type Property,
  type SelectOption,
} from '@fortnight/shared';
import { v7 } from 'uuid';
import { databaseApi } from '../api/databases';
export function NewProperty({ databaseId, done }: { databaseId: string; done: () => void }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [type, setType] = useState('text'),
    [target, setTarget] = useState(''),
    [error, setError] = useState('');
  const databases = useQuery({ queryKey: ['databases'], queryFn: databaseApi.list });
  async function create() {
    try {
      const config =
        type === 'number'
          ? { format: 'number' }
          : type === 'select' || type === 'multi_select'
            ? { options: [] }
            : type === 'relation'
              ? { targetDatabaseId: target || databases.data?.databases[0]?.id }
              : {};
      await databaseApi.property(
        databaseId,
        PropertyDefinition.parse({ name: name.trim(), type, config }),
      );
      done();
      setOpen(false);
      setName('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add property.');
    }
  }
  return (
    <div className="property-create">
      <button className="db-button" onClick={() => setOpen(!open)}>
        + Property
      </button>
      {open && (
        <div className="property-menu">
          <label>
            Name
            <input
              aria-label="Property name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </label>
          <label>
            Type
            <select
              aria-label="Property type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {PROPERTY_TYPES.filter((type) => type !== 'title').map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          {type === 'relation' && (
            <label>
              Related database
              <select
                aria-label="Related database"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose database</option>
                {databases.data?.databases.map((db) => (
                  <option value={db.id} key={db.id}>
                    {db.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" onClick={() => void create()} disabled={!name.trim()}>
            Add property
          </button>
        </div>
      )}
    </div>
  );
}
export function PropertyMenu({
  property,
  onSave,
  onDelete,
  onMove,
}: {
  property: Property;
  onSave: (name: string, options?: SelectOption[]) => Promise<void>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [name, setName] = useState(property.name),
    [options, setOptions] = useState<SelectOption[]>(
      property.type === 'select' || property.type === 'multi_select' ? property.config.options : [],
    ),
    [error, setError] = useState('');
  useEffect(() => setName(property.name), [property.name]);
  useEffect(() => {
    if (property.type === 'select' || property.type === 'multi_select')
      setOptions(property.config.options);
  }, [property]);
  return (
    <details className="property-details">
      <summary>
        {property.name}
        <span>⌄</span>
      </summary>
      <div className="property-menu">
        <label>
          Property name
          <input
            aria-label={'Rename ' + property.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        {(property.type === 'select' || property.type === 'multi_select') && (
          <div className="option-editor">
            {options.map((option, index) => (
              <div key={option.id}>
                <input
                  aria-label={'Option ' + (index + 1)}
                  value={option.name}
                  onChange={(e) =>
                    setOptions(
                      options.map((o, i) => (i === index ? { ...o, name: e.target.value } : o)),
                    )
                  }
                />
                <button
                  aria-label={'Remove option ' + option.name}
                  onClick={() => setOptions(options.filter((o) => o.id !== option.id))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setOptions([...options, { id: v7(), name: 'New option', color: 'green' }])
              }
            >
              + Option
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            void onSave(
              name,
              property.type === 'select' || property.type === 'multi_select' ? options : undefined,
            ).catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'Could not save property.'),
            )
          }
        >
          Save property
        </button>
        <div className="form-actions">
          <button onClick={() => onMove(-1)}>← Move left</button>
          <button onClick={() => onMove(1)}>Move right →</button>
        </div>
        {property.type !== 'title' && (
          <button className="danger-button" onClick={onDelete}>
            Delete property
          </button>
        )}
      </div>
    </details>
  );
}
