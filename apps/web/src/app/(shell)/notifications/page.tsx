import { PageHeader } from '@signal/ui';
import { NotificationCenter } from '../../../components/notifications/notification-center';

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" subtitle="Workspace alerts and operational updates" />
      <NotificationCenter />
    </>
  );
}
