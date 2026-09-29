import { UrbanEyeEvent, BusTelemetry } from '../types/events';
import { normalizeRawEvent } from '../utils/eventNormalizer';

export type ConnectionStatus = 'OFFLINE' | 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'DEMO';

type EventCallback = (event: UrbanEyeEvent) => void;
type FleetCallback = (fleetData: { status: string, last_update: number, vehicles: BusTelemetry[] }) => void;
type StatusCallback = (status: ConnectionStatus) => void;

const PROD_WS_URL = 'wss://urbaneye-backend-by2p.onrender.com/ws/live';

const getDefaultWsUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'ws://localhost:8000/ws/live';
  }
  return PROD_WS_URL;
};

class UrbanEyeWebSocketService {
  private socket: WebSocket | null = null;
  private eventListeners: Set<EventCallback> = new Set();
  private fleetListeners: Set<FleetCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private currentStatus: ConnectionStatus = 'OFFLINE';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 6;
  private readonly baseReconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 16000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private serverUrl: string = getDefaultWsUrl();
  private isExplicitDisconnect: boolean = false;

  public connect(url?: string): void {
    const targetUrl = url || getDefaultWsUrl();
    this.serverUrl = targetUrl;
    this.isExplicitDisconnect = false;

    if (this.currentStatus === 'DEMO') {
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');
      this.socket = new WebSocket(targetUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        if (this.currentStatus !== 'DEMO') {
          this.setStatus('LIVE');
        }
      };

      this.socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload.type === 'EVENT' && payload.data) {
            const normalized = normalizeRawEvent(payload.data);
            if (normalized) {
              this.notifyEvent(normalized);
            }
          } else if (payload.type === 'FLEET_UPDATE' && payload.data) {
            this.notifyFleet(payload.data);
          }
        } catch {
          // Parse error ignored
        }
      };

      this.socket.onclose = () => {
        this.handleDisconnect();
      };

      this.socket.onerror = () => {
        this.handleDisconnect();
      };
    } catch {
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    if (this.currentStatus === 'DEMO' || this.isExplicitDisconnect) return;

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
      const delay = Math.min(
        this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts),
        this.maxReconnectDelayMs
      );
      this.reconnectAttempts++;
      this.setStatus('RECONNECTING');

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(this.serverUrl);
      }, delay);
      return;
    }

    this.setStatus('OFFLINE');
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    if (this.currentStatus !== 'DEMO') {
      this.setStatus('OFFLINE');
    }
  }

  // Direct injection for SimulationEngine
  public simulateEvent(event: UrbanEyeEvent): void {
    this.notifyEvent(event);
  }

  public simulateFleetUpdate(fleet: BusTelemetry[]): void {
    // Wrap the raw array in the expected backend object structure for the DEMO
    this.notifyFleet({
      status: 'LIVE',
      last_update: Date.now(),
      vehicles: fleet
    });
  }

  public setDemoMode(active: boolean): void {
    if (active) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.setStatus('DEMO');
    } else {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.setStatus('LIVE');
      } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        this.setStatus('CONNECTING');
      } else {
        this.setStatus('OFFLINE');
      }
    }
  }

  public onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  public onFleet(callback: FleetCallback): () => void {
    this.fleetListeners.add(callback);
    return () => this.fleetListeners.delete(callback);
  }

  public onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.currentStatus);
    return () => this.statusListeners.delete(callback);
  }

  private notifyEvent(event: UrbanEyeEvent): void {
    this.eventListeners.forEach((listener) => listener(event));
  }

  private notifyFleet(fleetData: { status: string, last_update: number, vehicles: BusTelemetry[] }): void {
    this.fleetListeners.forEach((listener) => listener(fleetData));
  }

  private setStatus(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const webSocketService = new UrbanEyeWebSocketService();
