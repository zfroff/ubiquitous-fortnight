import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { databaseApi, patchRow } from '../api/databases';
import { workspaceApi } from '../api/workspace';
import { DocumentEditor } from '../editor/PageEditor';
import { activeSession, type SaveApi } from '../editor/session';
import { PropertyCell } from './Cells';
import { useWorkspace } from '../workspace/WorkspaceProvider';
const rowTransport: SaveApi = {
  ops: async (id, ops) => {
    const result = await workspaceApi.rowOps(id, ops);
    return { ...result, page: result.row };
  },
  update: (id, body) => databaseApi.updateRow(id, body),
};
export function RowDialog() {
  const state = useWorkspace();
  return state.selectedRow ? <RowBody key={state.selectedRow} id={state.selectedRow} /> : null;
}
function RowBody({ id }: { id: string }) {
  const state = useWorkspace(),
    client = useQueryClient();
  const row = useQuery({ queryKey: ['row', id], queryFn: () => databaseApi.row(id) });
  const database = useQuery({
    queryKey: ['database', row.data?.row.databaseId],
    queryFn: () => databaseApi.get(row.data!.row.databaseId),
    enabled: !!row.data,
  });
  const workspace = useQuery({ queryKey: ['workspace'], queryFn: databaseApi.workspace });
  const data = useMemo(
    () => (row.data ? { page: row.data.row, blocks: row.data.blocks } : null),
    [row.data],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void state.closeRow();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state]);
  return (
    <div
      className="row-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) void state.closeRow();
      }}
    >
      <section className="row-dialog" role="dialog" aria-modal="true" aria-label="Database item">
        <header>
          <span>{database.data?.database.title ?? 'Database item'}</span>
          <button
            className="icon-button"
            aria-label="Close item"
            onClick={() => void state.closeRow()}
          >
            <X size={18} />
          </button>
        </header>
        {row.isPending ? (
          <p className="db-empty" role="status">
            Opening item…
          </p>
        ) : row.isError || !data ? (
          <div className="db-empty">
            <p>This item could not be opened.</p>
            <button className="db-button" onClick={() => void row.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="row-properties">
              {database.data?.properties
                .filter((p) => p.type !== 'title')
                .map((property) => (
                  <div key={property.id}>
                    <span>{property.name}</span>
                    <PropertyCell
                      row={row.data.row}
                      property={property}
                      zone={workspace.data?.settings.timeZone ?? 'UTC'}
                      save={async (patch) => {
                        await activeSession(id)?.flush();
                        await patchRow(id, patch);
                        void client.invalidateQueries({ queryKey: ['row', id] });
                        void client.invalidateQueries({ queryKey: ['rows'] });
                      }}
                    />
                  </div>
                ))}
            </div>
            <DocumentEditor
              data={data}
              transport={rowTransport}
              reload={async () => {
                const next = await databaseApi.row(id);
                return { page: next.row, blocks: next.blocks };
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
