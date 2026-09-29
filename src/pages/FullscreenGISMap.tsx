import React, { useEffect, useState } from 'react';
import { MapLibreMap } from '../components/gis/MapLibreMap';
import { EventDrawer } from '../components/common/EventDrawer';
import { BusDrawer } from '../components/common/BusDrawer';
import { UrbanEyeSearch } from '../components/common/UrbanEyeSearch';
import { useEventStore } from '../store/useEventStore';
import { useFleetStore } from '../store/useFleetStore';
import { webSocketService } from '../services/websocket';
import { usePrioritizedEvents } from '../store/priorityEngine';
import { useCorroboratedEvents } from '../store/corroborationSelectors';
import { useFilterStore } from '../store/useFilterStore';
import { SEEDED_PUNE_PRIORITY_ROUTES } from '../services/puneRoutes';
import { useFilteredPmpmlFleet, calculateSensingCoverage } from '../utils/puneRouteMatcher';
import { ArrowLeft, Route, Bus, Radio, ShieldAlert } from 'lucide-react';

export const FullscreenGISMap: React.FC = () => {
  const { events: rawEvents, selectedEvent, setSelectedEvent, fetchEvents, initLiveStream } = useEventStore();
  const { fleet, feedStatus, fetchFleetData, selectedBus, setSelectedBus } = useFleetStore();
  const corroboratedEvents = useCorroboratedEvents(rawEvents);
  const events = usePrioritizedEvents(corroboratedEvents);
  const { setRoute, focusLocation, setFocusLocation } = useFilterStore();
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // Standalone tab lifecycle: independently connect to backend REST & WebSocket fleet stream
  useEffect(() => {
    fetchEvents();
    fetchFleetData();

    const unsubEvent = initLiveStream();
    const unsubFleet = webSocketService.onFleet((fleetData) => {
      const store = useFleetStore.getState();
      if (store.fleetMode === 'LIVE') {
        store.setFeedStatus(fleetData.status as any, fleetData.last_update, {
          raw: (fleetData as any).raw_bus_count,
          valid: (fleetData as any).valid_bus_count,
        });
      }
      store.updateFleet(fleetData.vehicles);
    });

    return () => {
      unsubEvent();
      unsubFleet();
    };
  }, [fetchEvents, fetchFleetData, initLiveStream]);

  // Restore route parameter from URL query if present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const routeParam = urlParams.get('route');
    if (routeParam && routeParam !== 'ALL') {
      setActiveRouteId(routeParam);
      setRoute(routeParam);
    }
  }, [setRoute]);

  const handleSelectCorridor = (routeId: string | null) => {
    if (!routeId || routeId === 'ALL') {
      setActiveRouteId(null);
      setRoute('ALL');
      setFocusLocation(null);
      return;
    }
    setActiveRouteId(routeId);
    setRoute(routeId);
    const targetRoute = SEEDED_PUNE_PRIORITY_ROUTES.find((r) => r.route_id === routeId);
    if (targetRoute && targetRoute.coordinates && targetRoute.coordinates.length > 0) {
      const midIdx = Math.floor(targetRoute.coordinates.length / 2);
      setFocusLocation(targetRoute.coordinates[midIdx]);
    }
  };

  const activeRouteObj = SEEDED_PUNE_PRIORITY_ROUTES.find((r) => r.route_id === activeRouteId);

  // Strictly filter fleet to 7 Priority Monitoring Corridors (or single selected corridor)
  const monitoredFleet = useFilteredPmpmlFleet(fleet, activeRouteId);
  const { coveredCount, totalCorridors } = calculateSensingCoverage(monitoredFleet);

  return (
    <div className="h-screen w-screen bg-[#090d16] overflow-hidden relative flex flex-col">
      {/* Top Floating Operational Header */}
      <header className="h-12 bg-[#090d16] border-b border-slate-800 px-4 flex items-center justify-between text-xs z-30 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors font-mono"
            title="Return to URBANEYE Command Center"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </a>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-wider font-mono uppercase text-[11px]">
              URBANEYE CITY OPERATIONS MAP
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
              PMC PUNE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Integrated UrbanEye Map Search */}
          <UrbanEyeSearch
            variant="compact"
            className="w-52 md:w-64"
            placeholder="Search ID, route, bus, location..."
          />

          {/* Real PMPML Feed Connection Badge */}
          <div className="flex items-center">
            {feedStatus === 'LIVE' ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                PMPML LIVE
              </span>
            ) : feedStatus === 'STALE' ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                PMPML STALE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-amber-400" />
                DEMO SIM FEED
              </span>
            )}
          </div>

          {/* 7 Priority Corridors Bus Telemetry Count */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300">
            <Bus className="w-3 h-3 text-sky-400" />
            <span>
              <strong className="text-white font-bold">{monitoredFleet.length}</strong> Buses ({coveredCount}/{totalCorridors} Corridors)
            </span>
          </div>

          {activeRouteObj && (
            <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300">
              <Route className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold text-white">{activeRouteObj.route_name}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>{events.length} Incidents</span>
          </div>
        </div>
      </header>

      {/* Main Full-Window MapLibre Canvas */}
      <main className="flex-1 w-full h-full relative">
        <MapLibreMap
          events={events}
          fleet={monitoredFleet}
          className="w-full h-full rounded-none border-0"
          showLayerControls={true}
          focusLocation={focusLocation}
          selectedRouteId={activeRouteId}
          onRouteSelect={handleSelectCorridor}
          isFullscreen={true}
        />
      </main>

      {/* Event Drawer Modal */}
      <EventDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      {/* Bus Drawer Modal */}
      <BusDrawer
        bus={selectedBus}
        onClose={() => setSelectedBus(null)}
      />
    </div>
  );
};
