import { UrbanEyeEvent, BusTelemetry, BusRoute, WardSummary, SystemKPIs, EventStatus } from '../types/events';
import { MOCK_EVENTS, MOCK_WARDS, MOCK_SYSTEM_KPIS } from './mockData';
import { SEEDED_PUNE_PRIORITY_ROUTES } from './puneRoutes';

const PROD_BACKEND_URL = 'https://urbaneye-backend-by2p.onrender.com/api/v1';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000/api/v1'
    : PROD_BACKEND_URL);

export class UrbanEyeApiService {
  private static isLiveBackendAvailable: boolean = false;

  public static async getKPIs(): Promise<SystemKPIs> {
    if (!this.isLiveBackendAvailable) {
      return Promise.resolve({ ...MOCK_SYSTEM_KPIS });
    }
    try {
      const res = await fetch(`${API_BASE_URL}/analytics/kpis`);
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch {
      return Promise.resolve({ ...MOCK_SYSTEM_KPIS });
    }
  }

  public static async getEvents(): Promise<UrbanEyeEvent[]> {
    if (!this.isLiveBackendAvailable) {
      return Promise.resolve([...MOCK_EVENTS]);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/events`);
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch {
      return Promise.resolve([...MOCK_EVENTS]);
    }
  }

  public static async getFleet(): Promise<BusTelemetry[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/fleet/live`);
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      return Array.isArray(data) ? data : (data.vehicles || []);
    } catch {
      return Promise.resolve([]);
    }
  }

  public static async getLiveFeedSnapshot(): Promise<{
    source: string;
    status: 'LIVE' | 'STALE' | 'UNAVAILABLE';
    last_update: number | null;
    raw_bus_count: number;
    valid_bus_count: number;
    vehicles: BusTelemetry[];
  } | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/fleet/live`);
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch {
      return null;
    }
  }

  public static async getRoutes(): Promise<BusRoute[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/fleet/routes`);
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      return Array.isArray(data) && data.length > 0 ? data : ([...SEEDED_PUNE_PRIORITY_ROUTES] as unknown as BusRoute[]);
    } catch {
      return Promise.resolve([...SEEDED_PUNE_PRIORITY_ROUTES] as unknown as BusRoute[]);
    }
  }

  public static async getWards(): Promise<WardSummary[]> {
    if (!this.isLiveBackendAvailable) {
      return Promise.resolve([...MOCK_WARDS]);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/analytics/wards`);
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch {
      return Promise.resolve([...MOCK_WARDS]);
    }
  }

  public static async updateEventStatus(
    eventId: string,
    status: EventStatus,
    ticketId?: string,
    department?: 'PWD' | 'TRAFFIC_POLICE' | 'DRAINAGE_BOARD'
  ): Promise<{ success: boolean; event_id: string; status: EventStatus }> {
    if (!this.isLiveBackendAvailable) {
      return Promise.resolve({ success: true, event_id: eventId, status });
    }
    try {
      const res = await fetch(`${API_BASE_URL}/events/${eventId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ticket_id: ticketId, assigned_department: department }),
      });
      if (!res.ok) throw new Error('Status update failed');
      return await res.json();
    } catch {
      return Promise.resolve({ success: true, event_id: eventId, status });
    }
  }
}
