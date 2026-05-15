import React, { useEffect, useRef, useState } from 'react';
import { MapSelectorProps, MapLocation, MapSearchResult } from '../../types/map';
import { MapProviderFactory } from './providers/MapProviderFactory';
import { IMapProvider } from './providers/IMapProvider';
import { CoordinateConverter } from './GoogleMap';

type ProviderKey = 'google' | 'gaode';

// Provider metadata for the dropdown trigger. Adding a 4th/5th provider
// is a one-line append here + an entry in availableProviders.
const PROVIDER_META: Record<ProviderKey, { label: string; meta: string }> = {
  google: { label: 'Google',  meta: 'WGS84 · global' },
  gaode:  { label: 'AMap',    meta: 'GCJ-02 · CN' },
};

function formatLatLng(loc: MapLocation | null): string {
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    return '— · —';
  }
  const lat = `${loc.latitude.toFixed(4)}°${loc.latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${loc.longitude.toFixed(4)}°${loc.longitude >= 0 ? 'E' : 'W'}`;
  const sys = (loc.coordinate_system || 'WGS84').toUpperCase();
  return `${lat} · ${lng} · ${sys}`;
}

// Convert a MapLocation's coords to the target provider's coordinate
// system (Google → WGS84, AMap → GCJ-02). Same logic used by
// AggregatedMap, kept inline here for the route-overlay path.
function toTargetCoords(loc: MapLocation, targetIsWgs84: boolean): { lng: number; lat: number } | null {
  if (typeof loc.longitude !== 'number' || typeof loc.latitude !== 'number') return null;
  let lng = loc.longitude;
  let lat = loc.latitude;
  const sys = (loc.coordinate_system || 'WGS84').toLowerCase();
  const isGcj = sys === 'gcj-02' || sys === 'gcj02';
  if (targetIsWgs84 && isGcj) [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
  else if (!targetIsWgs84 && !isGcj) [lng, lat] = CoordinateConverter.wgs84ToGcj02(lng, lat);
  return { lng, lat };
}

export default function MapSelector({ visible, initialLocation, onCancel, onConfirm, settings, routeLocations, readOnly }: MapSelectorProps) {
  // 地图关闭条件：none 或缺少对应 key
  const provider = (settings?.mapApiProvider || 'none') as string;
  const hasKey = provider === 'google' ? !!settings?.googleMapsApiKey : provider === 'gaode' ? !!(settings?.gaodeJsApiKey || settings?.gaodeWebServiceKey) : false;
  const disabled = provider === 'none' || !hasKey;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(initialLocation || null);
  const [userSelectedNewLocation, setUserSelectedNewLocation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string>('');
  const [currentProvider, setCurrentProvider] = useState<string>(settings.mapApiProvider || 'none');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<IMapProvider | null>(null);
  const searchMarkersRef = useRef<any[]>([]);
  const routeMarkersRef = useRef<any[]>([]);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const userSelectedNewLocationRef = useRef<boolean>(false);
  const selectedLocationRef = useRef<MapLocation | null>(initialLocation || null);
  const routeLocationsRef = useRef<MapLocation[] | undefined>(routeLocations);
  routeLocationsRef.current = routeLocations;

  // Render the route overlay (numbered markers + connecting polyline) on
  // the provider's map. Idempotent — clears its own previous markers and
  // any existing polylines before drawing. Called after every provider
  // init / switch so the trip layout stays visible while the user
  // navigates the map to pick a location.
  const renderRouteOverlay = (target: 'google' | 'gaode') => {
    const inst = providerRef.current;
    if (!inst) return;
    const list = routeLocationsRef.current || [];
    if (routeMarkersRef.current.length > 0) {
      try { inst.clearMarkers(routeMarkersRef.current); } catch {}
      routeMarkersRef.current = [];
    }
    try { inst.clearPolylines(); } catch {}
    if (list.length === 0) return;
    const targetIsWgs84 = target === 'google';
    const points: { lng: number; lat: number; title: string }[] = [];
    for (const loc of list) {
      const pt = toTargetCoords(loc, targetIsWgs84);
      if (pt) points.push({ ...pt, title: loc.name || '' });
    }
    if (points.length === 0) return;
    // Connecting polyline first, then numbered markers on top.
    if (points.length >= 2) {
      const segs = [] as Array<{ path: Array<[number, number]>; style: 'solid' | 'dashed'; color?: string }>;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        segs.push({ path: [[a.lng, a.lat], [b.lng, b.lat]], style: 'solid', color: '#D3BC8D' });
      }
      try { inst.drawPolylines(segs); } catch {}
    }
    const results: MapSearchResult[] = points.map(p => ({
      name: p.title,
      address: '',
      location: { longitude: p.lng, latitude: p.lat, name: p.title },
    }));
    try {
      routeMarkersRef.current = inst.displaySearchMarkers(results, () => {}, { markerStyle: 'number' });
    } catch {}
    // Only fit-bounds when the user does NOT have a focused point already
    // (e.g. opening the picker fresh, with no initial location). When
    // editing a known place we keep the provider's default zoom centered
    // on `initialLocation` so the user can fine-tune that point, instead
    // of being yanked out to cover the whole route.
    if (!initialLocation || typeof initialLocation.latitude !== 'number' || typeof initialLocation.longitude !== 'number') {
      try { inst.fitBounds(points); } catch {}
    }
  };

  // Initialize search query from the seeded location.
  useEffect(() => {
    if (initialLocation) {
      setSearchQuery(initialLocation.name || initialLocation.address || '');
    }
  }, [initialLocation]);

  // Init map.
  useEffect(() => {
    if (!visible || disabled) return;
    setMapError(null);
    const init = async () => {
      try {
        const availableProviders: string[] = [];
        if (settings.gaodeJsApiKey || settings.gaodeWebServiceKey) availableProviders.push('gaode');
        if (settings.googleMapsApiKey) availableProviders.push('google');
        const currentProvider = (settings.mapApiProvider || 'google') as 'gaode' | 'google';
        const apiKey = currentProvider === 'google' ? settings.googleMapsApiKey : (settings.gaodeJsApiKey || settings.gaodeWebServiceKey);
        if (!apiKey) return;
        const provider = MapProviderFactory.createProvider(currentProvider, apiKey, 'zh', currentProvider === 'gaode' ? settings.gaodeWebServiceKey : undefined);
        providerRef.current = provider;
        if (mapContainerRef.current) {
          await provider.initMap(mapContainerRef.current, initialLocation, availableProviders);
          // readOnly：viewer 模式不收 click，避免误触改路径。
          if (!readOnly) provider.onMapClick(handleMapClick);
          // Wait one frame for the provider's tile/canvas to settle
          // before drawing the overlay (mirrors AggregatedMap recipe).
          await new Promise(r => requestAnimationFrame(r));
          renderRouteOverlay(currentProvider);
          setMapLoaded(true);
        }
        setCurrentProvider(currentProvider);
      } catch (error: any) {
        console.error('[MapSelector] Failed to initialize map:', error);
        setMapError(error?.message || '地图加载失败，可能是网络连接问题或 API Key 配置错误');
        setMapLoaded(false);
      }
    };
    init();
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      searchMarkersRef.current = [];
    };
  }, [visible, settings.mapApiProvider, initialLocation]);

  // Listen for provider-switch events (emitted by the dropdown menu below).
  useEffect(() => {
    const handleProviderSwitch = async (event: CustomEvent) => {
      const { provider: newProvider } = event.detail;
      if (newProvider === currentProvider) return;
      try {
        setSearchResults([]);
        setSearchError('');
        if (providerRef.current && searchMarkersRef.current.length > 0) {
          providerRef.current.clearMarkers(searchMarkersRef.current);
          searchMarkersRef.current = [];
        }
        if (providerRef.current) {
          providerRef.current.destroy();
          providerRef.current = null;
        }
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = '';
        }
        const apiKey = newProvider === 'google'
          ? settings.googleMapsApiKey
          : (settings.gaodeJsApiKey || settings.gaodeWebServiceKey);
        if (!apiKey) return;
        const availableProviders: string[] = [];
        if (settings.gaodeJsApiKey || settings.gaodeWebServiceKey) availableProviders.push('gaode');
        if (settings.googleMapsApiKey) availableProviders.push('google');
        const provider = MapProviderFactory.createProvider(newProvider, apiKey, 'zh', newProvider === 'gaode' ? settings.gaodeWebServiceKey : undefined);
        providerRef.current = provider;
        if (mapContainerRef.current) {
          const locationToUse = userSelectedNewLocationRef.current
            ? (selectedLocationRef.current || undefined)
            : initialLocation;
          await provider.initMap(mapContainerRef.current, locationToUse, availableProviders);
          if (!readOnly) provider.onMapClick(handleMapClick);
          // No explicit `provider.addMarker(locationToUse, ...)` here —
          // the current edit place is now rendered by `renderRouteOverlay`
          // as one of the numbered route markers, so a separate
          // red default pin would just duplicate it offset (image 36).
          await new Promise(r => requestAnimationFrame(r));
          renderRouteOverlay(newProvider as 'google' | 'gaode');
          setMapLoaded(true);
        }
        setCurrentProvider(newProvider);
      } catch (error) {
        console.error('Failed to switch map provider:', error);
      }
    };
    window.addEventListener('mapProviderSwitch', handleProviderSwitch as unknown as EventListener);
    return () => {
      window.removeEventListener('mapProviderSwitch', handleProviderSwitch as unknown as EventListener);
    };
  }, [currentProvider, settings.mapApiProvider, settings.googleMapsApiKey, settings.gaodeJsApiKey, settings.gaodeWebServiceKey, initialLocation]);

  // Close provider menu on outside click.
  useEffect(() => {
    if (!providerMenuOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setProviderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [providerMenuOpen]);

  const handleMapClick = async (lng: number, lat: number) => {
    const inst = providerRef.current;
    if (!inst) return;
    try {
      const coordSystem = inst.getCoordinateSystem();
      const location = await inst.getAddressByCoordinates(lng, lat);
      const newLoc: MapLocation = location
        ? { ...location, coordinate_system: location.coordinate_system || coordSystem }
        : { longitude: lng, latitude: lat, name: '已选择位置', coordinate_system: coordSystem };
      setSelectedLocation(newLoc);
      selectedLocationRef.current = newLoc;
      setSearchQuery(newLoc.name || '已选择位置');
      setUserSelectedNewLocation(true);
      userSelectedNewLocationRef.current = true;
      setSearchResults([]);

      // Move (or append) the editing place's marker in the route overlay
      // so the user sees a single numbered marker jump to the clicked
      // location — no red default pin overlay. When `initialLocation` has
      // a name, match it in `routeLocations` and swap coords; for the
      // new-place flow (no initial), append a fresh entry at the end so
      // the click still produces a visible numbered marker.
      const list = (routeLocationsRef.current || []).slice();
      const editName = initialLocation?.name;
      const matchIdx = editName ? list.findIndex(l => l && l.name === editName) : -1;
      const replacement: MapLocation = {
        ...(matchIdx >= 0 ? list[matchIdx] : {}),
        longitude: newLoc.longitude,
        latitude: newLoc.latitude,
        name: (matchIdx >= 0 ? list[matchIdx].name : newLoc.name) || newLoc.name,
        coordinate_system: newLoc.coordinate_system,
      };
      if (matchIdx >= 0) list[matchIdx] = replacement;
      else list.push(replacement);
      routeLocationsRef.current = list;
      renderRouteOverlay((currentProvider as 'google' | 'gaode'));
    } catch (error) {
      console.error('Failed to get address:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !providerRef.current) return;
    setIsSearching(true);
    setSearchError('');
    try {
      const results = await providerRef.current.searchPlaces(searchQuery.trim());
      if (results && results.length > 0) {
        setSearchResults(results);
        if (searchMarkersRef.current.length > 0) {
          providerRef.current.clearMarkers(searchMarkersRef.current);
          searchMarkersRef.current = [];
        }
        searchMarkersRef.current = providerRef.current.displaySearchMarkers(results, scrollToSearchResult);
      } else {
        setSearchResults([]);
        setSearchError('未找到相关地点');
        if (searchMarkersRef.current.length > 0 && providerRef.current) {
          providerRef.current.clearMarkers(searchMarkersRef.current);
          searchMarkersRef.current = [];
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError('搜索失败，请稍后重试');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const scrollToSearchResult = (index: number) => {
    if (searchResultsRef.current) {
      const resultItems = searchResultsRef.current.querySelectorAll('.lac-map-search-result');
      if (resultItems[index]) {
        resultItems[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        resultItems.forEach((item, i) => {
          const numberElement = item.querySelector('.lac-map-search-result-number');
          if (numberElement) {
            numberElement.classList.remove('lac-map-search-result-highlight');
            if (i === index) {
              numberElement.classList.add('lac-map-search-result-highlight');
              setTimeout(() => {
                numberElement.classList.remove('lac-map-search-result-highlight');
              }, 2000);
            }
          }
        });
      }
    }
  };

  const handleSelectResult = async (result: MapSearchResult) => {
    const inst = providerRef.current;
    if (!inst) return;
    const coordSystem = inst.getCoordinateSystem();
    const withSys: MapLocation = { ...result.location, coordinate_system: result.location.coordinate_system || coordSystem };
    setSelectedLocation(withSys);
    selectedLocationRef.current = withSys;
    setSearchQuery(result.name);
    setSearchResults([]);
    setUserSelectedNewLocation(true);
    userSelectedNewLocationRef.current = true;
    if (searchMarkersRef.current.length > 0) {
      inst.clearMarkers(searchMarkersRef.current);
      searchMarkersRef.current = [];
    }
    if (result.location.longitude && result.location.latitude) {
      const [lng, lat] = await inst.convertCoordinates(result.location);
      inst.setCenter(lng, lat, 15);
      // Mirror handleMapClick: pick = move the editing place's numbered
      // marker to the search-hit location. No separate red default pin.
      const list = (routeLocationsRef.current || []).slice();
      const editName = initialLocation?.name;
      const matchIdx = editName ? list.findIndex(l => l && l.name === editName) : -1;
      const replacement: MapLocation = {
        ...(matchIdx >= 0 ? list[matchIdx] : {}),
        longitude: lng,
        latitude: lat,
        name: (matchIdx >= 0 ? list[matchIdx].name : result.name),
        coordinate_system: coordSystem,
      };
      if (matchIdx >= 0) list[matchIdx] = replacement;
      else list.push(replacement);
      routeLocationsRef.current = list;
      renderRouteOverlay((currentProvider as 'google' | 'gaode'));
    }
  };

  const handleConfirm = () => {
    if (!searchQuery.trim()) {
      const emptyLocation: MapLocation = { name: '', longitude: undefined, latitude: undefined, address: '' };
      onConfirm(emptyLocation);
      return;
    }
    if (selectedLocation && selectedLocation.name && searchQuery.trim() === selectedLocation.name) {
      const coordSystem = providerRef.current?.getCoordinateSystem() || 'WGS84';
      const locationWithCoordSystem: MapLocation = { ...selectedLocation, coordinate_system: selectedLocation.coordinate_system || coordSystem };
      onConfirm(locationWithCoordSystem);
      return;
    }
    const textLocation: MapLocation = { name: searchQuery.trim(), longitude: undefined, latitude: undefined, address: undefined, coordinate_system: undefined };
    onConfirm(textLocation);
  };

  const handleClear = () => {
    setSearchResults([]);
    setSearchQuery('');
    setSelectedLocation(null);
    selectedLocationRef.current = null;
    if (providerRef.current && searchMarkersRef.current.length > 0) {
      providerRef.current.clearMarkers(searchMarkersRef.current);
      searchMarkersRef.current = [];
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleProviderPick = (key: ProviderKey) => {
    setProviderMenuOpen(false);
    if (key === currentProvider) return;
    window.dispatchEvent(new CustomEvent('mapProviderSwitch', { detail: { provider: key } }));
  };

  // Build the available-provider list for the dropdown.
  const availableProviders: ProviderKey[] = [];
  if (settings.googleMapsApiKey) availableProviders.push('google');
  if (settings.gaodeJsApiKey || settings.gaodeWebServiceKey) availableProviders.push('gaode');

  if (!visible) return null;
  if (disabled) {
    return (
      <div className="lac-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
        <div className="lac-map-selector" onClick={(e) => e.stopPropagation()}>
          <div className="lac-map-loading"><div className="lac-map-loading-text">地图未启用或缺少 API Key</div></div>
          <div className="lac-map-bottom-bar">
            <button className="lac-map-bottom-btn lac-map-bottom-btn--cancel" onClick={onCancel}>cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const currentMeta = PROVIDER_META[currentProvider as ProviderKey] || PROVIDER_META.google;

  return (
    <div className="lac-map-selector-mask" onClick={(e) => { if (e.currentTarget === e.target) onCancel(); }}>
      <div className="lac-map-selector" onClick={(e) => e.stopPropagation()}>
        {/* Hero map fills the entire modal; everything else is overlaid. */}
        <div className="lac-map-background">
          <div ref={mapContainerRef} className="lac-map-canvas" />
          {mapError && (
            <div className="lac-map-loading">
              <div className="lac-map-loading-text">{mapError}</div>
            </div>
          )}
        </div>

        {/* Top bar — edge-to-edge strip. `PIN` eyebrow (image 23) anchors
            the row at the left; the search field sits between the eyebrow
            and the provider dropdown. readOnly viewer 把 eyebrow 改成 VIEW
            并隐藏搜索栏 —— provider dropdown 留下来给用户切底图。 */}
        <div className="lac-map-topbar">
          <div className="lac-map-topbar-eyebrow">{readOnly ? 'view' : 'pin'}</div>
          {!readOnly && (
            <div className="lac-map-search-row">
              <span className="lac-map-search-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="搜索地点"
                className="lac-map-overlay-search-input"
              />
              {searchResults.length > 0 && (
                <button type="button" className="lac-map-overlay-search-btn" onClick={handleClear} title="清除">×</button>
              )}
              {!searchResults.length && searchQuery.trim() && (
                <button
                  type="button"
                  className="lac-map-overlay-search-btn"
                  onClick={handleSearch}
                  disabled={isSearching}
                  title={isSearching ? '搜索中...' : '搜索'}
                >{isSearching ? '…' : '↵'}</button>
              )}
            </div>
          )}
          <div className="lac-map-provider" ref={providerMenuRef}>
            <button
              type="button"
              className="lac-map-provider-trigger"
              onClick={() => setProviderMenuOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={providerMenuOpen}
            >
              <span className="lac-map-provider-dot" />
              <span className="lac-map-provider-label">{currentMeta.label}</span>
              <span className="lac-map-provider-caret">▾</span>
            </button>
            {providerMenuOpen && (
              <div className="lac-map-provider-menu" role="menu">
                {availableProviders.map((key) => {
                  const meta = PROVIDER_META[key];
                  const active = key === currentProvider;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="menuitem"
                      className={`lac-map-provider-menuitem${active ? ' is-active' : ''}`}
                      onClick={() => handleProviderPick(key)}
                    >
                      <div className="lac-map-provider-menuitem-name">{meta.label}</div>
                      <div className="lac-map-provider-menuitem-meta">{meta.meta}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Search dropdown — overlays just below the topbar, left-anchored. */}
        {(searchError || searchResults.length > 0) && (
          <div className="lac-map-search-dropdown">
            {searchError && <div className="lac-map-overlay-error">{searchError}</div>}
            {searchResults.length > 0 && (
              <div ref={searchResultsRef} className="lac-map-overlay-results" onClick={(e) => e.stopPropagation()}>
                {searchResults.map((result, index) => {
                  const isActive = selectedLocation && selectedLocation.name === result.name;
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`lac-map-search-result${isActive ? ' is-active' : ''}`}
                      onClick={() => handleSelectResult(result)}
                    >
                      <span className="lac-map-search-result-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="lac-map-search-result-content">
                        <span className="lac-map-search-result-name">{result.name}</span>
                        <span className="lac-map-search-result-address">{result.address}</span>
                      </span>
                      {isActive && <span className="lac-map-search-result-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom-left coord readout chip — gold status dot prefix matches
            image 23. Reads `● 34.9°N · 135.7°E · WGS84`. readOnly viewer
            没有 selectedLocation，chip 整体省掉。 */}
        {!readOnly && (
          <div className="lac-map-coord-chip">
            <span className="lac-map-coord-dot" />
            <span>{formatLatLng(selectedLocation)}</span>
          </div>
        )}

        {/* Bottom-right scale bar — provider-agnostic visual hint. */}
        <div className="lac-map-scalebar" aria-hidden="true">
          <span className="lac-map-scalebar-line" />
          <span className="lac-map-scalebar-label">500 m</span>
        </div>

        {/* Bottom action row — readOnly viewer 只留 close；编辑模式三按钮：
            clear · cancel · pin here。 */}
        <div className="lac-map-bottom-bar">
          {readOnly ? (
            <button type="button" className="lac-map-bottom-btn lac-map-bottom-btn--cancel" onClick={onCancel}>close</button>
          ) : (
            <>
              <button type="button" className="lac-map-bottom-btn lac-map-bottom-btn--quiet" onClick={handleClear}>clear</button>
              <button type="button" className="lac-map-bottom-btn lac-map-bottom-btn--cancel" onClick={onCancel}>cancel</button>
              <button type="button" className="lac-map-bottom-btn lac-map-bottom-btn--confirm" onClick={handleConfirm}>pin here</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
