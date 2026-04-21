// src/lib/demo/types.ts
export type TaskState = 'ok' | 'running' | 'queued' | 'blocked';
export type EdgeState = 'active' | 'pending';
export type Edge = [fromId: string, toId: string, state: EdgeState];

export type LaneColor = 'blue' | 'green' | 'pink' | 'teal' | 'orange' | 'muted';
export type TaskColor = LaneColor;
export type ChipColor = 'default' | 'g' | 'r' | 'y' | 'b';
export type TaskGlyph = '◆' | '▶' | '⚠';

export interface I18nString {
  en: string;
  zh: string;
}

export interface Lane {
  color: LaneColor;
  name: I18nString;
  driver: string;           // mono meta line, e.g. 'claude-code · opus'
}

export interface Task {
  id: string;               // unique within sample
  lane: number;             // 0-based index into Sample.lanes
  col: number;              // 0..3
  nudge?: number;           // pixel x-offset for visual breathing room
  color: TaskColor;
  glyph: TaskGlyph;
  title: I18nString;
  driverLine: string;       // bottom meta line, e.g. 'claude-code · sonnet'
  chips?: ChipColor[];      // 0..3 decorative chips
}

export interface Frame {
  tasks: Record<string, TaskState>;
  statusText: Record<string, string>;  // e.g. '✓ 13.6s', '⌛ queued', '🖐 waiting'
  edges: Edge[];
  laneStatus?: Record<number, I18nString>;  // optional override for lane-meta status line
  blockUntilApprove?: boolean;               // if true, autoplay pauses until 'demo:approve' event
}

export interface Sample {
  id: string;
  tabLabel: I18nString;
  filename: string;
  yamlId: string;                           // matches data-yaml-id in DemoYaml.astro
  lanes: Lane[];
  tasks: Task[];
  frames: Frame[];
  frameIntervalMs?: number;                 // default 2600
  interactive?: { taskId: string; kind: 'approve'; autoApproveMs?: number };
}
