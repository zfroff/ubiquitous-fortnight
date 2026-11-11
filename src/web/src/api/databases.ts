import {
  GetWorkspaceResponse,
  CreateDatabaseRequest,
  CreateDatabaseResponse,
  ListDatabasesResponse,
  GetDatabaseResponse,
  UpdateDatabaseResponse,
  CreatePropertyRequest,
  CreatePropertyResponse,
  UpdatePropertyRequest,
  UpdatePropertyResponse,
  DeletePropertyResponse,
  QueryDatabaseRequest,
  QueryDatabaseResponse,
  CreateRowRequest,
  CreateRowResponse,
  GetRowResponse,
  UpdateRowRequest,
  UpdateRowResponse,
  ArchiveRowResponse,
  CreateViewRequest,
  CreateViewResponse,
  UpdateViewRequest,
  UpdateViewResponse,
  DeleteViewResponse,
  CalendarEventsResponse,
} from '@fortnight/shared';
import { request } from './client';
const id = encodeURIComponent;
export const databaseApi = {
  workspace: () => request('/workspace', GetWorkspaceResponse),
  list: () => request('/databases', ListDatabasesResponse),
  get: (databaseId: string) => request('/databases/' + id(databaseId), GetDatabaseResponse),
  create: (body: CreateDatabaseRequest) =>
    request('/databases', CreateDatabaseResponse, {
      method: 'POST',
      body: JSON.stringify(CreateDatabaseRequest.parse(body)),
    }),
  rename: (databaseId: string, title: string) =>
    request('/databases/' + id(databaseId), UpdateDatabaseResponse, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  property: (databaseId: string, body: CreatePropertyRequest) =>
    request('/databases/' + id(databaseId) + '/properties', CreatePropertyResponse, {
      method: 'POST',
      body: JSON.stringify(CreatePropertyRequest.parse(body)),
    }),
  updateProperty: (propertyId: string, body: UpdatePropertyRequest) =>
    request('/properties/' + id(propertyId), UpdatePropertyResponse, {
      method: 'PATCH',
      body: JSON.stringify(UpdatePropertyRequest.parse(body)),
    }),
  deleteProperty: (propertyId: string) =>
    request('/properties/' + id(propertyId), DeletePropertyResponse, { method: 'DELETE' }),
  query: (databaseId: string, body: QueryDatabaseRequest) =>
    request('/databases/' + id(databaseId) + '/query', QueryDatabaseResponse, {
      method: 'POST',
      body: JSON.stringify(QueryDatabaseRequest.parse(body)),
    }),
  createRow: (databaseId: string, body: CreateRowRequest) =>
    request('/databases/' + id(databaseId) + '/rows', CreateRowResponse, {
      method: 'POST',
      body: JSON.stringify(CreateRowRequest.parse(body)),
    }),
  row: (rowId: string) => request('/rows/' + id(rowId), GetRowResponse),
  updateRow: (rowId: string, body: UpdateRowRequest) =>
    request('/rows/' + id(rowId), UpdateRowResponse, {
      method: 'PATCH',
      body: JSON.stringify(UpdateRowRequest.parse(body)),
    }),
  archiveRow: (rowId: string) =>
    request('/rows/' + id(rowId) + '/archive', ArchiveRowResponse, { method: 'POST' }),
  createView: (databaseId: string, body: CreateViewRequest) =>
    request('/databases/' + id(databaseId) + '/views', CreateViewResponse, {
      method: 'POST',
      body: JSON.stringify(CreateViewRequest.parse(body)),
    }),
  updateView: (viewId: string, body: UpdateViewRequest) =>
    request('/views/' + id(viewId), UpdateViewResponse, {
      method: 'PATCH',
      body: JSON.stringify(UpdateViewRequest.parse(body)),
    }),
  deleteView: (viewId: string) =>
    request('/views/' + id(viewId), DeleteViewResponse, { method: 'DELETE' }),
  events: (from: string, to: string, databaseIds: string[]) =>
    request(
      '/calendar/events?' + new URLSearchParams({ from, to, databaseIds: databaseIds.join(',') }),
      CalendarEventsResponse,
    ),
};
export type RowPatch = Omit<UpdateRowRequest, 'version'>;
const queues = new Map<string, Promise<unknown>>();
export async function patchRow(rowId: string, patch: RowPatch) {
  const before = queues.get(rowId) ?? Promise.resolve();
  const next = before
    .catch(() => {})
    .then(async () => {
      const { row } = await databaseApi.row(rowId);
      return databaseApi.updateRow(rowId, { version: row.version, ...patch });
    });
  queues.set(rowId, next);
  try {
    return await next;
  } finally {
    if (queues.get(rowId) === next) queues.delete(rowId);
  }
}
