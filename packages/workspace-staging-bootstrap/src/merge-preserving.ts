/**
 * Pure helpers for idempotent Firestore upserts (workspace root uses createdAt; member uses joinedAt).
 */

export function preserveWorkspaceRootTimestamps(
  previousCreatedAt: Date | undefined,
  candidate: { createdAt: Date; updatedAt: Date },
): { createdAt: Date; updatedAt: Date } {
  return {
    createdAt: previousCreatedAt ?? candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export function preserveMemberJoinedTimestamps(
  previousJoinedAt: Date | undefined,
  candidate: { joinedAt: Date; updatedAt: Date },
): { joinedAt: Date; updatedAt: Date } {
  return {
    joinedAt: previousJoinedAt ?? candidate.joinedAt,
    updatedAt: candidate.updatedAt,
  };
}
