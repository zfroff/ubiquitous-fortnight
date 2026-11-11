import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { Database, Plus, ArrowUpRight, Trash2 } from 'lucide-react';
import {
  positionBetween,
  type Filter,
  type Property,
  type QueryDatabaseResponse,
  type Row,
  type Sort,
  type View,
  type ViewConfig,
  type ViewType,
} from '@fortnight/shared';
import { databaseApi, patchRow, type RowPatch } from '../api/databases';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { PropertyCell } from './Cells';
import { NewProperty, PropertyMenu } from './Properties';
import { FilterEditor } from './Filters';
import { CalendarView } from './CalendarView';

function ViewSettings({
  view,
  properties,
  save,
}: {
  view: View;
  properties: Property[];
  save: (config: ViewConfig) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>(view.config.filter ?? { and: [] });
  const [sorts, setSorts] = useState<Sort[]>(view.config.sorts ?? []);
  const [visible, setVisible] = useState<string[]>(
    view.config.visiblePropertyIds ?? properties.map((p) => p.id),
  );
  const [error, setError] = useState('');
  return (
    <details className="view-settings">
      <summary>Filter & sort</summary>
      <div className="view-settings-panel">
        <h3>Filters</h3>
        <FilterEditor filter={filter} properties={properties} onChange={setFilter} />
        <h3>Sort</h3>
        {sorts.map((sort, index) => (
          <div className="sort-row" key={index}>
            <select
              aria-label="Sort property"
              value={sort.propertyId}
              onChange={(e) =>
                setSorts(
                  sorts.map((s, i) => (i === index ? { ...s, propertyId: e.target.value } : s)),
                )
              }
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="created_time">Created time</option>
              <option value="updated_time">Updated time</option>
            </select>
            <select
              aria-label="Sort direction"
              value={sort.direction}
              onChange={(e) =>
                setSorts(
                  sorts.map((s, i) =>
                    i === index ? { ...s, direction: e.target.value as 'asc' | 'desc' } : s,
                  ),
                )
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              aria-label="Remove sort"
              onClick={() => setSorts(sorts.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="db-button"
          onClick={() => setSorts([...sorts, { propertyId: properties[0]!.id, direction: 'asc' }])}
        >
          + Sort
        </button>
        <h3>Visible properties</h3>
        <div className="property-visibility">
          {properties.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={p.type === 'title' || visible.includes(p.id)}
                disabled={p.type === 'title'}
                onChange={(e) =>
                  setVisible(
                    e.target.checked ? [...visible, p.id] : visible.filter((id) => id !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button
          className="primary"
          onClick={() =>
            void save({ ...view.config, filter, sorts, visiblePropertyIds: visible }).catch(
              (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save view.'),
            )
          }
        >
          Apply settings
        </button>
        <button
          className="text-button"
          onClick={() => {
            setFilter({ and: [] });
            setSorts([]);
            void save({ ...view.config, filter: { and: [] }, sorts: [] });
          }}
        >
          Clear filters
        </button>
      </div>
    </details>
  );
}
export function DatabaseWorkspace({ databaseId }: { databaseId: string }) {
  const client = useQueryClient();
  const workspace = useWorkspace();
  const database = useQuery({
    queryKey: ['database', databaseId],
    queryFn: () => databaseApi.get(databaseId),
  });
  const settings = useQuery({ queryKey: ['workspace'], queryFn: databaseApi.workspace });
  const [selected, setSelected] = useState(
    () => sessionStorage.getItem('fortnight:view:' + databaseId) ?? '',
  );
  const [widths, setWidths] = useState<Record<string, number>>({});
  const resize = useRef<{ id: string; x: number; width: number } | null>(null),
    widthRef = useRef(widths);
  widthRef.current = widths;
  const view = database.data?.views.find((v) => v.id === selected) ?? database.data?.views[0];
  const properties = (database.data?.properties ?? [])
    .slice()
    .sort((a, b) => (a.position < b.position ? -1 : 1));
  const rows = useInfiniteQuery({
    queryKey: ['rows', databaseId, view?.id, view?.config],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      databaseApi.query(databaseId, {
        viewId: view!.id,
        limit: 200,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!view,
  });
  useEffect(() => {
    setWidths(view?.config.propertyWidths ?? {});
  }, [view?.id, view?.config.propertyWidths]);
  const zone = settings.data?.settings.timeZone ?? 'UTC';
  const allRows = rows.data?.pages.flatMap((page) => page.rows) ?? [];
  function refresh() {
    void client.invalidateQueries({ queryKey: ['database', databaseId] });
    void client.invalidateQueries({ queryKey: ['rows', databaseId] });
    void client.invalidateQueries({ queryKey: ['databases'] });
    workspace.refresh();
  }
  async function action(work: () => Promise<unknown>, success?: string) {
    try {
      await work();
      refresh();
      if (success) workspace.notify(success);
    } catch (e) {
      workspace.notify(e instanceof Error ? e.message : 'Could not complete that change.');
      throw e;
    }
  }
  async function saveView(config: ViewConfig) {
    if (!view) return;
    await databaseApi.updateView(view.id, { config });
    refresh();
  }
  async function switchType(type: ViewType) {
    if (!database.data) return;
    let next = database.data.views.find((view) => view.type === type);
    if (!next) {
      next = await databaseApi.createView(databaseId, {
        type,
        name: type[0]!.toUpperCase() + type.slice(1),
        config: {
          ...(type === 'board' && properties.find((p) => p.type === 'select')
            ? { groupByPropertyId: properties.find((p) => p.type === 'select')!.id }
            : {}),
          ...(type === 'calendar' ? { calendarMode: 'month' } : {}),
        },
      });
      client.setQueryData(['database', databaseId], {
        ...database.data,
        views: [...database.data.views, next],
      });
    }
    setSelected(next.id);
    sessionStorage.setItem('fortnight:view:' + databaseId, next.id);
  }
  async function saveRow(row: Row, patch: RowPatch) {
    const apply = (value: Row) =>
      client.setQueriesData<InfiniteData<QueryDatabaseResponse>>(
        { queryKey: ['rows', databaseId] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  rows: page.rows.map((r) => (r.id === value.id ? value : r)),
                })),
              }
            : old,
      );
    apply({ ...row, ...patch, properties: { ...row.properties, ...patch.properties } });
    try {
      const updated = await patchRow(row.id, patch);
      apply(updated);
      void client.invalidateQueries({ queryKey: ['row', row.id] });
      void client.invalidateQueries({ queryKey: ['calendar'] });
      return;
    } catch (e) {
      apply(row);
      workspace.notify(e instanceof Error ? e.message : 'Could not save the value.');
      throw e;
    }
  }
  async function addRow() {
    await action(async () => {
      const row = await databaseApi.createRow(databaseId, { title: 'Untitled' });
      workspace.openRow(row.id);
    });
  }
  async function reorderProperty(property: Property, targetIndex: number) {
    const others = properties.filter((p) => p.id !== property.id),
      index = Math.max(0, Math.min(targetIndex, others.length));
    await action(() =>
      databaseApi.updateProperty(property.id, {
        position: positionBetween(
          others[index - 1]?.position ?? null,
          others[index]?.position ?? null,
        ),
      }),
    );
  }
  if (database.isPending)
    return (
      <div className="document-loading" role="status">
        Opening database…
      </div>
    );
  if (database.isError || !view)
    return (
      <div className="db-empty">
        <h2>Could not open this database.</h2>
        <button className="db-button" onClick={() => void database.refetch()}>
          Try again
        </button>
      </div>
    );
  const visible = properties.filter(
    (p) =>
      p.type === 'title' ||
      !view.config.visiblePropertyIds ||
      view.config.visiblePropertyIds.includes(p.id),
  );
  const group =
    properties.find((p) => p.id === view.config.groupByPropertyId && p.type === 'select') ??
    properties.find((p) => p.type === 'select');
  const columns =
    group?.type === 'select' ? [{ id: '', name: 'No ' + group.name }, ...group.config.options] : [];
  function card(row: Row) {
    const coverId = view!.config.coverPropertyId;
    const cover =
      coverId && typeof row.properties[coverId] === 'string' ? String(row.properties[coverId]) : '';
    return (
      <article
        key={row.id}
        className="database-card"
        draggable={view!.type === 'board'}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/fortnight-row', row.id);
        }}
      >
        {view!.type === 'gallery' && (
          <div className="gallery-cover">
            {/^https?:\/\//.test(cover) || cover.startsWith('/uploads/') ? (
              <img src={cover} alt="" />
            ) : (
              <Database size={28} />
            )}
          </div>
        )}
        <button className="card-title" onClick={() => workspace.openRow(row.id)}>
          {row.title || 'Untitled'}
          <ArrowUpRight size={13} />
        </button>
        {visible
          .filter((p) => p.type !== 'title')
          .map((property) => (
            <div className="card-property" key={property.id}>
              <span>{property.name}</span>
              <PropertyCell
                row={row}
                property={property}
                zone={zone}
                save={(patch) => saveRow(row, patch)}
              />
            </div>
          ))}
      </article>
    );
  }
  return (
    <section className="database-workspace">
      <div className="database-heading">
        <Database size={24} />
        <input
          aria-label="Database title"
          className="database-title"
          defaultValue={database.data.database.title}
          onBlur={(e) => {
            if (e.target.value !== database.data.database.title)
              void action(
                () => databaseApi.rename(databaseId, e.target.value),
                'Database renamed',
              ).catch(() => {});
          }}
        />
      </div>
      <div className="database-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Database views">
          {(['table', 'board', 'list', 'gallery', 'calendar'] as const).map((type) => (
            <button
              key={type}
              role="tab"
              aria-selected={view.type === type}
              onClick={() =>
                void switchType(type).catch((e: unknown) =>
                  workspace.notify(e instanceof Error ? e.message : 'Could not open view.'),
                )
              }
            >
              {type[0]!.toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <button className="db-button" onClick={() => void addRow().catch(() => {})}>
          <Plus size={14} />
          New item
        </button>
      </div>
      <div className="database-options">
        <select
          aria-label="Saved view"
          value={view.id}
          onChange={(e) => {
            setSelected(e.target.value);
            sessionStorage.setItem('fortnight:view:' + databaseId, e.target.value);
          }}
        >
          {database.data.views.map((v) => (
            <option value={v.id} key={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <ViewSettings
          key={view.id + JSON.stringify(view.config)}
          view={view}
          properties={properties}
          save={saveView}
        />
        <NewProperty databaseId={databaseId} done={refresh} />
        {view.type === 'board' && (
          <label>
            Group by
            <select
              aria-label="Board group property"
              value={group?.id ?? ''}
              onChange={(e) => void saveView({ ...view.config, groupByPropertyId: e.target.value })}
            >
              <option value="">Select property</option>
              {properties
                .filter((p) => p.type === 'select')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {view.type === 'gallery' && (
          <label>
            Cover
            <select
              aria-label="Gallery cover"
              value={view.config.coverPropertyId ?? ''}
              onChange={(e) =>
                void saveView({
                  ...view.config,
                  ...(e.target.value
                    ? { coverPropertyId: e.target.value }
                    : { coverPropertyId: undefined }),
                })
              }
            >
              <option value="">None</option>
              {properties
                .filter((p) => p.type === 'url' || p.type === 'text')
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {view.type === 'calendar' ? (
        <CalendarView
          key={view.id}
          databaseId={databaseId}
          properties={properties}
          view={view}
          zone={zone}
          onRow={workspace.openRow}
          onView={saveView}
        />
      ) : rows.isPending ? (
        <div className="db-empty" role="status">
          Loading items…
        </div>
      ) : rows.isError ? (
        <div className="db-empty">
          <p>Items could not be loaded.</p>
          <button className="db-button" onClick={() => void rows.refetch()}>
            Try again
          </button>
        </div>
      ) : view.type === 'table' ? (
        <div className="database-table-scroll">
          <table className="database-table">
            <thead>
              <tr>
                {visible.map((property) => (
                  <th
                    key={property.id}
                    style={{
                      width: widths[property.id] ?? 200,
                      minWidth: widths[property.id] ?? 200,
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('application/fortnight-property');
                      const active = properties.find((p) => p.id === id);
                      if (active)
                        void reorderProperty(
                          active,
                          properties.findIndex((p) => p.id === property.id),
                        ).catch(() => {});
                    }}
                  >
                    <span
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/fortnight-property', property.id)
                      }
                      className="property-drag"
                      aria-label={'Drag property ' + property.name}
                    >
                      ⠿
                    </span>
                    <PropertyMenu
                      property={property}
                      onSave={(name, options) =>
                        action(
                          () =>
                            databaseApi.updateProperty(property.id, {
                              name,
                              ...(options ? { config: { options } } : {}),
                            }),
                          'Property saved',
                        )
                      }
                      onDelete={() =>
                        void action(async () => {
                          const result = await databaseApi.deleteProperty(property.id);
                          workspace.notify('Property deleted', async () => {
                            await import('../api/workspace').then((m) =>
                              m.workspaceApi.undo(result.changesetId),
                            );
                            refresh();
                          });
                        }).catch(() => {})
                      }
                      onMove={(direction) =>
                        void reorderProperty(
                          property,
                          properties.findIndex((p) => p.id === property.id) + direction,
                        ).catch(() => {})
                      }
                    />
                    <span
                      className="column-resize"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        resize.current = {
                          id: property.id,
                          x: e.clientX,
                          width: widths[property.id] ?? 200,
                        };
                      }}
                      onPointerMove={(e) => {
                        if (resize.current?.id === property.id)
                          setWidths({
                            ...widthRef.current,
                            [property.id]: Math.max(
                              80,
                              Math.min(1000, resize.current.width + e.clientX - resize.current.x),
                            ),
                          });
                      }}
                      onPointerUp={() => {
                        resize.current = null;
                        void saveView({ ...view.config, propertyWidths: widthRef.current });
                      }}
                    />
                  </th>
                ))}
                <th className="row-actions-column" />
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <tr key={row.id}>
                  {visible.map((property) => (
                    <td key={property.id}>
                      <div className="table-cell">
                        {property.type === 'title' && (
                          <button
                            className="open-row"
                            aria-label={'Open ' + (row.title || 'Untitled')}
                            onClick={() => workspace.openRow(row.id)}
                          >
                            <ArrowUpRight size={13} />
                          </button>
                        )}
                        <PropertyCell
                          row={row}
                          property={property}
                          zone={zone}
                          save={(patch) => saveRow(row, patch)}
                        />
                      </div>
                    </td>
                  ))}
                  <td>
                    <button
                      className="icon-button"
                      aria-label={'Archive ' + (row.title || 'Untitled')}
                      onClick={() =>
                        void action(() => databaseApi.archiveRow(row.id), 'Item archived').catch(
                          () => {},
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!allRows.length && (
            <div className="db-empty">
              <p>No items match this view.</p>
              <button className="db-button" onClick={() => void addRow()}>
                Create an item
              </button>
            </div>
          )}
        </div>
      ) : view.type === 'board' ? (
        group ? (
          <div className="board-view">
            {columns.map((column) => (
              <section
                key={column.id}
                className="board-column"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const row = allRows.find(
                    (r) => r.id === e.dataTransfer.getData('application/fortnight-row'),
                  );
                  if (row)
                    void saveRow(row, { properties: { [group.id]: column.id || null } }).catch(
                      () => {},
                    );
                }}
              >
                <h3>
                  {column.name}
                  <span>
                    {allRows.filter((r) => (r.properties[group.id] ?? '') === column.id).length}
                  </span>
                </h3>
                {allRows.filter((r) => (r.properties[group.id] ?? '') === column.id).map(card)}
                <button
                  className="db-button"
                  onClick={() =>
                    void action(async () => {
                      const row = await databaseApi.createRow(databaseId, {
                        title: 'Untitled',
                        properties: { [group.id]: column.id || null },
                      });
                      workspace.openRow(row.id);
                    })
                  }
                >
                  + New item
                </button>
              </section>
            ))}
          </div>
        ) : (
          <div className="db-empty">
            <h2>Give your board a little structure.</h2>
            <p>Add a Select property to group cards into columns.</p>
          </div>
        )
      ) : view.type === 'gallery' ? (
        <div className="gallery-view">{allRows.map(card)}</div>
      ) : (
        <div className="list-view">{allRows.map(card)}</div>
      )}
      {view.type !== 'calendar' && rows.hasNextPage && (
        <button
          className="db-button"
          onClick={() => void rows.fetchNextPage()}
          disabled={rows.isFetchingNextPage}
        >
          Load more items
        </button>
      )}
    </section>
  );
}
