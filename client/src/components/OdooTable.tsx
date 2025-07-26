import React, { useRef, useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ColumnConfig {
  key: string;
  title: string;
  minWidth?: number;
  maxWidth?: number;
  weight?: number; // Higher weight = more space priority
  align?: 'left' | 'center' | 'right';
  fixed?: boolean; // Fixed width columns don't resize
}

interface AdaptiveTableProps {
  columns: ColumnConfig[];
  data: any[];
  renderCell: (item: any, column: ColumnConfig, index: number) => React.ReactNode;
  className?: string;
  onRowClick?: (item: any, index: number) => void;
  emptyState?: React.ReactNode;
  maxHeight?: string;
}

interface OdooTableProps {
  children: React.ReactNode;
  className?: string;
  adaptive?: boolean;
}

export function AdaptiveTable({ 
  columns, 
  data, 
  renderCell, 
  className = "", 
  onRowClick,
  emptyState,
  maxHeight = "calc(100vh - 300px)"
}: AdaptiveTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<string[]>([]);

  useEffect(() => {
    const calculateColumnWidths = () => {
      if (!tableRef.current) return;

      const containerWidth = tableRef.current.offsetWidth;
      const totalWeight = columns.reduce((sum, col) => sum + (col.weight || 1), 0);
      const fixedColumnsWidth = columns
        .filter(col => col.fixed)
        .reduce((sum, col) => sum + (col.minWidth || 100), 0);
      
      const availableWidth = containerWidth - fixedColumnsWidth - (columns.length * 16); // 16px for gaps/padding
      
      const widths = columns.map(column => {
        if (column.fixed) {
          return `${column.minWidth || 100}px`;
        }
        
        const weight = column.weight || 1;
        const baseWidth = (availableWidth * weight) / totalWeight;
        const minWidth = column.minWidth || 80;
        const maxWidth = column.maxWidth || Infinity;
        
        const finalWidth = Math.max(minWidth, Math.min(maxWidth, baseWidth));
        return `${Math.floor(finalWidth)}px`;
      });

      setColumnWidths(widths);
    };

    calculateColumnWidths();
    
    const resizeObserver = new ResizeObserver(calculateColumnWidths);
    if (tableRef.current) {
      resizeObserver.observe(tableRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [columns, data]);

  const getAlignmentClass = (align?: string) => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  if (data.length === 0 && emptyState) {
    return (
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <div className="bg-white p-8">
          {emptyState}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={tableRef}
      className="rounded-md border border-gray-200 overflow-hidden"
      style={{ maxHeight }}
    >
      <div className="overflow-auto">
        <Table className={`bg-white ${className}`}>
          <TableHeader className="bg-gray-50 sticky top-0 z-10">
            <TableRow>
              {columns.map((column, index) => (
                <TableHead 
                  key={column.key}
                  className={`text-xs font-medium text-gray-700 bg-gray-50 whitespace-nowrap ${getAlignmentClass(column.align)}`}
                  style={{ 
                    width: columnWidths[index] || 'auto',
                    minWidth: column.minWidth || 80,
                    maxWidth: column.maxWidth
                  }}
                >
                  {column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, rowIndex) => (
              <TableRow 
                key={rowIndex}
                className={`hover:bg-gray-50 border-gray-200 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item, rowIndex)}
              >
                {columns.map((column, colIndex) => (
                  <TableCell 
                    key={column.key}
                    className={`text-sm text-gray-900 ${getAlignmentClass(column.align)}`}
                    style={{ 
                      width: columnWidths[colIndex] || 'auto',
                      minWidth: column.minWidth || 80,
                      maxWidth: column.maxWidth
                    }}
                  >
                    <div className="truncate" title={typeof renderCell(item, column, rowIndex) === 'string' ? renderCell(item, column, rowIndex) as string : undefined}>
                      {renderCell(item, column, rowIndex)}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function OdooTable({ children, className = "", adaptive = false }: OdooTableProps) {
  if (adaptive) {
    // For adaptive tables, this component acts as a wrapper
    return (
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <Table className={`bg-white ${className}`}>
          {children}
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <Table className={`bg-white ${className}`}>
        {children}
      </Table>
    </div>
  );
}

export function OdooTableHeader({ children }: { children: React.ReactNode }) {
  return (
    <TableHeader className="bg-gray-50">
      {children}
    </TableHeader>
  );
}

export function OdooTableRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <TableRow className={`hover:bg-gray-50 border-gray-200 ${className}`}>
      {children}
    </TableRow>
  );
}

export function OdooTableCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <TableCell className={`text-sm text-gray-900 ${className}`}>
      {children}
    </TableCell>
  );
}

export function OdooTableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={`text-xs font-medium text-gray-700 bg-gray-50 ${className}`}>
      {children}
    </TableHead>
  );
}

export { TableBody };