import { describe, expect, it } from 'vitest';
import { computeSignalStoryKey } from '../signal-story-key';

describe('computeSignalStoryKey', () => {
  it('is stable for the same logical inputs', () => {
    const a = computeSignalStoryKey({
      signalType: 'earnings_reporting_update',
      title: 'Earnings / reporting — Johnson Matthey',
      entityRefs: [
        { entityType: 'organization', entityId: 'jm', displayName: 'Johnson Matthey' },
      ],
      provenance: { sourceUrl: 'https://www.reuters.com/markets/deals/foo/' },
    });
    const b = computeSignalStoryKey({
      signalType: 'earnings_reporting_update',
      title: 'Earnings / reporting — Johnson Matthey',
      entityRefs: [
        { entityType: 'organization', entityId: 'jm', displayName: 'Johnson Matthey' },
      ],
      provenance: { sourceUrl: 'https://www.reuters.com/markets/deals/foo' },
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('changes when the canonical URL path changes', () => {
    const a = computeSignalStoryKey({
      signalType: 'earnings_reporting_update',
      title: 'Earnings / reporting — Johnson Matthey',
      entityRefs: [{ entityType: 'organization', entityId: 'jm', displayName: 'JM' }],
      provenance: { sourceUrl: 'https://news.com/a' },
    });
    const b = computeSignalStoryKey({
      signalType: 'earnings_reporting_update',
      title: 'Earnings / reporting — Johnson Matthey',
      entityRefs: [{ entityType: 'organization', entityId: 'jm', displayName: 'JM' }],
      provenance: { sourceUrl: 'https://news.com/b' },
    });
    expect(a).not.toBe(b);
  });
});
