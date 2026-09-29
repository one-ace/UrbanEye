import React, { useState, useMemo } from 'react';
import { MapLibreMap } from '../components/gis/MapLibreMap';
import { UrbanEyeSearch } from '../components/common/UrbanEyeSearch';
import { StatusBadge } from '../components/common/StatusBadge';
import { Skeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { useEventStore } from '../store/useEventStore';
import { useCorroboratedEvents } from '../store/corroborationSelectors';
import { usePrioritizedEvents } from '../store/priorityEngine';
import { useFleetStore } from '../store/useFleetStore';
import { useFilterStore } from '../store/useFilterStore';
import { 
  Bus, 
  Activity, 
  Layers, 
  X, 
  Inbox, 
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { getEventTypeLabel } from '../lib/utils';
import { getCalculatedPuneWards, getWardHealthStatus } from '../store/analyticsSelectors';
import { useFilteredPmpmlFleet, calculateSensingCoverage } from '../utils/puneRouteMatcher';
import { SEEDED_PUNE_PRIORITY_ROUTES } from '../services/puneRoutes';

export const LiveGIS: React.FC = () => {
  const { events: rawEvents, setSelectedEvent, isLoading: isEventsLoading } = useEventStore();
  const corroboratedEvents = useCorroboratedEvents(rawEvents);
  const events = usePrioritizedEvents(corroboratedEvents);
  const { wards, fleet, isLoading: isFleetLoading, feedStatus } = useFleetStore();
  
  const { 
    selectedWard, 
    setWard, 
    selectedEventTypes, 
    selectedSeverities, 
    onlyCorroborated, 
    searchQuery,
    selectedRoute,
    onlyPunePriorityRoutes,
    setRoute,
    focusLocation,
    setFocusLocation
  } = useFilterStore();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Active corridor selection
  const activeRouteId = selectedRoute !== 'ALL' ? selectedRoute : null;
  const monitoredFleet = useFilteredPmpmlFleet(fleet, activeRouteId);
  const { coveredCount, totalCorridors } = calculateSensingCoverage(monitoredFleet);
  const isLoading = isEventsLoading || isFleetLoading;

  const displayWards = useMemo(() => {
    if (wards && wards.length > 0) return wards;
    return getCalculatedPuneWards(events);
  }, [wards, events]);

  const PUNE_ROUTE_IDS = SEEDED_PUNE_PRIORITY_ROUTES.map((r) => r.route_id);

  // Filter events according to global criteria
  const filteredEvents = events.filter((e) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = e.event_id.toLowerCase().includes(q);
      const matchLoc = e.location_name?.toLowerCase().includes(q);
      const matchBus = e.bus_id.toLowerCase().includes(q);
      const matchRoute = e.route_id.toLowerCase().includes(q);
      const matchType = e.event_type.toLowerCase().includes(q);
      if (!matchId && !matchLoc && !matchBus && !matchRoute && !matchType) return false;
    }
    if (!selectedEventTypes.includes(e.event_type)) return false;
    if (!selectedSeverities.includes(e.severity)) return false;
    if (selectedWard !== 'ALL' && e.ward_id !== selectedWard) return false;
    if (selectedRoute !== 'ALL') {
      const eRoute = (e.route_id || '').toLowerCase();
      if (!eRoute.includes(selectedRoute.toLowerCase())) return false;
    }
    if (onlyPunePriorityRoutes) {
      const isPune = PUNE_ROUTE_IDS.some((id) => (e.route_id || '').toLowerCase().includes(id.toLowerCase()));
      if (!isPune) return false;
    }
    if (onlyCorroborated && e.corroboration_count < 2) return false;
    return true;
  });

  const handleSelectEvent = (evt: typeof events[0]) => {
    setSelectedEvent(evt);
    setFocusLocation([evt.longitude, evt.latitude]);
  };

  const handleSelectCorridor = (routeId: string | null) => {
    if (!routeId || routeId === 'ALL') {
      setRoute('ALL');
      setFocusLocation(null);
      return;
    }
    setRoute(routeId);
    const targetRoute = SEEDED_PUNE_PRIORITY_ROUTES.find((r) => r.route_id === routeId);
    if (targetRoute && targetRoute.coordinates && targetRoute.coordinates.length > 0) {
      const midIdx = Math.floor(targetRoute.coordinates.length / 2);
      setFocusLocation(targetRoute.coordinates[midIdx]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] w-full overflow-hidden space-y-2.5">
      {/* 1. Slim Municipal Command Header & Integrated Operational Bar */}
      <div className="bg-[#090d16] border border-slate-800/90 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 shadow-lg select-none shrink-0">
        {/* Left: Branding & Realtime Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              URBANEYE CITY OPERATIONS MAP
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
              PMC PUNE
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Real Feed Connection Status Badge */}
          <div className="flex items-center gap-2">
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
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                DEMO SIM FEED
              </span>
            )}

            {/* Fleet & Incident Metric Pills */}
            <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300">
              <Bus className="w-3 h-3 text-sky-400" />
              <span>
                <strong className="text-white">{monitoredFleet.length}</strong> Buses ({coveredCount}/{totalCorridors} Corridors)
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              <span>
                <strong className="text-white">{filteredEvents.length}</strong> Active Incidents
              </span>
            </div>
          </div>
        </div>

        {/* Right: Integrated Search + 7 Corridors Filter + Side Inspector Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Integrated UrbanEye Map Search */}
          <UrbanEyeSearch
            variant="compact"
            className="w-56 sm:w-64"
            placeholder="Search ID, route, bus, location..."
          />

          {/* 7 Corridors Selector Chips */}
          <div className="hidden xl:flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
            <span className="text-[9px] font-mono uppercase text-slate-400 px-1">Route:</span>
            <button
              type="button"
              onClick={() => handleSelectCorridor('ALL')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                selectedRoute === 'ALL'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL
            </button>
            {SEEDED_PUNE_PRIORITY_ROUTES.map((r) => (
              <button
                key={r.route_id}
                type="button"
                onClick={() => handleSelectCorridor(r.route_id)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  selectedRoute === r.route_id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={r.route_name}
              >
                {r.route_id}
              </button>
            ))}
          </div>

          {/* Side Drawer Toggle (Wards & Incidents Inspector) */}
          <button
            type="button"
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-semibold transition-all select-none ${
              isInspectorOpen
                ? 'bg-sky-600/20 text-sky-300 border-sky-500/50'
                : 'bg-slate-900 text-slate-300 hover:text-white border-slate-700/80 hover:bg-slate-850'
            }`}
            title="Toggle Ward Health Index and Visible Detections panel"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">INSPECTOR</span>
            <span className="bg-slate-800 text-slate-300 px-1 py-0.2 rounded text-[9px]">
              {filteredEvents.length}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Map-First Operations Viewport (Occupies 88-95% of screen area) */}
      <div className="relative flex-1 w-full rounded-xl overflow-hidden border border-slate-800 bg-[#090d16]">
        <MapLibreMap
          events={filteredEvents}
          fleet={monitoredFleet}
          className="w-full h-full rounded-xl border-0"
          showLayerControls={true}
          focusLocation={focusLocation}
          selectedRouteId={activeRouteId}
          onRouteSelect={handleSelectCorridor}
        />

        {/* 3. Floating Slide-Over Inspector (Non-disruptive, preserves map space) */}
        {isInspectorOpen && (
          <div className="absolute top-3 right-3 bottom-14 w-80 sm:w-96 bg-[#090d16]/95 backdrop-blur-md border border-slate-700/90 rounded-xl p-4 shadow-2xl z-40 flex flex-col space-y-3.5 animate-in slide-in-from-right duration-200">
            {/* Inspector Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-400" /> Operational Inspector
                </h3>
                <p className="text-[10px] text-slate-400">Ward Scoring & Visible Detections</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInspectorOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ward Road Health Index */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 pb-1">
                <span>WARD HEALTH INDEX</span>
                <span className="text-[9px] text-slate-500">6 PMC ZONES</span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {isLoading && displayWards.length === 0 ? (
                  <>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </>
                ) : (
                  displayWards.map((w, idx) => {
                    const isSelected = selectedWard === w.ward_id;
                    const statusInfo = getWardHealthStatus(w.health_score);
                    return (
                      <div
                        key={w.ward_id}
                        onClick={() => setWard(isSelected ? 'ALL' : w.ward_id)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-sky-600/15 border-sky-500/40 text-white'
                            : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] text-slate-500 font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-slate-200 truncate text-[11px]">
                              {w.ward_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                            <span className={`font-bold ${statusInfo.color}`}>
                              {w.health_score}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded border ${statusInfo.badgeClass} text-[9px]`}>
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="h-px bg-slate-800" />

            {/* Active Detections List */}
            <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 pb-1">
                <span>ACTIVE DETECTIONS ({filteredEvents.length})</span>
                <span className="text-[9px] text-slate-500">CLICK TO ZOOM</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[140px]">
                {filteredEvents.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    <EmptyState
                      icon={Inbox}
                      title="No active detections"
                      description="Relax filter criteria or select another corridor."
                      className="border-0 bg-transparent p-2"
                    />
                  </div>
                ) : (
                  filteredEvents.map((evt) => (
                    <div
                      key={evt.event_id}
                      onClick={() => handleSelectEvent(evt)}
                      className="p-2 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs transition-all flex items-center justify-between gap-2 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] text-white font-semibold group-hover:text-sky-400">
                            {evt.event_id}
                          </span>
                          <StatusBadge severity={evt.severity} size="sm" />
                          {evt.corroboration_count > 1 && (
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                              {evt.corroboration_count}x Bus
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 truncate mt-0.5">
                          {evt.location_name || `${getEventTypeLabel(evt.event_type)} on Rt ${evt.route_id}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[11px] font-bold text-slate-300">
                          {Math.round(evt.priority_score)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
