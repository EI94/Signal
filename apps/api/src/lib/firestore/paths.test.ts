import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_COLLECTIONS,
  sourceDocumentPath,
  sourcesCollectionPath,
  workspaceDocumentPath,
  workspaceMemberDocumentPath,
  workspaceSignalsLatestDocumentPath,
} from './paths';

describe('FIRESTORE_COLLECTIONS', () => {
  it('uses consistent camelCase segment names', () => {
    expect(FIRESTORE_COLLECTIONS.signalsLatest).toBe('signalsLatest');
    expect(FIRESTORE_COLLECTIONS.savedViews).toBe('savedViews');
    expect(FIRESTORE_COLLECTIONS.sources).toBe('sources');
  });
});

describe('source registry paths', () => {
  it('builds stable path strings for logs', () => {
    expect(sourcesCollectionPath()).toBe('sources');
    expect(sourceDocumentPath('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(
      'sources/3fa85f64-5717-4562-b3fc-2c963f66afa6',
    );
  });
});

describe('workspace paths', () => {
  it('builds stable path strings for logs', () => {
    expect(workspaceDocumentPath('ws1')).toBe('workspaces/ws1');
    expect(workspaceMemberDocumentPath('ws1', 'uid1')).toBe('workspaces/ws1/members/uid1');
    expect(workspaceSignalsLatestDocumentPath('ws1', 'sig1')).toBe(
      'workspaces/ws1/signalsLatest/sig1',
    );
  });
});
