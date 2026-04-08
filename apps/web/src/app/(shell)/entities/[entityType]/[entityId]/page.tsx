import { EntityDetail } from '../../../../../components/entities/entity-detail';

export default async function EntityPage({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>;
}) {
  const { entityType, entityId } = await params;
  const decodedType = decodeURIComponent(entityType);
  const decodedId = decodeURIComponent(entityId);

  return <EntityDetail entityType={decodedType} entityId={decodedId} />;
}
