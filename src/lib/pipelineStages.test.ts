import { describe, expect, it } from 'vitest';
import { gateStages, normalizeStages, resolveStageStatus } from './pipelineStages';

describe('normalizeStages', () => {
  it('passes valid arrays through with statuses validated', () => {
    const out = normalizeStages([
      { name: 'Build', status: 'success', durationMs: 100 },
      { name: 'Deploy', status: 'bogus', durationMs: 'x' },
    ]);
    expect(out).toEqual([
      { name: 'Build', status: 'success', durationMs: 100 },
      { name: 'Deploy', status: 'pending', durationMs: 0 },
    ]);
  });

  it('parses JSON strings (text columns)', () => {
    const out = normalizeStages('[{"name":"Build","status":"success","durationMs":5}]');
    expect(out).toEqual([{ name: 'Build', status: 'success', durationMs: 5 }]);
  });

  it('never throws on garbage input', () => {
    for (const bad of [undefined, null, 42, 'not-json{{{', '{"a":1}', [null, 7, 'x', {}]]) {
      expect(normalizeStages(bad)).toEqual([]);
    }
    // nameless entries are dropped, never crash
    expect(normalizeStages([{ status: 'success' }, { name: 5 }])).toEqual([]);
  });
});

describe('gateStages', () => {
  it('preserves every success before a failure and pends everything after', () => {
    const out = gateStages([
      { name: 'build', status: 'success' },
      { name: 'security', status: 'success' },
      { name: 'test', status: 'failed' },
      { name: 'deploy', status: 'success' },
    ]);
    expect(out.map(s => s.status)).toEqual(['success', 'success', 'failed', 'pending']);
  });

  it('treats running as blocking like failed', () => {
    const out = gateStages([
      { name: 'build', status: 'running' },
      { name: 'deploy', status: 'success' },
    ]);
    expect(out.map(s => s.status)).toEqual(['running', 'pending']);
  });

  it('leaves all-green runs untouched', () => {
    const input = [
      { name: 'build', status: 'success' },
      { name: 'deploy', status: 'success' },
    ];
    expect(gateStages(input).map(s => s.status)).toEqual(['success', 'success']);
  });
});

describe('resolveStageStatus', () => {
  const map = new Map([['build', 'success']]);

  it('reads the map case-insensitively via caller keys', () => {
    expect(resolveStageStatus('Build', map, false)).toBe('success');
    expect(resolveStageStatus('Deploy', map, false)).toBe('pending');
  });

  it('forces deploy pending without a provider', () => {
    expect(resolveStageStatus('Deploy', new Map([['deploy', 'failed']]), true)).toBe('pending');
    expect(resolveStageStatus('Deploy', new Map([['deploy', 'failed']]), false)).toBe('failed');
    // non-deploy stages ignore the override
    expect(resolveStageStatus('Build', new Map([['build', 'failed']]), true)).toBe('failed');
  });
});
