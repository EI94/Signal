import { describe, expect, it } from 'vitest';
import { buildEntityDashboardRoute, buildSignalsDashboardRoute } from './dashboard-routes';

describe('dashboard-routes', () => {
  it('buildSignalsDashboardRoute encodes filters', () => {
    expect(buildSignalsDashboardRoute({ signalType: 'project_award', minScore: 10 })).toBe(
      '/signals?signalType=project_award&minScore=10',
    );
  });

  it('buildSignalsDashboardRoute returns bare path when no filters', () => {
    expect(buildSignalsDashboardRoute({})).toBe('/signals');
  });

  it('buildEntityDashboardRoute encodes path segments', () => {
    expect(buildEntityDashboardRoute('client', 'acme/corp')).toBe('/entities/client/acme%2Fcorp');
  });
});
