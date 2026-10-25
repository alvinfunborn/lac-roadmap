import { RoadmapSettings } from '../types';

export type MapProvider = RoadmapSettings['mapApiProvider'];

/** The global None setting disables maps, including saved trip overrides. */
export function resolveMapProvider(
  settings?: Pick<RoadmapSettings, 'mapApiProvider'>,
  preferredProvider?: string,
): MapProvider {
  const globalProvider = settings?.mapApiProvider;
  if (globalProvider !== 'google' && globalProvider !== 'gaode') return 'none';
  if (preferredProvider === 'google' || preferredProvider === 'gaode') return preferredProvider;
  return globalProvider;
}
