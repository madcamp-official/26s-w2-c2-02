import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingPermission } from './OnboardingPermission';

describe('OnboardingPermission keyboard action', () => {
  it('checks the single permission action with Enter', async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) }
    });
    const onPermissionChange = vi.fn();
    const onReady = vi.fn();
    render(
      <OnboardingPermission
        permission="idle"
        onPermissionChange={onPermissionChange}
        onReady={onReady}
        onBack={vi.fn()}
        go={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: '권한 확인하고 입장' }), { key: 'Enter' });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onPermissionChange).toHaveBeenCalledWith('checking');
    expect(stop).toHaveBeenCalled();
  });
});
