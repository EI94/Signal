import type { BadgeVariant } from '@signal/ui';

export const SIGNAL_TYPE_LABEL: Record<string, string> = {
  project_award: 'Project Award',
  partnership_mou: 'Partnership',
  earnings_reporting_update: 'Earnings',
  ma_divestment: 'M&A',
  technology_milestone: 'Technology',
};

export const SIGNAL_TYPE_BADGE: Record<string, BadgeVariant> = {
  project_award: 'accent',
  partnership_mou: 'info',
  earnings_reporting_update: 'warning',
  ma_divestment: 'danger',
  technology_milestone: 'success',
};

export const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'detected_at_desc', label: 'Latest detected' },
  { value: 'score_desc', label: 'Highest score' },
  { value: 'occurred_at_desc', label: 'Latest occurred' },
];

const MAX_VISIBLE_ENTITY_REFS = 3;

export function cappedEntityRefs<T>(refs: T[] | null | undefined): {
  visible: T[];
  overflow: number;
} {
  if (!refs || refs.length === 0) return { visible: [], overflow: 0 };
  if (refs.length <= MAX_VISIBLE_ENTITY_REFS) return { visible: refs, overflow: 0 };
  return {
    visible: refs.slice(0, MAX_VISIBLE_ENTITY_REFS),
    overflow: refs.length - MAX_VISIBLE_ENTITY_REFS,
  };
}

export function humanizeTimelineLabel(label: string): string {
  return SIGNAL_TYPE_LABEL[label] ?? label.replace(/_/g, ' ');
}

export function formatCompactDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hours = Math.floor((now.getTime() - d.getTime()) / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatRelativeTime(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ago`;
}
