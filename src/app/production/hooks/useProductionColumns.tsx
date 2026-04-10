'use client';

import { useMemo } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import CalculateIcon from '@mui/icons-material/Calculate';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import type { Branch, Product } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';

interface BranchMutationState {
  isPending: boolean;
  variables: number | undefined;
  mutate: (branchId: number) => void;
}

interface UseProductionColumnsParams {
  branches: Branch[];
  productById: Map<number, Product>;
  branchesWithNoInventory: Set<number>;
  initBranchMutation: BranchMutationState;
  setConsumptionId: (id: number) => void;
}

/** Returns the DataGrid column definitions for the production grids. */
export function useProductionColumns({
  branches,
  productById,
  branchesWithNoInventory,
  initBranchMutation,
  setConsumptionId,
}: UseProductionColumnsParams): GridColDef[] {
  return useMemo<GridColDef[]>(
    () => [
      {
        field: 'productId',
        headerName: 'Product',
        width: 130,
        valueGetter: (value: number) => productById.get(value)?.name ?? `Product #${value}`,
      },
      {
        field: 'yield',
        headerName: 'Yield',
        type: 'number',
        width: 90,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const hasRecord = row._productionId != null;
          return (
            <Typography
              variant="body2"
              fontWeight={hasRecord ? 700 : 400}
              color={hasRecord ? 'primary' : 'text.disabled'}
            >
              {(params.value as number) ?? 0}
            </Typography>
          );
        },
      },
      ...branches.map(
        (b) =>
          ({
            field: `branch_${b.id}`,
            headerName: b.name,
            type: 'number',
            width: 110,
            editable: true,
            headerAlign: 'center',
            align: 'center',
            renderHeader: () => {
              const isMissing = branchesWithNoInventory.has(b.id);
              const isLoading =
                initBranchMutation.isPending && initBranchMutation.variables === b.id;
              return (
                <Box
                  display="flex"
                  alignItems="center"
                  gap={0.25}
                  sx={{ fontWeight: 700, overflow: 'hidden' }}
                >
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {b.name}
                  </span>
                  {isMissing && (
                    <Tooltip title={`Initialize ${b.name} inventory for this day`}>
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            initBranchMutation.mutate(b.id);
                          }}
                          disabled={isLoading}
                          sx={{ p: 0.25 }}
                        >
                          {isLoading ? (
                            <CircularProgress size={14} />
                          ) : (
                            <LibraryAddIcon fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              );
            },
            renderCell: (params: GridRenderCellParams) => {
              const row = params.row as ProdRow;
              const hasRecord = (row[`_inv_${b.id}`] as number | null) != null;
              return (
                <Typography
                  variant="body2"
                  fontWeight={hasRecord ? 600 : 400}
                  color={hasRecord ? 'text.primary' : 'text.disabled'}
                >
                  {hasRecord ? ((params.value as number) ?? 0) : '—'}
                </Typography>
              );
            },
          }) satisfies GridColDef,
      ),
      {
        field: 'unassigned',
        headerName: 'Unassigned',
        type: 'number',
        width: 100,
        editable: false,
        headerAlign: 'center',
        align: 'center',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const totalAssigned = branches.reduce(
            (sum, b) => sum + Number(row[`branch_${b.id}`] ?? 0),
            0,
          );
          const unassigned = Math.max(0, Number(row.yield) - totalAssigned);
          return (
            <Typography
              variant="body2"
              fontWeight={600}
              color={unassigned > 0 ? 'warning.main' : 'success.main'}
            >
              {unassigned}
            </Typography>
          );
        },
      } satisfies GridColDef,
      {
        field: 'expectedSales',
        headerName: 'Exp. Sales',
        type: 'number',
        width: 110,
        editable: false,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          const totalAssigned = branches.reduce(
            (sum, b) => sum + Number(row[`branch_${b.id}`] ?? 0),
            0,
          );
          const price = productById.get(row.productId)?.price ?? 0;
          const sales = totalAssigned * price;
          return (
            <Typography variant="body2" fontWeight={600} color="text.primary">
              ₱{sales.toLocaleString()}
            </Typography>
          );
        },
      } satisfies GridColDef,
      {
        field: 'materialCost',
        headerName: 'Mat. Cost',
        width: 100,
        editable: false,
        headerAlign: 'center',
        align: 'center',
        sortable: false,
        renderCell: (params: GridRenderCellParams) => {
          const row = params.row as ProdRow;
          if (row._productionId == null) return null;
          return (
            <Tooltip title="View material consumption">
              <IconButton
                size="small"
                color="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setConsumptionId(row._productionId as number);
                }}
              >
                <CalculateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        },
      } satisfies GridColDef,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      branches,
      productById,
      branchesWithNoInventory,
      initBranchMutation.isPending,
      initBranchMutation.variables,
    ],
  );
}
