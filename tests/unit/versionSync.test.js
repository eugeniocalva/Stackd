import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.14: the app version used to live in four files that could disagree —
// index.html said v1.13 while both stores would have shown 1.0, and a
// versionCode left at 1 is rejected on the second upload. package.json is now
// the source of truth and this test is the gate that keeps the others in step.
const require = createRequire(import.meta.url);
const version = require(resolve(__dirname, '../../tools/version.cjs'));
const read = (p) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('version sync (v1.14)', () => {
  it('derives the store versions from package.json', () => {
    const v = version.versions();
    expect(v.name).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.title).toBe(`Stack'd v${v.name.split('.').slice(0, 2).join('.')}`);
    // major*10000 + minor*100 + patch — monotonic as long as the version is.
    const [major, minor, patch] = v.name.split('.').map(Number);
    expect(v.code).toBe(major * 10000 + minor * 100 + patch);
  });

  it('index.html, the Android gradle and the Xcode project all agree', () => {
    // --check reports every place that would change; none should.
    expect(version.run(true)).toEqual([]);
  });

  it('the store build number is above 1 (Play rejects a re-used versionCode)', () => {
    expect(version.versions().code).toBeGreaterThan(1);
    expect(read('android/app/build.gradle')).toContain(`versionCode ${version.versions().code}`);
  });
});
