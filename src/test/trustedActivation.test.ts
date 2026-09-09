import { describe, expect, it, vi } from 'vitest';
import { activateOnceTrusted } from '../core/trustedActivation';

function host(initial = false) {
  let queued: (() => void) | undefined;
  const dispose = vi.fn();
  return {
    isTrusted: initial,
    onDidGrantWorkspaceTrust: vi.fn((listener: () => void) => {
      queued = listener;
      return { dispose };
    }),
    // Deliver even a stale/duplicated callback, as an adversarial scheduler.
    deliver: () => queued?.(),
    dispose,
  };
}

describe('one workspace-trust activation boundary', () => {
  it('does not initialize anything in Restricted Mode', () => {
    const trust = host();
    const initialize = vi.fn();
    activateOnceTrusted(trust, initialize);
    trust.deliver();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('activates an already trusted workspace exactly once', () => {
    const trust = host(true);
    const initialize = vi.fn();
    activateOnceTrusted(trust, initialize);
    trust.deliver();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(trust.dispose).toHaveBeenCalled();
  });

  it('waits for the actual trust value and survives duplicate grant events', () => {
    const trust = host();
    const initialize = vi.fn();
    activateOnceTrusted(trust, initialize);
    trust.deliver();
    trust.isTrusted = true;
    trust.deliver();
    trust.deliver();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('cannot reactivate after disposal, including an already queued grant', () => {
    const trust = host();
    const initialize = vi.fn();
    const gate = activateOnceTrusted(trust, initialize);
    gate.dispose();
    trust.isTrusted = true;
    trust.deliver();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('handles a grant delivered synchronously while subscribing', () => {
    const dispose = vi.fn();
    const initialize = vi.fn();
    activateOnceTrusted({
      isTrusted: true,
      onDidGrantWorkspaceTrust: (listener) => { listener(); return { dispose }; },
    }, initialize);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalled();
  });

  it('never retries a partially failed initialization on another grant', () => {
    const trust = host();
    const initialize = vi.fn(() => { throw new Error('initialization failed'); });
    activateOnceTrusted(trust, initialize);
    trust.isTrusted = true;
    expect(() => trust.deliver()).toThrow('initialization failed');
    trust.deliver();
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
