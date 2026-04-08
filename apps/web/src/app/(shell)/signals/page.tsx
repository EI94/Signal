import { PageHeader } from '@signal/ui';
import { Suspense } from 'react';
import { FeedSkeleton, SignalFeed } from '../../../components/signals/signal-feed';
import { parseSignalsFeedSearchParamsFromRecord } from '../../../lib/signals-url-state';

type SignalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `await searchParams` opts the route into dynamic rendering so deep links with query work. */
export default async function SignalsPage({ searchParams }: SignalsPageProps) {
  void parseSignalsFeedSearchParamsFromRecord(await searchParams);

  return (
    <>
      <PageHeader title="Signals" subtitle="Live intelligence stream" />
      <Suspense fallback={<FeedSkeleton />}>
        <SignalFeed />
      </Suspense>
    </>
  );
}
