import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import JoinGroup from '../../src/components/Dashboard/JoinGroup';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSocket } from '../../src/useSocket';
import { useNavigate, useLocation } from 'react-router-dom';
import { joinGroup, getHostGroups, getPlayerGroups } from '../../src/api';

vi.mock('../../src/contexts/AuthContext');
vi.mock('../../src/useSocket');
vi.mock('../../src/api', () => ({
  joinGroup: vi.fn(),
  getHostGroups: vi.fn(),
  getPlayerGroups: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
}));

describe('JoinGroup', () => {
  let mockNavigateFn;
  let mockSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockNavigateFn = vi.fn();
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    vi.mocked(useNavigate).mockReturnValue(mockNavigateFn);
    vi.mocked(useLocation).mockReturnValue({ state: null });

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', username: 'test', role: 'player' },
      isAuthenticated: true,
      authLoaded: true,
    });

    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket,
      connected: true,
    });

    vi.mocked(getHostGroups).mockResolvedValue({ groups: [] });
    vi.mocked(getPlayerGroups).mockResolvedValue({ groups: [] });
  });

  it('Redirects unauthenticated users to login', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      authLoaded: true,
    });

    render(<JoinGroup />);

    await waitFor(() => {
      expect(mockNavigateFn).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('Renders states message (kick, ban) when provided', async () => {
    vi.mocked(useLocation).mockReturnValue({
      state: { message: 'You were removed from the room.' },
    });

    const { getByText } = render(<JoinGroup />);

    await waitFor(() => {
      expect(getPlayerGroups).toHaveBeenCalled();
    });

    expect(getByText('You were removed from the room.')).toBeTruthy();
  });

  it('Shows validation error for blank group code', async () => {
    const { getByPlaceholderText, getByRole, getByText } = render(<JoinGroup />);

    fireEvent.change(getByPlaceholderText('Room Code Here'), {
      target: { value: '   ' },
    });

    fireEvent.click(getByRole('button', { name: 'Enter Lobby' }));

    await waitFor(() => {
      expect(getByText('Enter a valid group code.')).toBeTruthy();
    });

    expect(joinGroup).not.toHaveBeenCalled();
  });

  it('Joins as player and navigates to waiting room with uppercase code', async () => {
    const result = {
      group: { code: 'ABC123' },
      member: { id: 'u1', username: 'test' },
    };
    vi.mocked(joinGroup).mockResolvedValue(result);

    const { getByPlaceholderText, getByRole } = render(<JoinGroup />);

    fireEvent.change(getByPlaceholderText('Room Code Here'), {
      target: { value: 'abc123' },
    });

    fireEvent.click(getByRole('button', { name: 'Enter Lobby' }));

    await waitFor(() => {
      expect(joinGroup).toHaveBeenCalledWith({ groupCode: 'ABC123', userId: 'u1' });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
      roomCode: 'ABC123',
      username: 'test',
    });

    expect(mockNavigateFn).toHaveBeenCalledWith('/waiting-room', {
      replace: true,
      state: {
        groupCode: 'ABC123',
        group: result.group,
        member: result.member,
      },
    });
  });

  it('Navigates host users to dashboard after joining', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'host-1', username: 'host', role: 'host' },
      isAuthenticated: true,
      authLoaded: true,
    });

    vi.mocked(joinGroup).mockResolvedValue({
      group: { code: 'HOST01' },
      member: { id: 'host-1', username: 'host' },
    });

    const { getByPlaceholderText, getByRole } = render(<JoinGroup />);

    fireEvent.change(getByPlaceholderText('Room Code Here'), {
      target: { value: 'host01' },
    });

    fireEvent.click(getByRole('button', { name: 'Enter Lobby' }));

    await waitFor(() => {
      expect(mockNavigateFn).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('Does not emit join_room when socket is disconnected', async () => {
    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket,
      connected: false,
    });

    vi.mocked(joinGroup).mockResolvedValue({
      group: { code: 'ABCD12' },
      member: { id: 'u1', username: 'test' },
    });

    const { getByPlaceholderText, getByRole } = render(<JoinGroup />);

    fireEvent.change(getByPlaceholderText('Room Code Here'), {
      target: { value: 'abcd12' },
    });

    fireEvent.click(getByRole('button', { name: 'Enter Lobby' }));

    await waitFor(() => {
      expect(joinGroup).toHaveBeenCalled();
    });

    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_room', expect.anything());
  });
});
