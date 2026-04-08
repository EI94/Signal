import { PageHeader } from '@signal/ui';
import { SignalMap } from '../../../components/map/signal-map';

export default function MapPage() {
  return (
    <>
      <PageHeader title="Map" subtitle="Geographic context from the latest signal window" />
      <SignalMap />
    </>
  );
}
