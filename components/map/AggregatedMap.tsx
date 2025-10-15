import { useEffect, useRef, useState } from 'react';
import { App, TFile } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { MapProviderFactory } from './providers/MapProviderFactory';
import { IMapProvider } from './providers/IMapProvider';
import { MapLocation } from '../../types/map';

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: any;
}

export default function AggregatedMap({ app, repository, settings }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<IMapProvider | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [provider, setProvider] = useState<'none' | 'google' | 'gaode'>('none');

  useEffect(() => {
    const prov = (settings?.mapApiProvider || 'none') as 'none' | 'google' | 'gaode';
    const hasKey = prov === 'google' ? !!settings?.googleMapsApiKey : prov === 'gaode' ? !!settings?.gaodeWebServiceKey : false;
    setDisabled(prov === 'none' || !hasKey);
    setProvider(prov);
  }, [settings]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    (async () => {
      try {
        const provider = (settings?.mapApiProvider || 'none') as 'google' | 'gaode' | 'none';
        if (provider === 'none') return;
        const apiKey = provider === 'google' ? settings.googleMapsApiKey : settings.gaodeWebServiceKey;
        if (!apiKey) return;

        const ava: string[] = [];
        if (settings.gaodeWebServiceKey) ava.push('gaode');
        if (settings.googleMapsApiKey) ava.push('google');

        const inst = MapProviderFactory.createProvider(provider, apiKey, 'zh');
        providerRef.current = inst;

        // collect all places with coordinates
        const ids = await repository.loadRoadmapSet();
        const locations: { lng: number; lat: number; title: string }[] = [];
        for (const id of ids) {
          const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
          if (!dest || !(dest instanceof TFile)) continue;
          const data = await repository.loadRoadmap(dest.path);
          const items = data?.items || [];
          for (let i = 0; i < items.length; i++) {
            const it: any = items[i];
            if (it && 'name' in it) {
              const loc = (it.detail?.address as MapLocation | undefined);
              if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
                locations.push({ lng: loc.longitude, lat: loc.latitude, title: it.name || '' });
              }
            }
          }
        }

        if (cancelled) return;
        if (containerRef.current) {
          // initial center: first location
          const initial: MapLocation | undefined = locations.length > 0 ? { longitude: locations[0].lng, latitude: locations[0].lat, name: locations[0].title } : undefined;
          await inst.initMap(containerRef.current, initial, ava);
          // add markers & fit bounds via provider display helpers
          const results = locations.map(loc => ({ name: loc.title, address: '', location: { longitude: loc.lng, latitude: loc.lat, name: loc.title } })) as any[];
          inst.displaySearchMarkers(results as any, () => {});
        }
      } catch (_) {
      }
    })();
    return () => {
      cancelled = true;
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, [app, repository, settings, disabled]);

  // Google/高德世界底图更接近 2:1（宽:高），避免最远缩放出现上下留白
  const ratioClass = 'lac-aggmap-2x1';
  return (
    <div className={`lac-aggmap ${ratioClass}`}>
      <div ref={containerRef} className="lac-aggmap-canvas" />
      {disabled && (
        <div className="lf-map-loading"><div className="lf-map-loading-text">地图未启用或缺少 API Key</div></div>
      )}
    </div>
  );
}


