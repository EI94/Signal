import { PageHeader } from '@signal/ui';
import { SettingsPanel } from '../../../components/settings/settings-panel';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Account, preferences and personalization" />
      <SettingsPanel />
    </>
  );
}
