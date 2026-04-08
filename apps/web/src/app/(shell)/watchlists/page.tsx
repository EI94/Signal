import { PageHeader } from '@signal/ui';
import { WatchlistManager } from '../../../components/watchlists/watchlist-manager';

export default function WatchlistsPage() {
  return (
    <>
      <PageHeader title="Watchlists" subtitle="Your personal entity watchlists" />
      <WatchlistManager />
    </>
  );
}
