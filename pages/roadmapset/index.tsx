import { useEffect, useState } from 'react';
import { App, TFile } from 'obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Roadmap, Place } from '../../types/roadmap';
import { MapLocation } from '../../types/map';
import { t } from '../../i18n';
import MapSelector from '../../components/map/MapSelector';
import AggregatedMap from '../../components/map/AggregatedMap';

interface Props {
  app: App;
  repository: RoadmapRepository;
  settings: any;
}

// Static Map Component using Google Maps Static API
function StaticMap({ roadmap, settings }: { roadmap: Roadmap; settings: any }) {
  const [mapUrl, setMapUrl] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [hasCoordinates, setHasCoordinates] = useState(false);

  useEffect(() => {
    const generateMapUrl = () => {
      console.log(`[StaticMap] Generating map for roadmap: ${roadmap.name}`);
      
      // Collect all locations from roadmap and its linked places
      const allLocations: MapLocation[] = [];
      
      // Add roadmap's own location if it has coordinates
      if (roadmap.detail?.address) {
        const roadmapLoc = roadmap.detail.address as MapLocation;
        console.log(`[StaticMap] Roadmap address:`, roadmapLoc);
        if (roadmapLoc && typeof roadmapLoc.longitude === 'number' && typeof roadmapLoc.latitude === 'number') {
          allLocations.push(roadmapLoc);
          console.log(`[StaticMap] Added roadmap location: ${roadmapLoc.latitude}, ${roadmapLoc.longitude}`);
        }
      }
      
      // Add all linked places locations
      const places = roadmap.items.filter(item => 'name' in item) as Place[];
      console.log(`[StaticMap] Found ${places.length} places in roadmap`);
      
      for (const place of places) {
        const loc = place.detail?.address as MapLocation | undefined;
        console.log(`[StaticMap] Place "${place.name}" address:`, loc);
        if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
          allLocations.push(loc);
          console.log(`[StaticMap] Added place location: ${loc.latitude}, ${loc.longitude}`);
        }
      }

      console.log(`[StaticMap] Total locations found: ${allLocations.length}`);
      console.log(`[StaticMap] Google Maps API Key available: ${!!settings?.googleMapsApiKey}`);

      if (allLocations.length === 0) {
        console.log(`[StaticMap] No coordinates found for roadmap: ${roadmap.name}`);
        setHasCoordinates(false);
        setHasError(true);
        return;
      }

      if (!settings?.googleMapsApiKey) {
        console.log(`[StaticMap] No Google Maps API Key available`);
        setHasCoordinates(true);
        setHasError(true);
        return;
      }

      try {
        // Generate Google Maps Static API URL
        const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
        
        // Calculate center point from all locations
        const avgLat = allLocations.reduce((sum, loc) => sum + (loc.latitude || 0), 0) / allLocations.length;
        const avgLng = allLocations.reduce((sum, loc) => sum + (loc.longitude || 0), 0) / allLocations.length;
        
        console.log(`[StaticMap] Calculated center: ${avgLat}, ${avgLng}`);
        
        // Create markers for all locations
        const markers = allLocations.map((loc, index) => {
          const color = index === 0 ? 'red' : 'blue'; // First marker (roadmap) is red, others are blue
          return `color:${color}|${loc.latitude},${loc.longitude}`;
        }).join('&markers=');
        
        const params = new URLSearchParams({
          center: `${avgLat},${avgLng}`,
          zoom: '10', // Slightly zoomed out to show all locations
          size: '100x100',
          maptype: 'roadmap',
          markers: markers,
          key: settings.googleMapsApiKey
        });

        const url = `${baseUrl}?${params.toString()}`;
        console.log(`[StaticMap] Generated map URL: ${url}`);
        
        setMapUrl(url);
        setHasError(false);
        setHasCoordinates(true);
      } catch (error) {
        console.error(`[StaticMap] Failed to generate static map URL for ${roadmap.name}:`, error);
        setHasError(true);
        setHasCoordinates(true);
      }
    };

    generateMapUrl();
  }, [roadmap, settings]);

  // Don't render map container if no coordinates
  if (!hasCoordinates) {
    console.log(`[StaticMap] Not rendering map for ${roadmap.name} - no coordinates`);
    return null;
  }

  if (hasError || !mapUrl) {
    console.log(`[StaticMap] Rendering placeholder for ${roadmap.name} - error or no URL`);
    return (
      <div className="lac-card-map">
        <div className="lac-card-map-placeholder">
          <div className="lac-card-map-placeholder-text">📍</div>
        </div>
      </div>
    );
  }

  console.log(`[StaticMap] Rendering map for ${roadmap.name}`);
  return (
    <div className="lac-card-map">
      <img 
        src={mapUrl} 
        alt={`Map for ${roadmap.name}`}
        className="lac-card-map-image"
        onError={() => {
          console.error(`[StaticMap] Image load error for ${roadmap.name}`);
          setHasError(true);
        }}
        onLoad={() => {
          console.log(`[StaticMap] Image loaded successfully for ${roadmap.name}`);
        }}
      />
    </div>
  );
}

export default function RoadmapSetPage({ app, repository, settings }: Props) {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [mapVisible, setMapVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const ids = await repository.loadRoadmapSet();
      const roadmapPromises = ids.map(async (id) => {
        const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
        if (dest && dest instanceof TFile) {
          return await repository.loadRoadmap(dest.path);
        }
        return null;
      });
      const loadedRoadmaps = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
      setRoadmaps(loadedRoadmaps);
    })();
  }, [repository, app]);

  const handleAdd = async () => {
    const name = prompt('新路线名称');
    if (!name) return;
    const folder = (repository.getRootPath().split('/').slice(0, -1).join('/')) || 'LaC/Roadmap';
    const fp = await repository.createRoadmapFile(folder, name, { description: '' });
    await repository.addRoadmapToSet(name);
    const ids = await repository.loadRoadmapSet();
    const roadmapPromises = ids.map(async (id) => {
      const dest = app.metadataCache.getFirstLinkpathDest(id, repository.getRootPath());
      if (dest && dest instanceof TFile) {
        return await repository.loadRoadmap(dest.path);
      }
      return null;
    });
    const loadedRoadmaps = (await Promise.all(roadmapPromises)).filter(Boolean) as Roadmap[];
    setRoadmaps(loadedRoadmaps);
  };

  const openRoadmap = async (roadmap: Roadmap) => {
    try {
      const dest = app.metadataCache.getFirstLinkpathDest(roadmap.id, repository.getRootPath());
      if (dest && dest instanceof TFile) {
        const leaf = app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: 'lac-roadmap-view', state: { filePath: dest.path }, active: true });
        app.workspace.revealLeaf(leaf);
      }
    } catch (_) {}
  };

  // Helper functions for card display
  const getDateRange = (roadmap: Roadmap): string => {
    console.log(`[getDateRange] Processing roadmap: ${roadmap.name}`);
    console.log(`[getDateRange] Roadmap detail:`, roadmap.detail);
    
    const startTime = roadmap.detail?.start_time;
    const endTime = roadmap.detail?.end_time;
    
    console.log(`[getDateRange] Start time: ${startTime}, End time: ${endTime}`);
    
    if (!startTime) {
      console.log(`[getDateRange] No start time found for ${roadmap.name}`);
      return '';
    }
    
    try {
      const startDate = new Date(startTime);
      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0]; // yyyy-MM-dd format
      };
      
      if (!endTime) {
        const result = formatDate(startDate);
        console.log(`[getDateRange] Single date result for ${roadmap.name}: ${result}`);
        return result;
      }
      
      const endDate = new Date(endTime);
      if (startDate.getTime() === endDate.getTime()) {
        const result = formatDate(startDate);
        console.log(`[getDateRange] Same date result for ${roadmap.name}: ${result}`);
        return result;
      }
      
      const result = `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
      console.log(`[getDateRange] Date range result for ${roadmap.name}: ${result}`);
      return result;
    } catch (error) {
      console.error(`[getDateRange] Error processing dates for ${roadmap.name}:`, error);
      return '';
    }
  };

  const getStatusColor = (roadmap: Roadmap): string => {
    const startTime = roadmap.detail?.start_time;
    const endTime = roadmap.detail?.end_time;
    
    if (!startTime && !endTime) return 'lac-na'; // No time planned
    
    const now = new Date();
    
    try {
      if (startTime) {
        const startDate = new Date(startTime);
        if (startDate <= now) return 'lac-done'; // Started
      }
      
      if (endTime) {
        const endDate = new Date(endTime);
        if (endDate <= now) return 'lac-done'; // Ended
      }
      
      return 'lac-todo'; // Not started yet
    } catch {
      return 'lac-na';
    }
  };

  return (
    <div className="lac-roadmapset-root">
      {/* 顶部 1:1 地图 */}
      <div className="lac-map-widget lac-mb-12">
        <AggregatedMap app={app} repository={repository} settings={settings} />
      </div>

      {/* 下方卡片列表（带页边距）*/}
      <div className="lac-roadmapset-list-wrapper">
        <div className="lac-card-list">
          {roadmaps.map(roadmap => {
            console.log(`[Card] Rendering card for roadmap: ${roadmap.name}`);
            console.log(`[Card] Roadmap data:`, roadmap);
            
            const description = roadmap.detail?.description || '';
            const dateRange = getDateRange(roadmap);
            const statusColor = getStatusColor(roadmap);
            
            console.log(`[Card] Description: "${description}"`);
            console.log(`[Card] Date range: "${dateRange}"`);
            console.log(`[Card] Status color: "${statusColor}"`);
            
            return (
              <div
                key={roadmap.id}
                className="lac-card lac-cursor-pointer"
                onClick={() => openRoadmap(roadmap)}
              >
                <div className="lac-card-content">
                  <div className="lac-card-text">
                    <div className="lac-card-title">
                      <div className={`lac-title ${statusColor}`}>{roadmap.name}</div>
                      <div className="lac-description">&nbsp;{description}</div>
                    </div>
                    <div className={`lac-tag`}>{dateRange}</div>
                  </div>
                  <StaticMap roadmap={roadmap} settings={settings} />
                </div>
              </div>
            );
          })}
        </div>
        {/* 列表底部新增按钮 */}
        <div className="lac-row lac-justify-center lac-mb-12">
          <button className="lac-btn--add" onClick={handleAdd}>+</button>
        </div>
      </div>

      {/* 复用 MapSelector 作为聚合地图的承载（仅展示，不保存）*/}
      <MapSelector
        visible={mapVisible}
        initialLocation={undefined}
        onCancel={() => setMapVisible(false)}
        onConfirm={() => setMapVisible(false)}
        settings={{
          mapApiProvider: settings.mapApiProvider,
          gaodeWebServiceKey: settings.gaodeWebServiceKey,
          googleMapsApiKey: settings.googleMapsApiKey
        }}
      />
    </div>
  );
}



