import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SmallScreenNotice from './SmallScreenNotice';

describe('SmallScreenNotice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows only below the shell breakpoint', () => {
    render(<SmallScreenNotice storageKey="inventory" />);
    expect(screen.getByRole('alert').className).toContain('md:hidden');
  });

  it('hides itself when dismissed', async () => {
    render(<SmallScreenNotice storageKey="inventory" />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss notice/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays dismissed on a remount', async () => {
    const { unmount } = render(<SmallScreenNotice storageKey="inventory" />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss notice/i }));
    unmount();

    render(<SmallScreenNotice storageKey="inventory" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps each screen dismissal separate', async () => {
    const { unmount } = render(<SmallScreenNotice storageKey="inventory" />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss notice/i }));
    unmount();

    render(<SmallScreenNotice storageKey="production" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('still renders when storage is unreadable', () => {
    // Private mode and blocked site data both throw here. A notice is not
    // worth breaking a screen over.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(<SmallScreenNotice storageKey="inventory" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('gives the dismiss control a 44px touch target', () => {
    render(<SmallScreenNotice storageKey="inventory" />);
    expect(screen.getByRole('button', { name: /dismiss notice/i }).className).toContain(
      'size-11'
    );
  });
});
