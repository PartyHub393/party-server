import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../../src/components/Dashboard/dashboard';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSocket } from '../../src/useSocket';
import { useNavigate } from 'react-router-dom';
import { getHostGroups, setGroupLock } from '../../src/api'

// Mock the dependencies
vi.mock('../../src/contexts/AuthContext');
vi.mock('../../src/useSocket');
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

// Mock child components
vi.mock('../../src/components/Navbar/Navbar', () => ({
  default: () => <div data-testid="navbar">Navbar</div>,
}));

vi.mock('../../src/components/games/scavenger/ScavengerHostPanel', () => ({
  default: () => <div>ScavengerHostPanel</div>,
}));

vi.mock('../../src/api', () => ({
  getHostGroups: vi.fn(),
  setGroupLock: vi.fn(),
}));

describe('Dashboard', () => {
  let mockNavigateFn;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockNavigateFn = vi.fn();
    
    // Setup default mocks
    vi.mocked(useSocket).mockReturnValue({
      socket: {
        emit: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
      },
      connected: true,
      setRoomCode: vi.fn(),
    });

    vi.mocked(useNavigate).mockReturnValue(mockNavigateFn);
    vi.mocked(getHostGroups).mockResolvedValue({ groups: [] });
  });

  it('Redirects unauthenticated users to /login', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      authLoaded: true,
    });

    render(<Dashboard />);

    expect(mockNavigateFn).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('Redirects non-host users to /waiting-room', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '123', role: 'player' },
      isAuthenticated: true,
      authLoaded: true,
    });

    render(<Dashboard />);

    expect(mockNavigateFn).toHaveBeenCalledWith('/waiting-room', { replace: true });
  });

  it('Allows authenticated host users to navigate to the dashboard', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '456', role: 'host' },
      isAuthenticated: true,
      authLoaded: true,
    });

    vi.mocked(getHostGroups).mockResolvedValue({
      groups: [{ code: 'ROOM456', is_locked: false }],
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(getHostGroups).toHaveBeenCalledWith('456');
    });

    // Should NOT redirect for host users
    expect(mockNavigateFn).not.toHaveBeenCalled();
  });

  it('Lobby locking', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'host-2', role: 'host' },
      isAuthenticated: true,
      authLoaded: true,
    });

    getHostGroups.mockResolvedValue({
      groups: [{ code: 'LOCKED1', is_locked: false }],
    });

    render(<Dashboard />);

    // Wait until the component has loaded the group
    await waitFor(() => {
      expect(getHostGroups).toHaveBeenCalledWith('host-2');
    });

    const checkbox = screen.getByRole('checkbox', { name: /lock lobby/i });
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(setGroupLock).toHaveBeenCalledWith({
        groupCode: 'LOCKED1',
        userId: 'host-2',
        isLocked: true,
      });
    });
  });

  it('Banned Users toggle', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'host-3', role: 'host' },
      isAuthenticated: true,
      authLoaded: true,
    });

    getHostGroups.mockResolvedValue({
      groups: [{ code: 'ROOMTAB', is_locked: false }],
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(getHostGroups).toHaveBeenCalledWith('host-3');
    });

    const usersTab = screen.getByRole('tab', { name: /users/i });
    const bannedTab = screen.getByRole('tab', { name: /banned/i });

    expect(usersTab.getAttribute('aria-selected')).toBe('true');
    expect(bannedTab.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(bannedTab);

    expect(bannedTab.getAttribute('aria-selected')).toBe('true');
    expect(usersTab.getAttribute('aria-selected')).toBe('false');
  });
});