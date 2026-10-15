/** Colour themes for the route, marker and overlay accents. Our own palette. */
export interface Theme {
  id: string;
  name: string;
  /** Route and marker colour. */
  route: string;
  /** Accent for overlay numbers and the profile. */
  accent: string;
}

export const THEMES = [
  { id: 'sunset', name: 'Sunset', route: '#f97316', accent: '#fb923c' },
  { id: 'glacier', name: 'Glacier', route: '#0ea5e9', accent: '#38bdf8' },
  { id: 'forest', name: 'Forest', route: '#16a34a', accent: '#4ade80' },
  { id: 'neon', name: 'Neon', route: '#d946ef', accent: '#e879f9' },
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]['id'];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Low-to-high colour ramp for speed, heart rate and elevation (blue, green, yellow, orange, red). */
export const VALUE_RAMP = ['#2563eb', '#10b981', '#facc15', '#f97316', '#dc2626'] as const;
