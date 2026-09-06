/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PermissionProvider, usePermissionContext } from '../permission-context';
import { Permission } from '../permission-definitions';

// Mock fetch
global.fetch = jest.fn();

const mockPermissions = {
  globalPermissions: [Permission.PROJECT_CREATE, Permission.TASK_CREATE],
  projectPermissions: {
    'project123': [Permission.PROJECT_UPDATE, Permission.TASK_UPDATE],
    'project456': [Permission.PROJECT_READ, Permission.TASK_READ]
  },
  projectRoles: {
    'project123': 'project_manager',
    'project456': 'project_member'
  },
  userRole: 'admin',
  accessibleProjects: ['project123', 'project456']
};

// Test component that uses the context
function TestComponent() {
  const { hasPermission, canAccessProject, loading } = usePermissionContext();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div data-testid="can-create-project">
        {hasPermission(Permission.PROJECT_CREATE) ? 'Yes' : 'No'}
      </div>
      <div data-testid="can-update-project-123">
        {hasPermission(Permission.PROJECT_UPDATE, 'project123') ? 'Yes' : 'No'}
      </div>
      <div data-testid="can-access-project-123">
        {canAccessProject('project123') ? 'Yes' : 'No'}
      </div>
      <div data-testid="can-access-project-999">
        {canAccessProject('project999') ? 'Yes' : 'No'}
      </div>
    </div>
  );
}

describe('PermissionContext', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('should load permissions and provide them to components', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPermissions,
    });

    render(
      <PermissionProvider>
        <TestComponent />
      </PermissionProvider>
    );

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for permissions to load
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Check permission results
    expect(screen.getByTestId('can-create-project')).toHaveTextContent('Yes');
    expect(screen.getByTestId('can-update-project-123')).toHaveTextContent('Yes');
    expect(screen.getByTestId('can-access-project-123')).toHaveTextContent('Yes');
    expect(screen.getByTestId('can-access-project-999')).toHaveTextContent('No');
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    render(
      <PermissionProvider>
        <TestComponent />
      </PermissionProvider>
    );

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for error to be handled
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Should show no permissions (all No)
    expect(screen.getByTestId('can-create-project')).toHaveTextContent('No');
    expect(screen.getByTestId('can-update-project-123')).toHaveTextContent('No');
    expect(screen.getByTestId('can-access-project-123')).toHaveTextContent('No');
    expect(screen.getByTestId('can-access-project-999')).toHaveTextContent('No');
  });

  it('should only make one API call on mount', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPermissions,
    });

    render(
      <PermissionProvider>
        <TestComponent />
        <TestComponent />
        <TestComponent />
      </PermissionProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Should only make one API call despite multiple components
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
