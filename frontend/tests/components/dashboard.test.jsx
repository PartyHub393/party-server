import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Dashboard from '../../src/components/Dashboard/dashboard';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSocket } from '../../src/useSocket';
import { useNavigate } from 'react-router-dom';

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

vi.mock('../../src/components/games/trivia/TriviaHostPanel', () => ({
  default: () => <div>TriviaHostPanel</div>,
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

  it('Allows authenticated host users to render', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '456', role: 'host' },
      isAuthenticated: true,
      authLoaded: true,
    });

    render(<Dashboard />);

    // Should NOT redirect for host users
    expect(mockNavigateFn).not.toHaveBeenCalled();
  });
});
