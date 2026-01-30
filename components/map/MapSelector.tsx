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
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(initialLocation || null);
  const [userSelectedNewLocation, setUserSelectedNewLocation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string>('');
  const [currentProvider, setCurrentProvider] = useState<string>(settings.mapApiProvider || 'none');
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<IMapProvider | null>(null);
  const currentMarkerRef = useRef<any>(null);
  const searchMarkersRef = useRef<any[]>([]);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const userSelectedNewLocationRef = useRef<boolean>(false);
  const selectedLocationRef = useRef<MapLocation | null>(initialLocation || null);

  // 初始化搜索查询
  useEffect(() => {
    if (initialLocation) {
      setSearchQuery(initialLocation.name || initialLocation.address || '');
    }
  }, [initialLocation]);

  // 初始化地图
  useEffect(() => {
    if (!visible || disabled) return;
    setMapError(null);
    const init = async () => {
      try {
        const availableProviders: string[] = [];
        if (settings.gaodeWebServiceKey) availableProviders.push('gaode');
        if (settings.googleMapsApiKey) availableProviders.push('google');
        const currentProvider = (settings.mapApiProvider || 'google') as 'gaode' | 'google';
        const apiKey = currentProvider === 'google' ? settings.googleMapsApiKey : settings.gaodeWebServiceKey;
        if (!apiKey) return;
        const provider = MapProviderFactory.createProvider(currentProvider, apiKey, 'zh');
        providerRef.current = provider;
        if (mapContainerRef.current) {
          await provider.initMap(mapContainerRef.current, initialLocation, availableProviders);
          provider.onMapClick(handleMapClick);
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
      currentMarkerRef.current = null;
      searchMarkersRef.current = [];
    };
  }, [visible, settings.mapApiProvider, initialLocation]);

  // 监听地图提供商切换事件
  useEffect(() => {
    const handleProviderSwitch = async (event: CustomEvent) => {
      const { provider: newProvider } = event.detail;
      
      if (newProvider === currentProvider) return;
      
      try {
        // 清除搜索结果和搜索标记
        setSearchResults([]);
        setSearchError('');
        if (providerRef.current && searchMarkersRef.current.length > 0) {
          providerRef.current.clearMarkers(searchMarkersRef.current);
          searchMarkersRef.current = [];
        }
        
        // 销毁当前地图
        if (providerRef.current) {
          providerRef.current.destroy();
          providerRef.current = null;
        }
        
        // 清空地图容器
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = '';
        }
        
        // 重新初始化地图
        const apiKey = newProvider === 'google' 
          ? settings.googleMapsApiKey 
          : settings.gaodeWebServiceKey;
        
        if (!apiKey) return;
        
        const availableProviders: string[] = [];
        if (settings.gaodeWebServiceKey) availableProviders.push('gaode');
        if (settings.googleMapsApiKey) availableProviders.push('google');
        
        const provider = MapProviderFactory.createProvider(newProvider, apiKey, 'zh');
        providerRef.current = provider;
        
        if (mapContainerRef.current) {
          const locationToUse = userSelectedNewLocationRef.current 
            ? (selectedLocationRef.current || undefined) 
            : initialLocation;
          
          await provider.initMap(mapContainerRef.current, locationToUse, availableProviders);
          provider.onMapClick(handleMapClick);
          
          // 如果有位置，重新添加标记
          if (locationToUse && locationToUse.longitude && locationToUse.latitude) {
            const [lng, lat] = await provider.convertCoordinates(locationToUse);
            currentMarkerRef.current = provider.addMarker(lng, lat, locationToUse.name);
          }
          
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
  }, [currentProvider, settings.mapApiProvider, settings.googleMapsApiKey, settings.gaodeWebServiceKey, initialLocation]);

  // 地图点击处理
  const handleMapClick = async (lng: number, lat: number) => {
    if (!providerRef.current) return;
    
    try {
      const location = await providerRef.current.getAddressByCoordinates(lng, lat);
      
      if (location) {
        setSelectedLocation(location);
        selectedLocationRef.current = location;
        setSearchQuery(location.name || '已选择位置');
      } else {
        const defaultLocation: MapLocation = {
          longitude: lng,
          latitude: lat,
          name: '已选择位置'
        };
        setSelectedLocation(defaultLocation);
        selectedLocationRef.current = defaultLocation;
        setSearchQuery('已选择位置');
      }
      
      setUserSelectedNewLocation(true);
      userSelectedNewLocationRef.current = true;
      setSearchResults([]);
      
      // 更新标记
      if (currentMarkerRef.current) {
        providerRef.current.removeMarker(currentMarkerRef.current);
      }
      currentMarkerRef.current = providerRef.current.addMarker(lng, lat, location?.name);
    } catch (error) {
      console.error('Failed to get address:', error);
    }
  };

  // 搜索地点
  const handleSearch = async () => {
    if (!searchQuery.trim() || !providerRef.current) return;
    
    setIsSearching(true);
    setSearchError('');
    
    try {
      const results = await providerRef.current.searchPlaces(searchQuery.trim());
      
      if (results && results.length > 0) {
        setSearchResults(results);
        
        // 清除之前的搜索结果标记
        if (searchMarkersRef.current.length > 0) {
          providerRef.current.clearMarkers(searchMarkersRef.current);
          searchMarkersRef.current = [];
        }
        
        // 显示搜索结果标记
        searchMarkersRef.current = providerRef.current.displaySearchMarkers(
          results,
          scrollToSearchResult
        );
      } else {
        setSearchResults([]);
        setSearchError('未找到相关地点');
        
        // 清除搜索结果标记
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

  // 滚动到指定的搜索结果
  const scrollToSearchResult = (index: number) => {
    if (searchResultsRef.current) {
      const resultItems = searchResultsRef.current.querySelectorAll('.lf-map-search-result');
      if (resultItems[index]) {
        resultItems[index].scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        
        // 添加高亮效果
        resultItems.forEach((item, i) => {
          const numberElement = item.querySelector('.lf-map-search-result-number');
          if (numberElement) {
            numberElement.classList.remove('lf-map-search-result-highlight');
            if (i === index) {
              numberElement.classList.add('lf-map-search-result-highlight');
              setTimeout(() => {
                numberElement.classList.remove('lf-map-search-result-highlight');
              }, 2000);
            }
          }
        });
      }
    }
  };

  // 选择搜索结果
  const handleSelectResult = async (result: MapSearchResult) => {
    if (!providerRef.current) return;
    
    setSelectedLocation(result.location);
    selectedLocationRef.current = result.location;
    setSearchQuery(result.name);
    setSearchResults([]);
    
    // 标记用户已选择新地点
    setUserSelectedNewLocation(true);
    userSelectedNewLocationRef.current = true;
    
    // 清除搜索结果标记
    if (searchMarkersRef.current.length > 0) {
      providerRef.current.clearMarkers(searchMarkersRef.current);
      searchMarkersRef.current = [];
    }
    
    // 移动地图到选中位置并添加标记
    if (result.location.longitude && result.location.latitude) {
      const [lng, lat] = await providerRef.current.convertCoordinates(result.location);
      providerRef.current.setCenter(lng, lat, 15);
      
      // 更新选中标记
      if (currentMarkerRef.current) {
        providerRef.current.removeMarker(currentMarkerRef.current);
      }
      currentMarkerRef.current = providerRef.current.addMarker(lng, lat, result.name);
    }
  };

  // 确认选择
  const handleConfirm = () => {
    // 情况1: 如果搜索输入框为空，清除地址数据
    if (!searchQuery.trim()) {
      const emptyLocation: MapLocation = {
        name: '',
        longitude: undefined,
        latitude: undefined,
        address: ''
      };
      onConfirm(emptyLocation);
      return;
    }

    // 情况2: 如果选择了地址且搜索输入框显示该地址名称，保存完整地址信息
    if (selectedLocation && 
        selectedLocation.name && 
        searchQuery.trim() === selectedLocation.name) {
      const coordSystem = providerRef.current?.getCoordinateSystem() || 'WGS84';
      const locationWithCoordSystem: MapLocation = {
        ...selectedLocation,
        coordinate_system: coordSystem
      };
      onConfirm(locationWithCoordSystem);
      return;
    }

    // 情况3: 其他情况（只输入了搜索内容，或选择了地址但搜索框内容不匹配）
    const textLocation: MapLocation = {
      name: searchQuery.trim(),
      longitude: undefined,
      latitude: undefined,
      address: undefined,
      coordinate_system: undefined
    };
    onConfirm(textLocation);
  };

  // 关闭搜索结果
  const handleCloseSearchResults = () => {
    setSearchResults([]);
    setSearchQuery('');
    setSelectedLocation(null);
    
    // 清除地图上的标记
    if (providerRef.current) {
      if (searchMarkersRef.current.length > 0) {
        providerRef.current.clearMarkers(searchMarkersRef.current);
        searchMarkersRef.current = [];
      }
      
      if (currentMarkerRef.current) {
        providerRef.current.removeMarker(currentMarkerRef.current);
        currentMarkerRef.current = null;
      }
    }
  };

  // 键盘事件处理
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
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
          {mapError && (
            <div className="lf-map-loading">
              <div className="lf-map-loading-text">{mapError}</div>
            </div>
          )}
        </div>
        {/* 顶部搜索区域 */}
        <div className="lf-map-top-controls">
          {/* 搜索框 */}
          <div className="lf-map-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="搜索地点"
              className="lf-map-search-input"
            />
            {searchResults.length > 0 ? (
              <button 
                onClick={handleCloseSearchResults}
                className="lf-map-search-btn lf-map-clear-btn"
                title="关闭结果"
              />
            ) : (
              <button 
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className={`lf-map-search-btn ${isSearching ? 'lf-map-search-btn-loading' : ''}`}
                title={isSearching ? '搜索中...' : '搜索'}
              >
                {isSearching ? (
                  <span className="lf-map-search-btn-spinner"></span>
                ) : (
                  '搜索'
                )}
              </button>
            )}
          </div>

          {/* 搜索错误提示 */}
          {searchError && (
            <div className="lf-map-search-error">
              {searchError}
            </div>
          )}

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <div 
              ref={searchResultsRef}
              className="lf-map-search-results"
              onClick={(e) => e.stopPropagation()}
            >
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="lf-map-search-result"
                  onClick={() => handleSelectResult(result)}
                >
                  <div className="lf-map-search-result-number">{index + 1}</div>
                  <div className="lf-map-search-result-content">
                    <div className="lf-map-search-result-name">{result.name}</div>
                    <div className="lf-map-search-result-address">{result.address}</div>
                    {result.distance && (
                      <div className="lf-map-search-result-distance">{result.distance}m</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lf-map-bottom-controls">
          <button id="lf-map-cancel-btn" className="lf-btn lf-btn-cancel" onClick={onCancel}>取消</button>
          <button className="lf-btn lf-btn-confirm" onClick={handleConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}


