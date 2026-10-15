export type Mode = 'today' | 'three' | 'seven' | 'balanced' | 'custom';
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  canonical: string;
  domain: string;
  ancestors: string[];
}
export interface Folder {
  id: string;
  title: string;
  depth: number;
  count: number;
}
export interface BookmarkSnapshot {
  bookmarks: Bookmark[];
  folders: Folder[];
  updatedAt: number;
  blocked: number;
}
export interface Activity {
  today: number;
  previous2: number;
  previous4: number;
}
export interface ActivityCache {
  key: string;
  day: number;
  updatedAt: number;
  revision: string;
  entries: Record<string, Activity>;
  domains: Record<string, Activity>;
  status: 'ready' | 'partial' | 'unavailable';
  message?: string;
}
export interface Position {
  x: number;
  y: number;
  manual?: boolean;
}
export interface Override {
  color?: string;
  size?: number;
  pinned?: boolean;
}
export interface FolderSchedule {
  start: string;
  end: string;
  /** Local weekdays, 0 = Sunday. Overnight windows belong to their starting day. */
  days: number[];
}
export interface FolderRule {
  mode: 'auto' | 'show' | 'hide';
  schedule?: FolderSchedule;
  color?: string;
}
export interface HeaderSettings {
  rotate: boolean;
  scheduled: boolean;
  workStart: string;
  workEnd: string;
  workQuotes: string[];
  leisureQuotes: string[];
  fixedQuote: string;
}
export interface Settings {
  header: HeaderSettings;
  onboarded: boolean;
  folderIds: string[];
  folderRules: Record<string, FolderRule>;
  hiddenIds: string[];
  grouping: boolean;
  mode: Mode;
  weights: [number, number, number];
  autoResize: boolean;
  theme: 'dark' | 'light' | 'auto';
  background: 'aurora' | 'dusk' | 'solid' | 'image';
  backgroundColor: string;
  backgroundImage: string;
  glass: number;
  blur: number;
  colorIntensity: number;
  faviconScale: number;
  labels: 'auto' | 'always' | 'hover';
  minSize: number;
  maxSize: number;
  spacing: number;
  motion: boolean;
  floatIntensity: number;
  physics: number;
  attraction: number;
}
export interface Preferences {
  defaultsVersion: 2;
  settings: Settings;
  overrides: Record<string, Override>;
  positions: Record<string, Position>;
}
export interface BubbleEntry {
  id: string;
  title: string;
  url: string;
  domain: string;
  members: Bookmark[];
  activity: Activity;
  score: number;
  size: number;
  pinned: boolean;
  color?: string;
  folderColor?: string;
}
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  size: number;
}
export interface LayoutResult {
  nodes: LayoutNode[];
  overflow: string[];
}
export const EMPTY_ACTIVITY: Activity = {
  today: 0,
  previous2: 0,
  previous4: 0,
};
