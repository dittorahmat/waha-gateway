import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from './data-table'; // Assuming named export, adjust if needed
import { type ColumnDef } from '@tanstack/react-table';

// TODO: Implement tests for DataTable component

// Define mock data and columns for testing
interface MockData {
  id: string;
  value: string;
}

const mockColumns: ColumnDef<MockData>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'value', header: 'Value' },
];

const mockData: MockData[] = [
  { id: '1', value: 'Test 1' },
  { id: '2', value: 'Test 2' },
];

describe('DataTable Component', () => {
  it('should render column headers and data rows correctly', () => {
    // Provide a default pageCount to satisfy the required prop
    render(<DataTable columns={mockColumns} data={mockData} pageCount={1} />);

    // Check for headers
    expect(screen.getByRole('columnheader', { name: /ID/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Value/i })).toBeInTheDocument();

    // Check for data cells within rows
    const rows = screen.getAllByRole('row');
    // rows[0] is the header row, rows[1] is the first data row, etc.
    expect(rows).toHaveLength(mockData.length + 1); // +1 for header row
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument(); // Check cell content by exact match if possible
    expect(screen.getByRole('cell', { name: 'Test 1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Test 2' })).toBeInTheDocument();
  });

  it('should render "No results." when data is empty', () => {
    render(<DataTable columns={mockColumns} data={[]} pageCount={0} />);

    // Check for the "No results" message
    // The message is inside a cell that spans all columns
    const cell = screen.getByRole('cell');
    expect(cell).toHaveAttribute('colSpan', `${mockColumns.length}`);
    expect(cell).toHaveTextContent('No results.');
  });


  // TODO: Add tests for pagination controls (if applicable)
  // Add tests for sorting functionality (if applicable)
  // Add tests for filtering functionality (if applicable)
  // Add tests for row selection (if applicable)
  // Add tests for empty data state
  // Add tests for loading state (if applicable)
});