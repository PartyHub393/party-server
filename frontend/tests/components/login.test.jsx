import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Login from '../../src/login/Login';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Mock the dependencies
vi.mock('../../src/contexts/AuthContext');
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

describe('Login Component', () => {
    let mockNavigateFn;
    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigateFn = vi.fn();
        vi.mocked(useNavigate).mockReturnValue(mockNavigateFn);
    });

    it('Redirects authenticated users to /join-group', () => {
        vi.mocked(useAuth).mockReturnValue({
            user: { id: 1, name: 'Test User' },
            isAuthenticated: true,
            authLoaded: true,
        });
        render(<Login />);
        expect(mockNavigateFn).toHaveBeenCalledWith('/join-group', { replace: true });
    });

    it('Renders login form for unauthenticated users', () => {
        vi.mocked(useAuth).mockReturnValue({
            user: null,
            isAuthenticated: false,
            authLoaded: true,
        });
        const { getByText, getByPlaceholderText, getByRole } = render(<Login />);

        expect(getByText('DiscoverCase')).toBeTruthy();
        expect(getByPlaceholderText('Enter username')).toBeTruthy();
        expect(getByPlaceholderText('••••••••')).toBeTruthy();
        expect(getByRole('button', { name: 'Sign In' })).toBeTruthy();
        expect(mockNavigateFn).not.toHaveBeenCalled();
    });

    it('Stays on page after unauthenticated login', () => {
        vi.mocked(useAuth).mockReturnValue({
            user: null,
            isAuthenticated: false,
            authLoaded: true,
        });
        render(<Login />);
        expect(mockNavigateFn).not.toHaveBeenCalled();
    });

    it('Disables login form while auth is loading', () => {
        vi.mocked(useAuth).mockReturnValue({
            user: null,
            isAuthenticated: false,
            authLoaded: false,
        });
        const { getByPlaceholderText, getByRole } = render(<Login />);
        expect(getByPlaceholderText('Enter username').disabled).toBe(true);
        expect(getByPlaceholderText('••••••••').disabled).toBe(true);
        expect(getByRole('button', { name: 'Sign In' }).disabled).toBe(true);
    });
});