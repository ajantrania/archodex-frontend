import React, { useCallback, useContext } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import { nodeIdFromResourceId, typeIdFromResourceId, TZ_OFFSET } from './lib/utils';
import { Checkbox } from './components/ui/checkbox';
import { Button } from './components/ui/button';
import { ArrowUpDown } from 'lucide-react';
import ResourceIcons from './components/ResourceIcons';
import ResourceLink from './components/ResourceLink';
import QueryDataDispatchContext from './contexts/QueryDataDispatchContext';
import { QueryDataActions } from './hooks/useQueryData';
import posthog from 'posthog-js';

export interface ResourcesTableProps {
  resources: Resource[];
  selectedResources: Set<string>;
}

const ResourcesTable: React.FC<ResourcesTableProps> = ({ resources, selectedResources }) => {
  const queryDataDispatch = useContext(QueryDataDispatchContext);

  const rowSelection = Array.from(selectedResources).reduce<RowSelectionState>((rowSelection, resourceId) => {
    rowSelection[resourceId] = true;
    return rowSelection;
  }, {});

  const table = useReactTable({
    data: resources,
    columns: [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(!!value);
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(!!value);
            }}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'id',
        accessorKey: 'id',
        header: ({ column }) => (
          <Button
            className="p-0"
            variant="ghost"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === 'asc');
            }}
          >
            Resource ID
            <ArrowUpDown />
          </Button>
        ),
        sortingFn: (rowA, rowB) =>
          nodeIdFromResourceId(rowA.original.id).localeCompare(nodeIdFromResourceId(rowB.original.id)),
        cell: ({ getValue }) => (
          <div className="h-full flex items-center gap-1">
            <ResourceIcons id={getValue<ResourceId>()} heightInPixels={32} />
            <div className="flex items-center">
              <ResourceLink id={getValue<ResourceId>()} />
            </div>
          </div>
        ),
      },
      {
        id: 'type',
        accessorKey: 'id',
        header: ({ column }) => (
          <Button
            className="p-0"
            variant="ghost"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === 'asc');
            }}
          >
            Resource Type
            <ArrowUpDown />
          </Button>
        ),
        sortingFn: (rowA, rowB) => getType(rowA.original.id).localeCompare(getType(rowB.original.id)),
        cell: ({ getValue }) => <span className="text-table-muted">{getType(getValue<ResourceId>())}</span>,
      },
      {
        accessorKey: 'first_seen_at',
        header: `First Seen (${TZ_OFFSET})`,
        sortingFn: 'datetime',
        cell: ({ getValue }) => (
          <span className="text-table-muted text-nowrap">{new Date(getValue<string>()).toLocaleString()}</span>
        ),
      },
      {
        accessorKey: 'last_seen_at',
        header: `Last Seen (${TZ_OFFSET})`,
        sortingFn: 'datetime',
        cell: ({ getValue }) => (
          <span className="text-table-muted text-nowrap">{new Date(getValue<string>()).toLocaleString()}</span>
        ),
      },
    ],
    initialState: { sorting: [{ id: 'id', desc: false }] },
    state: { rowSelection },
    enableMultiRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => nodeIdFromResourceId(row.id),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: (updater) => {
      const newRowSelectionValue = updater instanceof Function ? updater(rowSelection) : updater;

      const newSelectedResources = Object.entries(newRowSelectionValue)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_id, isSelected]) => isSelected)
        .map(([id]) => id);

      for (const resourceId of newSelectedResources) {
        if (!selectedResources.has(resourceId)) {
          const resource = resources.find((r) => nodeIdFromResourceId(r.id) === resourceId);

          posthog.capture('resources_table_row_selected', {
            resource_type: resource ? typeIdFromResourceId(resource.id) : undefined,
          });

          queryDataDispatch({ action: QueryDataActions.SelectResource, resourceId: resourceId });
        }
      }

      for (const resourceId of selectedResources) {
        if (!newRowSelectionValue[resourceId]) {
          const resource = resources.find((r) => nodeIdFromResourceId(r.id) === resourceId);

          posthog.capture('resources_table_row_deselected', {
            resource_type: resource ? typeIdFromResourceId(resource.id) : undefined,
          });

          queryDataDispatch({ action: QueryDataActions.DeselectResource, resourceId: resourceId });
        }
      }
    },
  });

  const scrollIntoView = useCallback((row: HTMLTableRowElement | null) => {
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  let firstSelectedRowSeen = false;

  return (
    <Table>
      <TableHeader className="sticky top-0 z-1 bg-background">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className={header.id === 'select' ? 'w-8' : ''}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getSortedRowModel().rows.map((row) => {
          let ref;
          if (row.getIsSelected() && !firstSelectedRowSeen) {
            ref = scrollIntoView;
            firstSelectedRowSeen = true;
          }

          return (
            <TableRow
              key={row.id}
              className="h-10"
              data-state={row.getIsSelected() ? 'selected' : undefined}
              onClick={() => {
                row.toggleSelected();
              }}
              ref={ref}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="h-0 py-0">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const getType = (id: ResourceId) => {
  const lastPart = id.at(-1);
  if (lastPart) {
    return lastPart.type;
  }

  return '';
};

export default ResourcesTable;
