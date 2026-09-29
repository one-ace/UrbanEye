import React, { useState } from 'react';
import { X, MapPin, Bus, Clock, ShieldCheck, CheckCircle2, Send, Activity, Ruler, ArrowRight } from 'lucide-react';
import { UrbanEyeEvent } from '../../types/events';
import { StatusBadge } from './StatusBadge';
import { useEventStore } from '../../store/useEventStore';
import { formatTimestamp, getEventTypeLabel, cn } from '../../lib/utils';

interface EventDrawerProps {
  event: UrbanEyeEvent | null;
  onClose: () => void;
}

export const EventDrawer: React.FC<EventDrawerProps> = ({ event, onClose }) => {
  const { updateEventStatus } = useEventStore();
  const [isDispatching, setIsDispatching] = useState(false);
  const [selectedDept, setSelectedDept] = useState<'PWD' | 'TRAFFIC_POLICE' | 'DRAINAGE_BOARD'>('PWD');
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  if (!event) return null;

  const handleDispatch = async () => {
    setIsDispatching(true);
    const ticketId = `${selectedDept}-${event.event_id.replace('EVT-', '').replace('TRF-', '')}`;
    await updateEventStatus(event.event_id, 'DISPATCHED', ticketId, selectedDept);
    setIsDispatching(false);
    setDispatchSuccess(true);
    setTimeout(() => setDispatchSuccess(false), 3000);
  };

  const handleResolve = async () => {
    await updateEventStatus(event.event_id, 'RESOLVED');
  };

  const corroboratingBusesList = event.observing_bus_ids || event.corroborating_buses || [event.bus_id];
  const isCluster = (event as any).is_cluster;
  const memberEvents = (event as any).member_events as UrbanEyeEvent[];
  const prioritized = event as any;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col justify-between shadow-2xl p-6 relative animate-in slide-in-from-right duration-300"
      >
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-white">{event.event_id}</span>
              <StatusBadge severity={event.severity} />
              <StatusBadge status={event.status} />
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Route {event.route_id}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Event Title & Location */}
          <div className="mt-5">
            <span className="text-xs uppercase font-mono tracking-wider text-blue-400 font-semibold">
              {getEventTypeLabel(event.event_type)}
            </span>
            <h2 className="text-lg font-bold text-slate-100 mt-1">
              {event.location_name || `Hazard on Route ${event.route_id}`}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 font-mono">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                {event.latitude.toFixed(5)}° N, {event.longitude.toFixed(5)}° E
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
          </div>

          {/* Municipal Incident Operations Card */}
          <div className="mt-4 bg-[#090d16] border border-slate-800 rounded-xl p-3.5 font-mono text-xs shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white uppercase text-[11px] tracking-wide">
                  {event.event_type}
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  (prioritized.priority_level === 'CRITICAL' || event.severity === 'CRITICAL') && "bg-rose-500/20 text-rose-400 border border-rose-500/30",
                  (prioritized.priority_level === 'HIGH' || event.severity === 'HIGH') && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                  (prioritized.priority_level === 'MEDIUM' || event.severity === 'MEDIUM') && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                  (prioritized.priority_level === 'LOW' || event.severity === 'LOW') && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                )}>
                  {prioritized.priority_level || event.severity} PRIORITY
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                {event.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 text-[9px] uppercase block">Location / Corridor</span>
                <span className="text-white font-semibold truncate block mt-0.5">
                  {event.location_name || 'Pune Municipal Road'}
                </span>
                <span className="text-blue-400 text-[10px] block mt-0.5">
                  Route {event.route_id}
                </span>
              </div>

              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 text-[9px] uppercase block">Detected At</span>
                <span className="text-white font-semibold block mt-0.5">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-slate-400 text-[10px] block mt-0.5">
                  Confidence: <strong className="text-cyan-400">{(event.confidence * 100).toFixed(0)}%</strong>
                </span>
              </div>

              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 text-[9px] uppercase block">Corroboration</span>
                <span className="text-emerald-400 font-bold block mt-0.5">
                  {event.corroboration_count} {event.corroboration_count === 1 ? 'Bus Detection' : 'Buses Verified'}
                </span>
                <span className="text-slate-400 text-[10px] block mt-0.5">
                  Primary Node: #{event.bus_id}
                </span>
              </div>

              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 text-[9px] uppercase block">Recommended Action</span>
                <span className="text-amber-300 font-semibold block mt-0.5 text-[10px] leading-tight">
                  {prioritized.recommended_action || (
                    event.event_type === 'POTHOLE' ? 'Inspect road segment & deploy patch' :
                    event.event_type === 'WATERLOGGING' ? 'Clear storm water drains & deploy pump' :
                    event.event_type === 'DAMAGED_SIGN' ? 'Re-erect & align municipal sign' :
                    'Dispatch traffic patrol'
                  )}
                </span>
              </div>
            </div>
          </div>


          {/* Evidence Camera Image with AI Bounding Box */}
          <div className="mt-5 relative rounded-xl overflow-hidden border border-slate-800 bg-black">
            <img
              src={event.evidence_image}
              alt="AI Detection Evidence"
              className="w-full h-52 object-cover"
            />
            {/* AI Bounding Box Overlay */}
            <div className="absolute inset-0 pointer-events-none p-6 flex items-center justify-center">
              <div className="border-2 border-rose-500 bg-rose-500/10 rounded px-3 py-2 text-rose-400 font-mono text-xs flex flex-col items-start gap-0.5 shadow-lg">
                <span className="bg-rose-600 text-white px-1 py-0.5 rounded text-[10px] font-bold">
                  {event.event_type} {(event.confidence * 100).toFixed(0)}%
                </span>
                {event.estimated_dimensions?.depth_cm && (
                  <span className="text-[10px] text-white">
                    Est. Depth: {event.estimated_dimensions.depth_cm}cm
                  </span>
                )}
              </div>
            </div>

            <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
              Primary Sensing Bus: #{event.bus_id}
            </div>
          </div>

          {/* 4. Multi-Bus Corroboration & Confidence Panel */}
          <div className="mt-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider block font-mono">
                    {event.corroboration_count > 1 ? 'MULTI-BUS CORROBORATED' : 'SINGLE DETECTION'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Spatio-Temporal Verification Window (30m radius)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-emerald-400 block">
                  {event.corroboration_count} {event.corroboration_count === 1 ? 'BUS' : 'BUSES'}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Fleet conf: {(event.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Reporting Buses Chips */}
            <div className="mt-3">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1.5">
                Reporting Fleet Nodes:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {corroboratingBusesList.map((busId) => (
                  <span
                    key={busId}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-200"
                  >
                    <Bus className="w-3 h-3 text-blue-400" />
                    {busId}
                  </span>
                ))}
              </div>
            </div>

            {/* Member Events List (if cluster) */}
            {isCluster && memberEvents && memberEvents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1.5">
                  Member Observations:
                </span>
                <div className="flex flex-col gap-1 text-[10px] font-mono text-slate-400">
                  {memberEvents.map(m => (
                    <div key={m.event_id} className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded">
                      <span>{m.event_id}</span>
                      <span className="text-slate-500">{formatTimestamp(m.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Priority Breakdown & Explanation */}
          <div className="mt-4 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Activity className={cn("w-4 h-4", 
                  prioritized.priority_level === 'CRITICAL' ? 'text-rose-400' :
                  prioritized.priority_level === 'HIGH' ? 'text-amber-400' :
                  prioritized.priority_level === 'MEDIUM' ? 'text-blue-400' : 'text-slate-400'
                )} />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Priority Breakdown
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={cn("font-mono font-bold text-base",
                  prioritized.priority_level === 'CRITICAL' ? 'text-rose-400' :
                  prioritized.priority_level === 'HIGH' ? 'text-amber-400' :
                  prioritized.priority_level === 'MEDIUM' ? 'text-blue-400' : 'text-slate-400'
                )}>{prioritized.priority_level || 'PENDING'}</span>
                <span className="text-[10px] text-slate-500 font-mono">({event.priority_score} pts)</span>
              </div>
            </div>

            <div className="mt-3">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-2">Contributors:</span>
              <ul className="space-y-1.5">
                {prioritized.priority_reasons?.map((reason: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
                {!prioritized.priority_reasons && (
                  <li className="text-xs text-slate-500 italic">Priority engine analysis pending...</li>
                )}
              </ul>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/80">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">Recommended:</span>
              <div className="flex items-start gap-2 text-xs font-medium text-blue-400">
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{prioritized.recommended_action || 'Review event manually'}</span>
              </div>
            </div>
          </div>

          {/* Domain Specific Attributes */}
          {event.event_type === 'TRAFFIC' && event.traffic_details && (
            <div className="mt-4 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-3 flex items-center gap-1.5">
                <Bus className="w-4 h-4" /> Traffic Telemetry Flow
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Vehicles</span>
                  <span className="font-mono text-sm font-bold text-white">
                    {event.traffic_details.vehicle_count}
                  </span>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Avg Speed</span>
                  <span className="font-mono text-sm font-bold text-amber-400">
                    {event.traffic_details.average_speed} km/h
                  </span>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Congestion</span>
                  <span className="font-mono text-sm font-bold text-rose-400">
                    {event.traffic_details.congestion_score.toFixed(1)}%
                  </span>
                </div>
              </div>
              {event.traffic_details.bottleneck_reason && (
                <p className="text-xs text-slate-300 mt-3 pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400 font-medium">Reason: </span>
                  {event.traffic_details.bottleneck_reason}
                </p>
              )}
            </div>
          )}

          {event.estimated_dimensions && (
            <div className="mt-4 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-blue-400" /> Estimated Defect Dimensions
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Length</span>
                  <span className="text-white font-bold">{event.estimated_dimensions.length_cm || '-'} cm</span>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Width</span>
                  <span className="text-white font-bold">{event.estimated_dimensions.width_cm || '-'} cm</span>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Depth</span>
                  <span className="text-rose-400 font-bold">{event.estimated_dimensions.depth_cm || '-'} cm</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action / Dispatch Footer */}
        <div className="mt-8 pt-5 border-t border-slate-800">
          {dispatchSuccess ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl flex items-center gap-2 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4" /> Work order successfully generated and dispatched to municipal portal!
            </div>
          ) : event.status === 'DISPATCHED' ? (
            <div className="space-y-3">
              <div className="bg-purple-500/10 border border-purple-500/30 text-purple-300 p-3 rounded-xl text-xs">
                <span className="font-semibold block mb-1">Ticket #{event.ticket_id || 'PWD-DISPATCHED'}</span>
                Assigned to {event.assigned_department || 'PWD'} • Dispatched on {event.dispatched_at ? formatTimestamp(event.dispatched_at) : 'Today'}
              </div>
              <button
                onClick={handleResolve}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Mark as Resolved by Authority
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Target Dept:</label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value as any)}
                  aria-label="Select Target Municipal Department"
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 flex-1 focus:outline-none focus:border-blue-500"
                >
                  <option value="PWD">Public Works Dept (PWD - Road Repair)</option>
                  <option value="TRAFFIC_POLICE">Traffic Police Control Room</option>
                  <option value="DRAINAGE_BOARD">Municipal Drainage Board</option>

                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDispatch}
                  disabled={isDispatching}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isDispatching ? 'Generating Work Order...' : 'Dispatch Municipal Work Order'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
