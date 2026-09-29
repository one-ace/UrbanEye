/**
 * URBANEYE — Centralized GIS Map Configuration
 * Real Pune Municipal Corporation (PMC) Basemap Configuration
 * 
 * Provider: OpenFreeMap vector tiles (OpenStreetMap data)
 * Styles: Fiord (Nordic Slate Dark Operations) & Dark (Charcoal Neutral)
 * Legal Attribution: © OpenFreeMap © OpenStreetMap contributors
 */

export const PUNE_DEFAULT_VIEWPORT = {
  center: [73.8567, 18.5204] as [number, number], // Pune PMC Centroid (Shivajinagar/Swargate axis)
  zoom: 12.5,
  minZoom: 9,
  maxZoom: 19,
  pitch: 0,
  bearing: 0,
};

export const PUNE_CITY_BOUNDS: [[number, number], [number, number]] = [
  [73.65, 18.35], // Southwest coordinates [lng, lat]
  [74.10, 18.75], // Northeast coordinates [lng, lat]
];

export const MAP_ATTRIBUTION = 
  '&copy; <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export type BasemapStyleKey = 'fiord' | 'dark';

export const OPENFREEMAP_STYLES: Record<BasemapStyleKey, string> = {
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

// Fiord is the primary operational default: deep slate/navy palette provides optimal contrast
export const DEFAULT_BASEMAP_KEY: BasemapStyleKey = 'fiord';
export const PUNE_BASEMAP_STYLE = OPENFREEMAP_STYLES.fiord;

