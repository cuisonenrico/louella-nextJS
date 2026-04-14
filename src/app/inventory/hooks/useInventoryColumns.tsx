'use client';

import { useMemo } from 'react';
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import type { Inventory, Product } from '@/types';

interface UseInventoryColumnsParams {
  filterBranch: string;
  isRange: boolean;
  productById: Map<number, Product>;
  openAdjustments: (row: Inventory) => void;
}

/** Returns the DataGrid column definitions for the inventory grids. */
export function useInventoryColumns({
  filterBranch,
  isRange,
  productById,
  openAdjustments,
}: UseInventoryColumnsParams): GridColDef[] {
  return useMemo<GridColDef[]>(
    () => [
      {
        field: 'productId',
        headerName: 'Product',
        flex: 1.5,
        minWidth: 80,
        valueGetter: (value: number) =>
          productById.get(value)?.name ?? `Product #${value}`,
      },
      ...(!isRange
        ? [
            {
              field: 'quantity',
              headerName: 'Prev. Leftover',
              type: 'number',
              width: 115,
              editable: false,
              headerAlign: 'center',
              align: 'center',
            } satisfies GridColDef,
          ]
        : []),
      {
        field: 'delivery',
        headerName: 'Delivery',
        type: 'number',
        width: 95,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      ...(filterBranch !== ''
        ? [
            {
              field: 'adjustments',
              headerName: 'Adjustments',
              width: 140,
              sortable: false,
              headerAlign: 'center',
              align: 'center',
              renderCell: (params: GridRenderCellParams) => {
                const row = params.row as Inventory;
                const adj = row.adjustments ?? [];
                const sum = adj.reduce((acc, a) => acc + a.value, 0);
                return (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {adj.length > 0 && (
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color={
                          sum > 0 ? 'success.main' : sum < 0 ? 'error.main' : 'text.secondary'
                        }
                      >
                        {sum > 0 ? `+${sum}` : sum}
                      </Typography>
                    )}
                    {!isRange && (
                      <Tooltip title="Manage adjustments">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAdjustments(row);
                          }}
                        >
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                );
              },
            } satisfies GridColDef,
          ]
        : []),
      ...(!isRange
        ? [
            {
              field: 'totalStock',
              headerName: 'Total Stock',
              type: 'number',
              width: 100,
              editable: false,
              headerAlign: 'center',
              align: 'center',
              valueGetter: (_value: unknown, row: Inventory) => {
                const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
                return row.quantity + row.delivery + adjSum;
              },
              renderCell: (params: GridRenderCellParams) => (
                <Typography variant="body2" fontWeight={600} color="primary">
                  {(params.value as number) ?? 0}
                </Typography>
              ),
            } satisfies GridColDef,
          ]
        : []),
      {
        field: 'leftover',
        headerName: 'Leftover',
        type: 'number',
        width: 95,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      {
        field: 'reject',
        headerName: 'Reject',
        type: 'number',
        width: 80,
        editable: true,
        headerAlign: 'center',
        align: 'center',
      },
      {
        field: 'sold',
        headerName: 'Sold',
        type: 'number',
        width: 80,
        headerAlign: 'center',
        align: 'center',
        valueGetter: (_value: unknown, row: Inventory) => {
          const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
          return row.quantity + row.delivery + adjSum - row.leftover;
        },
        renderCell: (params: GridRenderCellParams) => {
          const sold = (params.value as number) ?? 0;
          return (
            <Chip
              label={sold}
              size="small"
              color={sold > 0 ? 'success' : 'default'}
              sx={{ fontWeight: 600, minWidth: 40 }}
            />
          );
        },
      },
      {
        field: 'revenue',
        headerName: 'Revenue',
        type: 'number',
        width: 110,
        editable: false,
        headerAlign: 'right',
        align: 'right',
        valueGetter: (_value: unknown, row: Inventory) => {
          const adjSum = (row.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
          const sold = row.quantity + row.delivery + adjSum - row.leftover;
          const price = row.effectivePrice ?? productById.get(row.productId)?.price ?? 0;
          return sold * price;
        },
        renderCell: (params: GridRenderCellParams) => {
          const revenue = (params.value as number) ?? 0;
          return (
            <Typography
              variant="body2"
              fontWeight={600}
              color={revenue > 0 ? 'success.main' : 'text.secondary'}
            >
              ₱{revenue.toLocaleString()}
            </Typography>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterBranch, isRange, productById],
  );
}
