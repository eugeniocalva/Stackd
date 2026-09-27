import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Store links (src/views.js `Views.APPLE_APP_ID` / `_storeUrl`).
//
// v1.19 (A-07): APPLE_APP_ID was `null` for the whole of v1.14–v1.18, because
// the numeric id does not exist until the App Store Connect record is created.
// `_storeUrl()` answers null while it is unset, and the Rate row hides itself
// rather than opening a dead apps.apple.com link — which is correct, but means
// a regression to null is INVISIBLE: the row simply disappears on iOS and
// nothing throws. This spec is the alarm for that.
//
// It deliberately asserts the shape of the URL as well as the id, because the
// three values in App Store Connect are easy to confuse and two of them are
// wrong here: the bundle id (com.stackd.finance) and the Team ID both live a
// click away from the Apple ID, and either would build a link that 404s.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Store links', () => {
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-id-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'test-id-' + Math.random().toString(36).slice(2, 11)
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      body: { appendChild: vi.fn() }
    };

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
  });

  const onPlatform = (p) => {
    global.window.BankConnect = { platform: () => p };
    return global.window.Views;
  };

  it('carries the real Apple id, as a string', () => {
    const Views = global.window.Views;
    expect(Views.APPLE_APP_ID).toBe('6816636640');
    // A number would be silently reformatted by anything that touched it, and
    // the id is an opaque token rather than a quantity.
    expect(typeof Views.APPLE_APP_ID).toBe('string');
    // Not the bundle id, and not a Team ID.
    expect(Views.APPLE_APP_ID).toMatch(/^\d+$/);
    expect(Views.APPLE_APP_ID).not.toBe(Views.ANDROID_PACKAGE);
  });

  it('builds the App Store review link, so the Rate row is not hidden on iOS', () => {
    const Views = onPlatform('appstore');
    expect(Views._storeUrl()).toBe(
      'https://apps.apple.com/app/id6816636640?action=write-review'
    );
  });

  it('still builds the Play link from the package name', () => {
    const Views = onPlatform('play');
    expect(Views._storeUrl()).toBe(
      'https://play.google.com/store/apps/details?id=com.stackd.finance'
    );
  });

  it('has no store link on the web build', () => {
    const Views = onPlatform('web');
    expect(Views._storeUrl()).toBeNull();
  });

  it('points each platform at its own subscription centre', () => {
    expect(onPlatform('appstore')._subscriptionsUrl())
      .toBe('https://apps.apple.com/account/subscriptions');
    expect(onPlatform('play')._subscriptionsUrl())
      .toBe('https://play.google.com/store/account/subscriptions');
    expect(onPlatform('web')._subscriptionsUrl()).toBeNull();
  });
});
