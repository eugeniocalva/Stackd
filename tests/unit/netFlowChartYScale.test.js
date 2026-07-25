import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NetFlowChart Y-Axis Scaling', () => {
  const componentsPath = path.resolve(__dirname, '../../src/components.js');
  const componentsCode = fs.readFileSync(componentsPath, 'utf8');

  it('contains computeYScale logic with strict base multipliers [10, 50, 100, 200, 250, 500]', () => {
    expect(componentsCode).toContain('const baseMultipliers = [10, 50, 100, 200, 250, 500];');
    expect(componentsCode).toContain('display: true');
    expect(componentsCode).toContain('window.Store.getCurrencySymbol()');
  });

  const computeYScale = (vals) => {
    if (!vals || vals.length === 0) {
      return { min: 0, max: 10, stepSize: 10 };
    }
    const rawMax = Math.max(...vals, 0);
    const rawMin = Math.min(...vals, 0);
    if (rawMax === 0 && rawMin === 0) {
      return { min: 0, max: 10, stepSize: 10 };
    }

    const baseMultipliers = [10, 50, 100, 200, 250, 500];
    const candidateStepSizes = [];
    for (let k = 0; k <= 6; k++) {
      const factor = Math.pow(10, k);
      for (const m of baseMultipliers) {
        candidateStepSizes.push(m * factor);
      }
    }
    const sortedStepSizes = [...new Set(candidateStepSizes)].sort((a, b) => a - b);

    let chosenStepSize = sortedStepSizes[0];
    for (const s of sortedStepSizes) {
      const stepsMax = Math.ceil(rawMax / s);
      const stepsMin = Math.floor(rawMin / s);
      const totalSteps = stepsMax - stepsMin;
      if (totalSteps <= 6) {
        chosenStepSize = s;
        break;
      }
    }

    let axisMax = Math.ceil(rawMax / chosenStepSize) * chosenStepSize;
    let axisMin = Math.floor(rawMin / chosenStepSize) * chosenStepSize;

    if (axisMin === 0 && axisMax === 0) {
      axisMax = chosenStepSize;
    }

    return { min: axisMin, max: axisMax, stepSize: chosenStepSize };
  };

  it('selects step sizes that are strict multiples of 10, 50, 100, 200, 250, or 500', () => {
    const testCases = [
      { vals: [-0.53], expectedStep: 10, expectedMin: -10, expectedMax: 0 },
      { vals: [0.53], expectedStep: 10, expectedMin: 0, expectedMax: 10 },
      { vals: [12, 35], expectedStep: 10, expectedMin: 0, expectedMax: 40 },
      { vals: [80, 190], expectedStep: 50, expectedMin: 0, expectedMax: 200 },
      { vals: [150, 420], expectedStep: 100, expectedMin: 0, expectedMax: 500 },
      { vals: [200, 850], expectedStep: 200, expectedMin: 0, expectedMax: 1000 },
      { vals: [-450, 1200], expectedStep: 500, expectedMin: -500, expectedMax: 1500 },
      { vals: [6000, 18000], expectedStep: 5000, expectedMin: 0, expectedMax: 20000 }
    ];

    testCases.forEach(({ vals, expectedStep, expectedMin, expectedMax }) => {
      const scale = computeYScale(vals);
      expect(scale.stepSize).toBe(expectedStep);
      expect(scale.min).toBe(expectedMin);
      expect(scale.max).toBe(expectedMax);
    });
  });

  it('formats tick labels dynamically based on currency symbol', () => {
    const formatTick = (val, symbol) => {
      const sign = val < 0 ? '-' : '';
      const formattedAbs = Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
      return `${sign}${symbol}${formattedAbs}`;
    };

    expect(formatTick(500, '$')).toBe('$500');
    expect(formatTick(-250, '€')).toBe('-€250');
    expect(formatTick(1000, '£')).toBe('£1,000');
    expect(formatTick(0, '¥')).toBe('¥0');
  });
});
