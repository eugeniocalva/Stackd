import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock StackdDB
global.window = global;
global.StackdDB = {
  load: vi.fn(),
  save: vi.fn(),
  generateId: vi.fn(() => 'test-id')
};

// Load store.js content
const storePath = path.resolve(__dirname, '../../src/store.js');
const storeCode = fs.readFileSync(storePath, 'utf8');

// Execute store.js in the global context
eval(storeCode);

describe('Period Logic Math', () => {
    const anchorDate = '2026-04-15'; // Wednesday

    it('calculates Today bounds correctly', () => {
        const bounds = window.Store._getPeriodBounds('today', anchorDate);
        expect(bounds.start).toBe('2026-04-15');
        expect(bounds.end).toBe('2026-04-15');
    });

    it('calculates Week bounds correctly (Monday start)', () => {
        // April 15, 2026 is a Wednesday.
        // Monday was April 13. Sunday is April 19.
        const bounds = window.Store._getPeriodBounds('week', anchorDate);
        expect(bounds.start).toBe('2026-04-13');
        expect(bounds.end).toBe('2026-04-19');
    });

    it('calculates Month bounds correctly', () => {
        const bounds = window.Store._getPeriodBounds('month', anchorDate);
        expect(bounds.start).toBe('2026-04-01');
        expect(bounds.end).toBe('2026-04-30');
    });

    it('calculates Year bounds correctly', () => {
        const bounds = window.Store._getPeriodBounds('year', anchorDate);
        expect(bounds.start).toBe('2026-01-01');
        expect(bounds.end).toBe('2026-12-31');
    });

    it('handles Leap Year February correctly', () => {
        const bounds = window.Store._getPeriodBounds('month', '2024-02-15');
        expect(bounds.start).toBe('2024-02-01');
        expect(bounds.end).toBe('2024-02-29');
    });

    it('handles Non-Leap Year February correctly', () => {
        const bounds = window.Store._getPeriodBounds('month', '2026-02-15');
        expect(bounds.start).toBe('2026-02-01');
        expect(bounds.end).toBe('2026-02-28');
    });

    it('navigates periods correctly', () => {
        // Today + 1
        window.Store.state.activePeriod = { type: 'today', value: '2026-04-15' };
        window.Store.dispatch('NAVIGATE_PERIOD', 1);
        expect(window.Store.state.activePeriod.value).toBe('2026-04-16');

        // Week + 1
        window.Store.state.activePeriod = { type: 'week', value: '2026-04-15' };
        window.Store.dispatch('NAVIGATE_PERIOD', 1);
        expect(window.Store.state.activePeriod.value).toBe('2026-04-22');

        // Month + 1
        window.Store.state.activePeriod = { type: 'month', value: '2026-04-15' };
        window.Store.dispatch('NAVIGATE_PERIOD', 1);
        expect(window.Store.state.activePeriod.value).toBe('2026-05-15');

        // Year - 1
        window.Store.state.activePeriod = { type: 'year', value: '2026-04-15' };
        window.Store.dispatch('NAVIGATE_PERIOD', -1);
        expect(window.Store.state.activePeriod.value).toBe('2025-04-15');
    });
});
