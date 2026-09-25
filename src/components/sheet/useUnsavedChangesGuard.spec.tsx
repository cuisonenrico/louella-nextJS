import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardNavigation } from '@/lib/navigationGuard';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const { useUnsavedChangesGuard } = await import('./useUnsavedChangesGuard');

let confirm: (proceed: () => void, cancel?: () => void) => void = () => {};

function Sheet({ dirty }: { dirty: boolean }) {
  const { confirmDiscard, dialog } = useUnsavedChangesGuard(dirty);
  confirm = confirmDiscard;
  return (
    <>
      <a href="/production">Production</a>
      {dialog}
    </>
  );
}

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => push.mockReset());

  it('lets navigation through when there are no changes', () => {
    render(<Sheet dirty={false} />);
    const proceed = vi.fn();
    act(() => guardNavigation(proceed));
    expect(proceed).toHaveBeenCalledOnce();
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  });

  it('asks before an app navigation and proceeds on discard', () => {
    render(<Sheet dirty />);
    const proceed = vi.fn();
    act(() => guardNavigation(proceed));
    expect(proceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(proceed).toHaveBeenCalledOnce();
  });

  it('keeps the edits and runs cancel when the user keeps editing', () => {
    render(<Sheet dirty />);
    const proceed = vi.fn();
    const cancel = vi.fn();
    act(() => confirm(proceed, cancel));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(proceed).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not run cancel after discarding', () => {
    render(<Sheet dirty />);
    const proceed = vi.fn();
    const cancel = vi.fn();
    act(() => confirm(proceed, cancel));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(proceed).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('intercepts in-app link clicks', () => {
    render(<Sheet dirty />);
    fireEvent.click(screen.getByText('Production'));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(push).toHaveBeenCalledWith('/production');
  });

  it('releases the blocker once the changes are gone', () => {
    const { rerender } = render(<Sheet dirty />);
    rerender(<Sheet dirty={false} />);
    const proceed = vi.fn();
    act(() => guardNavigation(proceed));
    expect(proceed).toHaveBeenCalledOnce();
  });
});
