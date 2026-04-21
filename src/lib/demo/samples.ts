// src/lib/demo/samples.ts
import type { Sample } from './types';

const smokeTest: Sample = {
  id: 'smoke-test',
  tabLabel: { en: 'Smoke Test', zh: '全链路测试' },
  filename: '.tagma/test-pipeline.yaml',
  yamlId: 'smoke-test',
  lanes: [
    { color: 'blue',  name: { en: 'Backend', zh: '后端' },     driver: 'opencode · big-pickle' },
    { color: 'green', name: { en: 'Ops',     zh: '运维' },     driver: 'shell' },
    { color: 'pink',  name: { en: 'Review',  zh: '审查' },     driver: 'claude-code · opus' },
  ],
  tasks: [
    { id: 't1', lane: 0, col: 0, color: 'teal',   glyph: '◆',
      title: { en: 'Plan the change',      zh: '规划变更' },
      driverLine: 'opencode · opencode/big', chips: ['g', 'r', 'default'] },
    { id: 't2', lane: 0, col: 1, color: 'orange', glyph: '◆',
      title: { en: 'Implement /health',    zh: '实现 /health' },
      driverLine: 'opencode · opencode/big', chips: ['default', 'y', 'r'] },
    { id: 't3', lane: 0, col: 2, color: 'muted',  glyph: '◆',
      title: { en: 'Self-review the diff', zh: '自审 diff' },
      driverLine: 'opencode · opencode/big', chips: ['default', 'default'] },
    { id: 't4', lane: 1, col: 0, color: 'green',  glyph: '▶',
      title: { en: 'Prepare signal dir',   zh: '准备信号目录' },
      driverLine: 'shell · mkdir -p .signals' },
    { id: 't5', lane: 1, col: 1, color: 'green',  glyph: '▶',
      title: { en: 'Wait for signal',      zh: '等待信号' },
      driverLine: 'shell · poll ./signals/done' },
    { id: 't6', lane: 2, col: 3, nudge: 28, color: 'pink', glyph: '◆',
      title: { en: 'Summarize backend run', zh: '汇总本次执行' },
      driverLine: 'claude-code · opus-4.7', chips: ['default', 'b'] },
  ],
  frames: [
    {
      tasks: { t1: 'ok', t2: 'running', t3: 'queued', t4: 'ok', t5: 'ok', t6: 'queued' },
      statusText: { t1: '✓ 13.6s', t2: '▶', t3: '⌛ queued', t4: '✓ 7ms', t5: '✓ 4ms', t6: '⌛ queued' },
      edges: [['t1', 't2', 'active'], ['t2', 't3', 'pending'], ['t4', 't5', 'pending'], ['t3', 't6', 'pending'], ['t5', 't6', 'pending']],
    },
    {
      tasks: { t1: 'ok', t2: 'ok', t3: 'running', t4: 'ok', t5: 'ok', t6: 'queued' },
      statusText: { t1: '✓ 13.6s', t2: '✓ 38.4s', t3: '▶', t4: '✓ 7ms', t5: '✓ 4ms', t6: '⌛ queued' },
      edges: [['t1', 't2', 'pending'], ['t2', 't3', 'active'], ['t4', 't5', 'pending'], ['t3', 't6', 'pending'], ['t5', 't6', 'pending']],
    },
    {
      tasks: { t1: 'ok', t2: 'ok', t3: 'ok', t4: 'ok', t5: 'ok', t6: 'running' },
      statusText: { t1: '✓ 13.6s', t2: '✓ 38.4s', t3: '✓ 21.7s', t4: '✓ 7ms', t5: '✓ 4ms', t6: '▶' },
      edges: [['t1', 't2', 'pending'], ['t2', 't3', 'pending'], ['t4', 't5', 'pending'], ['t3', 't6', 'active'], ['t5', 't6', 'active']],
    },
  ],
};

export const SAMPLES: Sample[] = [smokeTest];
export const DEFAULT_SAMPLE_ID = 'smoke-test';
