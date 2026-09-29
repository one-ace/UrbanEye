import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { UrbanEyeEvent, BusTelemetry } from '../../types/events';
import { useEventStore } from '../../store/useEventStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useFilterStore } from '../../store/useFilterStore';
import { SEEDED_PUNE_PRIORITY_ROUTES } from '../../services/puneRoutes';
import { calculatePuneRouteAnalytics } from '../../store/routeSelectors';
import { 
  PUNE_DEFAULT_VIEWPORT, 
  PUNE_CITY_BOUNDS, 
  OPENFREEMAP_STYLES, 
  DEFAULT_BASEMAP_KEY, 
  BasemapStyleKey, 
  MAP_ATTRIBUTION 
} from '../../config/mapConfig';
import { useFilteredPmpmlFleet } from '../../utils/puneRouteMatcher';
import { 
  Layers, 
  AlertTriangle, 
  RefreshCw, 
  Droplets, 
  OctagonAlert, 
  Car, 
  Route as RouteIcon, 
  Bus as BusIcon,
  ExternalLink,
  Check,
  RotateCcw
} from 'lucide-react';

interface MapLibreMapProps {
  events: UrbanEyeEvent[];
  fleet?: BusTelemetry[];
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  interactive?: boolean;
  className?: string;
  showLayerControls?: boolean;
  focusLocation?: [number, number] | null;
  selectedRouteId?: string | null;
  isFullscreen?: boolean;
  onRouteSelect?: (routeId: string | null) => void;
}

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  events,
  fleet: propsFleet,
  center = PUNE_DEFAULT_VIEWPORT.center,
  zoom = PUNE_DEFAULT_VIEWPORT.zoom,
  className = 'w-full h-[550px]',
  showLayerControls = true,
  focusLocation = null,
  selectedRouteId = null,
  isFullscreen = false,
  onRouteSelect,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const busMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; popup: maplibregl.Popup; el: HTMLElement }>>(new Map());

  const { setSelectedEvent } = useEventStore();
  const { routes, setSelectedBus } = useFleetStore();
  const { 
    selectedJurisdiction, 
    onlyPunePriorityRoutes, 
    selectedRoute: globalSelectedRoute, 
    focusLocation: storeFocusLocation,
    setRoute 
  } = useFilterStore();

  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyleKey>(DEFAULT_BASEMAP_KEY);

  // Active route id: explicit prop takes precedence over global filter store
  const activeRouteId = selectedRouteId || (globalSelectedRoute !== 'ALL' ? globalSelectedRoute : null);

  // Centrally filter and normalize PMPML fleet BEFORE rendering (Only 7 Priority Corridors)
  const fleetToRender = useFilteredPmpmlFleet(propsFleet, activeRouteId);

  // Strict Layer Visibility Toggles
  const [layers, setLayers] = useState({
    potholes: true,
    waterlogging: true,
    signs: true,
    traffic: true,
    puneRoutes: true,
    buses: true,
  });

  // Handle "OPEN FULL MAP" -> opens dedicated full-screen GIS page in a new tab
  const handleOpenFullMap = () => {
    const params = new URLSearchParams();
    params.set('view', 'fullscreen');
    if (layers.potholes) params.append('layer', 'potholes');
    if (layers.waterlogging) params.append('layer', 'waterlogging');
    if (layers.signs) params.append('layer', 'signs');
    if (layers.traffic) params.append('layer', 'traffic');
    if (layers.puneRoutes) params.append('layer', 'puneRoutes');
    if (layers.buses) params.append('layer', 'buses');
    if (activeRouteId) params.set('route', activeRouteId);
    
    const url = `/gis/fullscreen?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Helper to recenter map to Pune PMC Centroid
  const handleResetView = () => {
    const map = mapInstance.current;
    if (!map) return;
    map.flyTo({
      center: PUNE_DEFAULT_VIEWPORT.center,
      zoom: PUNE_DEFAULT_VIEWPORT.zoom,
      pitch: 0,
      bearing: 0,
      essential: true,
    });
    if (onRouteSelect) onRouteSelect(null);
    else setRoute('ALL');
  };

  // Setup/Re-add GeoJSON vector layers on map load or style change
  const setupOperationalLayers = useCallback((map: maplibregl.Map) => {
    if (!map) return;

    // 1. Traffic Corridors GeoJSON Source (Road segments colored by congestion)
    const corridorFeatures = routes.map((rt) => {
      const hasRealtime = typeof rt.congestion_score === 'number' && rt.congestion_score > 0;
      let color = '#64748b'; // muted slate for corridor awaiting live feed
      const score = rt.congestion_score || 0;
      if (hasRealtime) {
        if (score >= 85) color = '#ef4444'; // Red: Severe / Gridlock
        else if (score >= 70) color = '#f97316'; // Orange: Heavy
        else if (score >= 40) color = '#f59e0b'; // Amber: Moderate
        else color = '#10b981'; // Green: Normal (<40%)
      }

      return {
        type: 'Feature' as const,
        properties: {
          route_id: rt.route_id,
          route_name: rt.route_name,
          has_realtime: hasRealtime,
          congestion_score: score,
          avg_speed_kmh: rt.avg_speed_kmh || 0,
          vehicle_count: rt.vehicle_count || 0,
          density: rt.density || (hasRealtime ? 'MODERATE' : 'AWAITING_FEED'),
          color: color,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: rt.coordinates,
        },
      };
    });

    if (map.getSource('traffic-corridors')) {
      (map.getSource('traffic-corridors') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: corridorFeatures,
      });
    } else {
      map.addSource('traffic-corridors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: corridorFeatures,
        },
      });

      map.addLayer({
        id: 'traffic-corridors-line',
        type: 'line',
        source: 'traffic-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: layers.traffic ? 'visible' : 'none',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });

      map.on('click', 'traffic-corridors-line', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        const hasRealtime = Boolean(props.has_realtime);
        new maplibregl.Popup({ offset: 10, className: 'urbaneye-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-xs font-sans p-2 min-w-[210px] bg-slate-950 text-slate-100 rounded-lg border border-slate-800">
              <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
                <span class="font-bold text-white font-mono text-[11px]">Route ${props.route_id} Corridor</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  hasRealtime 
                    ? props.congestion_score >= 85 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : props.congestion_score >= 70 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : props.congestion_score >= 40 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }">
                  ${hasRealtime ? `${props.congestion_score}% CONGESTION` : 'FEED MONITORED'}
                </span>
              </div>
              <p class="text-slate-300 font-medium text-[11px] mb-1.5">${props.route_name}</p>
              <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span class="text-slate-400 block text-[9px]">Speed</span>
                  <span class="${hasRealtime ? 'text-amber-400' : 'text-slate-500'} font-bold">${hasRealtime ? `${props.avg_speed_kmh} km/h` : 'Awaiting'}</span>
                </div>
                <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span class="text-slate-400 block text-[9px]">Condition</span>
                  <span class="text-slate-200 font-bold">${hasRealtime ? `${props.density}` : 'Fleet Corridor'}</span>
                </div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'traffic-corridors-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'traffic-corridors-line', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // 2. Pune Priority Corridors GeoJSON Source (Restrained lines, real geometries)
    const puneAnalytics = calculatePuneRouteAnalytics(events, SEEDED_PUNE_PRIORITY_ROUTES);
    const puneFeatures = puneAnalytics.map((rt) => {
      let color = '#38bdf8'; // Sky blue default
      if (rt.risk_score >= 70) color = '#ef4444';
      else if (rt.risk_score >= 40) color = '#f59e0b';
      else if (rt.event_count > 0) color = '#3b82f6';

      return {
        type: 'Feature' as const,
        properties: {
          route_id: rt.route_id,
          route_name: rt.route_name,
          origin: rt.origin,
          destination: rt.destination,
          city: rt.city,
          jurisdiction: rt.jurisdiction,
          priority_rank: rt.priority_rank,
          risk_score: rt.risk_score,
          event_count: rt.event_count,
          pothole_count: rt.pothole_count,
          waterlogging_count: rt.waterlogging_count,
          damaged_sign_count: rt.damaged_sign_count,
          traffic_event_count: rt.traffic_event_count,
          corroborated_event_count: rt.corroborated_event_count,
          leading_issue_type: rt.leading_issue_type,
          direction: rt.direction || 'BIDIRECTIONAL',
          color: color,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: rt.coordinates,
        },
      };
    });

    if (map.getSource('pune-priority-corridors')) {
      (map.getSource('pune-priority-corridors') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: puneFeatures,
      });
    } else {
      map.addSource('pune-priority-corridors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: puneFeatures,
        },
      });

      // Casing / Glow layer for active selected corridor
      map.addLayer({
        id: 'pune-priority-corridors-glow',
        type: 'line',
        source: 'pune-priority-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: layers.puneRoutes ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#38bdf8',
          'line-width': activeRouteId 
            ? ['case', ['==', ['get', 'route_id'], activeRouteId], 10, 0]
            : 0,
          'line-opacity': 0.35,
          'line-blur': 3,
        },
      });

      // Main corridor line: restrained line weight, clean hierarchy
      map.addLayer({
        id: 'pune-priority-corridors-line',
        type: 'line',
        source: 'pune-priority-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: layers.puneRoutes ? 'visible' : 'none',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': activeRouteId
            ? ['case', ['==', ['get', 'route_id'], activeRouteId], 6, 3.5]
            : 4,
          'line-opacity': activeRouteId
            ? ['case', ['==', ['get', 'route_id'], activeRouteId], 1.0, 0.45]
            : 0.85,
        },
      });

      // Corridor Click: select corridor & open info popup
      map.on('click', 'pune-priority-corridors-line', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        const rId = String(props.route_id);
        
        if (onRouteSelect) onRouteSelect(rId);
        else setRoute(rId);

        new maplibregl.Popup({ offset: 10, className: 'urbaneye-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-xs font-sans p-2 min-w-[220px] bg-slate-950 text-slate-100 rounded-lg border border-slate-800">
              <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
                <span class="font-bold text-white font-mono text-[11px]">Corridor Rt ${props.route_id}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Rank #${props.priority_rank} • PMC
                </span>
              </div>
              <p class="text-slate-100 font-semibold text-xs mb-0.5">${props.route_name}</p>
              <p class="text-[10px] text-slate-400 mb-2">${props.origin} ↔ ${props.destination}</p>
              <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span class="text-slate-400 block text-[9px]">Risk Score</span>
                  <span class="${props.risk_score >= 70 ? 'text-rose-400' : props.risk_score >= 40 ? 'text-amber-400' : 'text-blue-400'} font-bold">${props.risk_score}/100</span>
                </div>
                <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span class="text-slate-400 block text-[9px]">Active Defects</span>
                  <span class="text-white font-bold">${props.event_count}</span>
                </div>
              </div>
              <div class="text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-800/80 font-mono flex justify-between">
                <span>Leading: <strong class="text-slate-200">${props.leading_issue_type || 'Road Surface'}</strong></span>
                <span class="text-emerald-400 font-bold">${props.corroborated_event_count} Verified</span>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'pune-priority-corridors-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'pune-priority-corridors-line', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // 3. PMPML Stops GeoJSON Source
    const stopFeatures: any[] = [];
    SEEDED_PUNE_PRIORITY_ROUTES.forEach((rt) => {
      if (rt.stops) {
        rt.stops.forEach((st) => {
          stopFeatures.push({
            type: 'Feature',
            properties: {
              stop_id: st.stop_id,
              stop_name: st.stop_name,
              sequence: st.sequence,
              route_id: rt.route_id,
              route_name: rt.route_name,
            },
            geometry: {
              type: 'Point',
              coordinates: [st.longitude, st.latitude],
            },
          });
        });
      }
    });

    if (map.getSource('pmpml-stops')) {
      (map.getSource('pmpml-stops') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: stopFeatures,
      });
    } else {
      map.addSource('pmpml-stops', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: stopFeatures,
        },
      });

      map.addLayer({
        id: 'pmpml-stops-circle',
        type: 'circle',
        source: 'pmpml-stops',
        layout: {
          visibility: layers.puneRoutes ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#090d16',
        },
      });

      map.on('click', 'pmpml-stops-circle', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        new maplibregl.Popup({ offset: 8, className: 'urbaneye-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-xs font-sans p-1.5 bg-slate-950 text-slate-100 rounded-lg border border-slate-800">
              <div class="flex items-center gap-1.5 border-b border-slate-800 pb-1 mb-1 font-mono text-[10px] text-cyan-400 font-bold">
                <span>PMPML STOP #${props.sequence}</span>
                <span class="text-slate-400">• Rt ${props.route_id}</span>
              </div>
              <strong class="text-white text-xs block">${props.stop_name}</strong>
              <span class="text-[10px] text-slate-400 block mt-0.5">${props.route_name}</span>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'pmpml-stops-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'pmpml-stops-circle', () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }, [activeRouteId, events, layers.puneRoutes, layers.traffic, onRouteSelect, routes, setRoute]);

  // Initialize Map with OpenFreeMap Vector Basemap
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    setMapError(null);
    let map: maplibregl.Map | null = null;

    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: OPENFREEMAP_STYLES[basemapStyle],
        center: center,
        zoom: zoom,
        minZoom: PUNE_DEFAULT_VIEWPORT.minZoom,
        maxZoom: PUNE_DEFAULT_VIEWPORT.maxZoom,
        maxBounds: PUNE_CITY_BOUNDS,
        attributionControl: false,
      });

      map.on('error', (e) => {
        if (e && (e.error?.message?.includes('WebGL') || e.error?.message?.includes('context') || e.error?.message?.includes('Failed to initialize'))) {
          setMapError('WebGL Context Notice: Hardware acceleration unavailable');
        }
      });
    } catch {
      setMapError('GIS Map Renderer Notice: WebGL hardware acceleration unavailable');
      return;
    }

    // Add minimal navigation & attribution controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: MAP_ATTRIBUTION,
      }),
      'bottom-left'
    );

    map.on('load', () => {
      setupOperationalLayers(map!);
    });

    // Re-add operational layers when basemap vector style switches
    map.on('style.load', () => {
      setupOperationalLayers(map!);
    });

    mapInstance.current = map;
    const markersMap = busMarkersRef.current;

    return () => {
      markersMap.forEach((e) => e.marker.remove());
      markersMap.clear();
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // Toggle basemap style without tearing down the map
  const handleToggleBasemap = (newStyle: BasemapStyleKey) => {
    if (newStyle === basemapStyle) return;
    setBasemapStyle(newStyle);
    const map = mapInstance.current;
    if (!map) return;
    map.setStyle(OPENFREEMAP_STYLES[newStyle]);
  };

  // Update corridor emphasis when activeRouteId changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('pune-priority-corridors-glow')) {
      map.setPaintProperty(
        'pune-priority-corridors-glow',
        'line-width',
        activeRouteId ? ['case', ['==', ['get', 'route_id'], activeRouteId], 10, 0] : 0
      );
    }

    if (map.getLayer('pune-priority-corridors-line')) {
      map.setPaintProperty(
        'pune-priority-corridors-line',
        'line-width',
        activeRouteId ? ['case', ['==', ['get', 'route_id'], activeRouteId], 6, 3.5] : 4
      );
      map.setPaintProperty(
        'pune-priority-corridors-line',
        'line-opacity',
        activeRouteId ? ['case', ['==', ['get', 'route_id'], activeRouteId], 1.0, 0.4] : 0.85
      );
    }
  }, [activeRouteId]);

  // Update Traffic Corridor layer visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('traffic-corridors-line')) {
      map.setLayoutProperty(
        'traffic-corridors-line',
        'visibility',
        layers.traffic ? 'visible' : 'none'
      );
    }
  }, [layers.traffic]);

  // Update Pune Priority Corridor & Stops layer visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('pune-priority-corridors-line')) {
      map.setLayoutProperty(
        'pune-priority-corridors-line',
        'visibility',
        layers.puneRoutes ? 'visible' : 'none'
      );
    }
    if (map.getLayer('pune-priority-corridors-glow')) {
      map.setLayoutProperty(
        'pune-priority-corridors-glow',
        'visibility',
        layers.puneRoutes ? 'visible' : 'none'
      );
    }
    if (map.getLayer('pmpml-stops-circle')) {
      map.setLayoutProperty(
        'pmpml-stops-circle',
        'visibility',
        layers.puneRoutes ? 'visible' : 'none'
      );
    }
  }, [layers.puneRoutes]);

  // Fit bounds to selected route when a specific priority route is active
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (activeRouteId) {
      const targetRoute = SEEDED_PUNE_PRIORITY_ROUTES.find((r) => r.route_id === activeRouteId);
      if (targetRoute && targetRoute.coordinates && targetRoute.coordinates.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        targetRoute.coordinates.forEach((coord) => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, essential: true });
        return;
      }
    }

    // Default Pune center or focusLocation
    const activeFocus = focusLocation || storeFocusLocation;
    if (activeFocus) {
      map.flyTo({ center: activeFocus, zoom: 15, essential: true });
    } else if (onlyPunePriorityRoutes || selectedJurisdiction === 'PMC_PUNE') {
      map.flyTo({ center: PUNE_DEFAULT_VIEWPORT.center, zoom: 12.5, essential: true });
    }
  }, [activeRouteId, focusLocation, storeFocusLocation, onlyPunePriorityRoutes, selectedJurisdiction]);

  // Update Hazard Event Markers (Meaningful Icons, No Traffic Dots)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    events.forEach((evt) => {
      // Strict rule: Traffic is represented ONLY as road segment color, never as individual dots
      if (evt.event_type === 'TRAFFIC') return;

      // Strict layer visibility toggles
      if (evt.event_type === 'POTHOLE' && !layers.potholes) return;
      if (evt.event_type === 'WATERLOGGING' && !layers.waterlogging) return;
      if (evt.event_type === 'DAMAGED_SIGN' && !layers.signs) return;

      // When a corridor is selected, dim or filter non-corridor incidents
      const matchesActiveCorridor = !activeRouteId || evt.route_id === activeRouteId;

      const el = document.createElement('div');
      el.className = `cursor-pointer transition-all duration-200 z-10 hover:scale-125 ${
        matchesActiveCorridor ? 'opacity-100' : 'opacity-35 hover:opacity-100'
      }`;

      // Custom Meaningful SVG Hazard Icons
      let iconSvg = '';
      let markerBorder = 'border-rose-500';
      let markerBg = 'bg-slate-950';
      let iconColor = 'text-rose-400';

      if (evt.event_type === 'POTHOLE') {
        // Road damage crater hazard icon
        iconSvg = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="3"/></svg>`;
        markerBorder = evt.severity === 'CRITICAL' ? 'border-rose-500' : 'border-amber-500';
        iconColor = evt.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400';
      } else if (evt.event_type === 'WATERLOGGING') {
        // Water / flood surge icon
        iconSvg = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
        markerBorder = 'border-cyan-400';
        iconColor = 'text-cyan-400';
      } else if (evt.event_type === 'DAMAGED_SIGN') {
        // Damaged road sign icon
        iconSvg = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        markerBorder = 'border-amber-400';
        iconColor = 'text-amber-400';
      }

      const priorityScore = (evt as any).priority_score;
      const corroborationCount = evt.corroboration_count || 1;

      el.innerHTML = `
        <div class="relative flex items-center justify-center select-none" title="${evt.event_type}: ${evt.location_name || ('Rt ' + evt.route_id)}">
          <div class="w-7 h-7 rounded-lg ${markerBg} ${markerBorder} border-2 ${iconColor} flex items-center justify-center shadow-lg shadow-black/80">
            ${iconSvg}
          </div>
          ${
            priorityScore
              ? `<span class="absolute -top-2 -right-3 bg-slate-900 text-white text-[9px] font-mono font-bold px-1 py-0.2 rounded border border-slate-700 shadow">${Math.round(priorityScore)}</span>`
              : corroborationCount > 1
              ? `<span class="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-mono font-bold w-4 h-4 rounded-full flex items-center justify-center border border-slate-950 shadow">${corroborationCount}x</span>`
              : ''
          }
        </div>
      `;

      el.addEventListener('click', () => {
        setSelectedEvent(evt);
        map.flyTo({ center: [evt.longitude, evt.latitude], zoom: Math.max(map.getZoom(), 14.5), essential: true });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([evt.longitude, evt.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [events, layers, activeRouteId, setSelectedEvent]);

  // Update Bus Fleet Markers (Professional Custom Bus Pill Markers: 🚌 [Route Number])
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!layers.buses) {
      busMarkersRef.current.forEach((entry) => entry.marker.remove());
      busMarkersRef.current.clear();
      return;
    }

    const currentIds = new Set(fleetToRender.map((b) => b.bus_id));

    // Remove markers for buses no longer in monitored fleet
    for (const [id, entry] of busMarkersRef.current.entries()) {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        busMarkersRef.current.delete(id);
      }
    }

    fleetToRender.forEach((bus) => {
      const isDepot = !!bus.near_depot;
      const routeNum = bus.route_number || bus.route_id || 'PMPML';
      const isLiveFeed = bus.source === 'PMPML_LIVE';

      const title = `PMPML Bus #${bus.bus_id} (Rt ${routeNum}) — ${isDepot ? 'In Depot' : 'Running'}`;

      const popupHtml = `
        <div class="text-xs font-sans p-2 min-w-[210px] bg-slate-950 text-slate-100 rounded-lg border border-slate-800">
          <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 mb-1.5">
            <span class="font-bold text-white font-mono text-[11px]">Bus #${bus.bus_id}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              isDepot 
                ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }">
              ${isDepot ? 'IN DEPOT' : 'RUNNING'}
            </span>
          </div>
          <div class="text-sky-400 font-mono font-bold text-xs">
            Route ${routeNum}
          </div>
          <div class="text-slate-300 font-medium text-[11px] leading-tight mt-0.5 truncate">
            ${bus.route_name || ('Corridor #' + routeNum)}
          </div>
          <div class="text-slate-400 text-[10px] font-mono mt-1.5">
            ${bus.latitude.toFixed(5)}°N, ${bus.longitude.toFixed(5)}°E
          </div>
          <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono mt-2">
            <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
              <span class="text-slate-400 block text-[9px]">Status</span>
              <span class="text-slate-200 font-bold">${isDepot ? 'Depot' : 'Active Transit'}</span>
            </div>
            <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
              <span class="text-slate-400 block text-[9px]">Feed</span>
              <span class="${isLiveFeed ? 'text-emerald-400' : 'text-amber-400'} font-bold">
                ${isLiveFeed ? 'PMPML Live' : 'Demo Sim'}
              </span>
            </div>
          </div>
        </div>
      `;

      // Professional Custom Bus Marker HTML (Bus Icon + Small Route Number)
      const markerHtml = isDepot ? `
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#090d16]/90 border border-slate-700 text-slate-400 font-mono text-[9px] font-semibold shadow-md opacity-75 hover:opacity-100 transition-opacity">
          <svg class="w-3 h-3 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
          <span>${routeNum}</span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
        </div>
      ` : `
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#090d16] border border-sky-500/80 text-white font-mono text-[10px] font-bold shadow-lg shadow-sky-950/60 hover:scale-110 transition-transform">
          <svg class="w-3 h-3 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
          <span class="text-sky-200">${routeNum}</span>
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        </div>
      `;

      const existing = busMarkersRef.current.get(bus.bus_id);
      if (existing) {
        existing.marker.setLngLat([bus.longitude, bus.latitude]);
        existing.popup.setHTML(popupHtml);
        existing.el.title = title;
        existing.el.innerHTML = markerHtml;
      } else {
        const el = document.createElement('div');
        el.className = 'cursor-pointer select-none';
        el.title = title;
        el.innerHTML = markerHtml;

        const popup = new maplibregl.Popup({ offset: 12, className: 'urbaneye-popup' }).setHTML(popupHtml);

        el.addEventListener('click', () => {
          setSelectedBus(bus);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([bus.longitude, bus.latitude])
          .setPopup(popup)
          .addTo(map);

        busMarkersRef.current.set(bus.bus_id, { marker, popup, el });
      }
    });
  }, [fleetToRender, layers.buses, setSelectedBus]);

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] ${className}`}>
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Map Load / WebGL Error Fallback */}
      {mapError && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
          <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            GIS Map Stream Notice
          </h4>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            {mapError}. Spatial hazard telemetry and road inspection data remain fully operational.
          </p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all font-mono shadow-md"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry GIS Initialization
          </button>
        </div>
      )}

      {/* Top Right Controls: Reset View + Open Full Map */}
      <div className="absolute top-3 right-12 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={handleResetView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#090d16] hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/80 text-[11px] font-mono font-semibold shadow-2xl transition-all cursor-pointer select-none"
          title="Reset map view to Pune Municipal Swargate centroid"
        >
          <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">RESET VIEW</span>
        </button>

        {!isFullscreen && (
          <button
            type="button"
            onClick={handleOpenFullMap}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#090d16] hover:bg-slate-900 text-slate-200 hover:text-white border border-slate-700/80 text-[11px] font-mono font-semibold shadow-2xl transition-all cursor-pointer select-none"
            title="Open complete GIS map in dedicated full-screen tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
            <span>FULL GIS</span>
          </button>
        )}
      </div>

      {/* Floating Map Controls Panel (Solid Opaque Control Room UI) */}
      {showLayerControls && (
        <div className="absolute top-3 left-3 bg-[#090d16] border border-slate-700/90 rounded-xl p-3 shadow-2xl shadow-black/90 text-xs space-y-2.5 z-30 min-w-[220px] pointer-events-auto select-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" /> Map Controls
            </span>
            <span className="text-[9px] font-mono text-slate-500">PMC OPS</span>
          </div>

          {/* Basemap Vector Style Switcher (Fiord vs Dark) */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Vector Basemap:</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleToggleBasemap('fiord')}
                className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all border ${
                  basemapStyle === 'fiord'
                    ? 'bg-sky-600/20 text-sky-300 border-sky-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {basemapStyle === 'fiord' && <Check className="w-3 h-3 text-sky-400" />}
                <span>Fiord (Blue)</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleBasemap('dark')}
                className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all border ${
                  basemapStyle === 'dark'
                    ? 'bg-sky-600/20 text-sky-300 border-sky-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {basemapStyle === 'dark' && <Check className="w-3 h-3 text-sky-400" />}
                <span>Dark</span>
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Layer Checkboxes */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <BusIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>PMPML Buses ({fleetToRender.length})</span>
              </span>
              <input
                type="checkbox"
                checked={layers.buses}
                onChange={(e) => setLayers({ ...layers, buses: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <RouteIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>Priority Routes (7)</span>
              </span>
              <input
                type="checkbox"
                checked={layers.puneRoutes}
                onChange={(e) => setLayers({ ...layers, puneRoutes: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <Car className="w-3.5 h-3.5 text-amber-400" />
                <span>Traffic Corridors</span>
              </span>
              <input
                type="checkbox"
                checked={layers.traffic}
                onChange={(e) => setLayers({ ...layers, traffic: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Potholes</span>
              </span>
              <input
                type="checkbox"
                checked={layers.potholes}
                onChange={(e) => setLayers({ ...layers, potholes: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                <span>Waterlogging</span>
              </span>
              <input
                type="checkbox"
                checked={layers.waterlogging}
                onChange={(e) => setLayers({ ...layers, waterlogging: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-slate-300 hover:text-white cursor-pointer py-0.5 select-none">
              <span className="flex items-center gap-2">
                <OctagonAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Damaged Signs</span>
              </span>
              <input
                type="checkbox"
                checked={layers.signs}
                onChange={(e) => setLayers({ ...layers, signs: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Professional Municipal Operations Map Legend (Bottom Right) */}
      <div className="absolute bottom-3 right-3 bg-[#090d16] border border-slate-700/90 rounded-xl px-3 py-2 text-[10px] font-mono text-slate-300 z-30 flex flex-wrap items-center gap-3 shadow-2xl shadow-black/90 select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-sky-300" />
          <span>PMPML Bus</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Telemetry</span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 rounded-sm bg-emerald-500" />
          <span>Free Flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 rounded-sm bg-amber-400" />
          <span>Moderate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 rounded-sm bg-orange-400" />
          <span>Heavy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 rounded-sm bg-rose-500" />
          <span>Gridlock</span>
        </div>
      </div>
    </div>
  );
};
