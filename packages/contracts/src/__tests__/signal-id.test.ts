import { describe, expect, it } from 'vitest';
import { deriveSignalId } from '../signal-id';

describe('deriveSignalId', () => {
  it('is deterministic for the same inputs', () => {
    const a = deriveSignalId({ extractedEventId: 'a'.repeat(32), signalType: 'project_award' });
    const b = deriveSignalId({ extractedEventId: 'a'.repeat(32), signalType: 'project_award' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes when extractedEventId changes', () => {
    const a = deriveSignalId({ extractedEventId: 'a'.repeat(32), signalType: 'project_award' });
    const b = deriveSignalId({ extractedEventId: 'b'.repeat(32), signalType: 'project_award' });
    expect(a).not.toBe(b);
  });

  it('changes when signalType changes', () => {
    const a = deriveSignalId({ extractedEventId: 'c'.repeat(32), signalType: 'project_award' });
    const b = deriveSignalId({ extractedEventId: 'c'.repeat(32), signalType: 'ma_divestment' });
    expect(a).not.toBe(b);
  });
});
