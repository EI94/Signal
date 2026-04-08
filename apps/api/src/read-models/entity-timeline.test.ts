import { describe, expect, it } from 'vitest';

/**
 * Label policy for timeline rows: prefer Firestore title when present (integration tested at route level).
 */
describe('entity timeline label policy', () => {
  it('uses title when non-empty else signal_type', () => {
    const label = (title: string | undefined, signalType: string) =>
      title && title.trim() !== '' ? title : signalType;
    expect(label(undefined, 'project_award')).toBe('project_award');
    expect(label('Hello', 'project_award')).toBe('Hello');
  });
});
