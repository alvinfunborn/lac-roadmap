import React, { useEffect, useRef, useState } from 'react';
import { MapSelectorProps, MapLocation, MapSearchResult } from '../../types/map';
import { MapProviderFactory } from './providers/MapProviderFactory';
import { IMapProvider } from './providers/IMapProvider';

export default function MapSelector({ visible, initialLocation, onCancel, onConfirm, settings }: MapSelectorProps) {
  // 地图关闭条件：none 或缺少对应 key
  const provider = (settings?.mapApiProvider || 'none') as string;
  const hasKey = provider === 'google' ? !!settings?.googleMapsApiKey : provider === 'gaode' ? !!settings?.gaodeWebServiceKey : false;
  const disabled = provider === 'none' || !hasKey;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<IMapProvider | null>(null);
  const currentMarkerRef = useRef<any>(null);
  const searchMarkersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!visible || disabled) return;
    const init = async () => {
      const availableProviders: string[] = [];
      if (settings.gaodeWebServiceKey) availableProviders.push('gaode');
      if (settings.googleMapsApiKey) availableProviders.push('google');
      const currentProvider = (settings.defaultMapProvider || 'google') as 'gaode' | 'google';
      const apiKey = currentProvider === 'google' ? settings.googleMapsApiKey : settings.gaodeWebServiceKey;
      if (!apiKey) return;
      const provider = MapProviderFactory.createProvider(currentProvider, apiKey, 'zh');
      providerRef.current = provider;
      if (mapContainerRef.current) {
        await provider.initMap(mapContainerRef.current, initialLocation, availableProviders);
        provider.onMapClick(async (lng, lat) => {
          const location = await provider.getAddressByCoordinates(lng, lat);
          if (location) setSearchQuery(location.name || '');
          if (currentMarkerRef.current) provider.removeMarker(currentMarkerRef.current);
          currentMarkerRef.current = provider.addMarker(lng, lat, location?.name);
        });
        setMapLoaded(true);
      }
    };
    init();
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, [visible]);

  const handleSearch = async () => {
    if (!providerRef.current || !searchQuery.trim()) return;
    const results = await providerRef.current.searchPlaces(searchQuery.trim());
    setSearchResults(results);
    if (searchMarkersRef.current.length > 0) {
      providerRef.current.clearMarkers(searchMarkersRef.current);
      searchMarkersRef.current = [];
    }
    searchMarkersRef.current = providerRef.current.displaySearchMarkers(results, () => {});
  };

  const handleConfirm = async () => {
    if (!providerRef.current) return onCancel();
    if (searchResults[0]?.location) {
      const coordSystem = providerRef.current.getCoordinateSystem();
      onConfirm({ ...searchResults[0].location, coordinate_system: coordSystem });
    } else {
      onConfirm({ name: searchQuery } as MapLocation);
    }
  };

  if (!visible) return null;
  if (disabled) {
    return (
      <div className="lf-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
        <div className="lf-map-selector" onClick={(e) => e.stopPropagation()}>
          <div className="lf-map-loading"><div className="lf-map-loading-text">地图未启用或缺少 API Key</div></div>
          <div className="lf-map-bottom-controls"><button className="lf-btn lf-btn-cancel" onClick={onCancel}>关闭</button></div>
        </div>
      </div>
    );
  }
  return (
    <div className="lf-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lf-map-selector" onClick={(e) => e.stopPropagation()}>
        <div className="lf-map-background">
          <div ref={mapContainerRef} className="lf-map-canvas" />
        </div>
        <div className="lf-map-top-controls">
          <div className="lf-map-search">
            <label style={{ display: 'none' }} htmlFor="lac-roadmap-map-search">搜索</label>
            <input id="lac-roadmap-map-search" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="lf-map-search-input" placeholder="搜索地点" />
            <button onClick={handleSearch} className="lf-map-search-btn" title="搜索">搜索</button>
          </div>
          {searchResults.length > 0 && (
            <div className="lf-map-search-results">
              {searchResults.map((r, i) => (
                <div key={i} className="lf-map-search-result">{r.name}</div>
              ))}
            </div>
          )}
        </div>
        <div className="lf-map-bottom-controls">
          <button className="lf-btn lf-btn-cancel" onClick={onCancel}>取消</button>
          <button className="lf-btn lf-btn-confirm" onClick={handleConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}


