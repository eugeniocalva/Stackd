import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.12 Bank Connect, phase B8 (docs/bank-connect-ux-plan.md §16.7): the
// native wiring. The token adapter must speak the SecureStorage plugin's
// REAL native surface (no plugin JS wrapper is ever bundled), and the
// manifest / plist / Podfile contracts must match what the return leg parses.
const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const executeFile = (path) => {
  const content = read('src/' + path);
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

// @aparajita/capacitor-secure-storage as the bridge proxy exposes it: the
// native methods only, keyed by prefixedKey, string data.
const fakeAparajita = () => {
  const items = new Map();
  return {
    items,
    async internalGetItem({ prefixedKey }) { return { data: items.has(prefixedKey) ? items.get(prefixedKey) : null }; },
    async internalSetItem({ prefixedKey, data }) { items.set(prefixedKey, String(data)); },
    async internalRemoveItem({ prefixedKey }) { return { success: items.delete(prefixedKey) }; }
  };
};

// capacitor-secure-storage-plugin (the older alternative named in D-C15).
const fakeLegacy = () => {
  const items = new Map();
  return {
    items,
    async get({ key }) { if (!items.has(key)) throw new Error('Item with given key does not exist'); return { value: items.get(key) }; },
    async set({ key, value }) { items.set(key, value); return { value: true }; },
    async remove({ key }) { return { value: items.delete(key) }; }
  };
};

const boot = (plugins) => {
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect' },
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins }
  };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js', 'export.js', 'import.js', 'bank-connect.js'].forEach(executeFile);
  global.window.Store.init();
  return global.window;
};

describe('Bank Connect B8 (v1.12) — native wiring', () => {
  describe('device token in the native keystore', () => {
    it('speaks the SecureStorage plugin\'s native methods: prefixed key, JSON data, nothing in localStorage', async () => {
      const ss = fakeAparajita();
      const w = boot({ SecureStorage: ss });
      const BC = w.BankConnect;
      expect(BC._secureKind(ss)).toBe('aparajita');
      expect(await BC.tokenGet()).toBeNull();
      await BC.tokenSet('owner01.secret01');
      expect(ss.items.get('capacitor-storage_stackd_device_token')).toBe('"owner01.secret01"');
      expect(w.localStorage._m.has('stackd_device_token')).toBe(false);
      BC._token = null; // drop the in-memory copy: the next read must hit the keystore
      expect(await BC.tokenGet()).toBe('owner01.secret01');
      await BC.tokenClear();
      expect(ss.items.size).toBe(0);
      BC._token = null;
      expect(await BC.tokenGet()).toBeNull();
    });

    it('migrates a token a pre-B8 build left in localStorage into the keystore, once', async () => {
      const ss = fakeAparajita();
      const w = boot({ SecureStorage: ss });
      w.localStorage.setItem('stackd_device_token', 'owner01.legacy');
      expect(await w.BankConnect.tokenGet()).toBe('owner01.legacy');
      expect(ss.items.get('capacitor-storage_stackd_device_token')).toBe('"owner01.legacy"');
      expect(w.localStorage._m.has('stackd_device_token')).toBe(false);
    });

    it('also drives the older get/set/remove plugin, and a plugin of unknown shape falls back to localStorage', async () => {
      const legacy = fakeLegacy();
      let w = boot({ SecureStoragePlugin: legacy });
      await w.BankConnect.tokenSet('owner02.secret02');
      expect(legacy.items.get('stackd_device_token')).toBe('owner02.secret02');
      w.BankConnect._token = null;
      expect(await w.BankConnect.tokenGet()).toBe('owner02.secret02');
      await w.BankConnect.tokenClear();
      expect(legacy.items.size).toBe(0);

      w = boot({ SecureStorage: { unrelated() {} } });
      expect(w.BankConnect._secureKind(w.Capacitor.Plugins.SecureStorage)).toBeNull();
      await w.BankConnect.tokenSet('owner03.secret03');
      expect(w.localStorage.getItem('stackd_device_token')).toBe('owner03.secret03');
    });

    it('a keystore failure never throws out of tokenGet/tokenSet (the in-memory copy serves the session)', async () => {
      const ss = { async internalGetItem() { throw new Error('KeyStore unavailable'); }, async internalSetItem() { throw new Error('KeyStore unavailable'); }, async internalRemoveItem() {} };
      const w = boot({ SecureStorage: ss });
      expect(await w.BankConnect.tokenGet()).toBeNull();
      await w.BankConnect.tokenSet('owner04.secret04');
      expect(await w.BankConnect.tokenGet()).toBe('owner04.secret04');
    });
  });

  describe('platform contracts', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const filters = [...manifest.matchAll(/<intent-filter([^>]*)>([\s\S]*?)<\/intent-filter>/g)].map(m => ({ attrs: m[1], body: m[2] }));
    const dataOf = (f) => [...f.body.matchAll(/<data\s+([^>]*?)\/>/g)].map(m => Object.fromEntries([...m[1].matchAll(/android:(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]])));

    it('Android: one verified App Link filter per broker host, exactly on the return path, plus the stackd:// fallback', () => {
      const applinks = filters.filter(f => /autoVerify="true"/.test(f.attrs));
      expect(applinks).toHaveLength(2);
      const hosts = applinks.map(f => dataOf(f));
      hosts.forEach(d => {
        expect(d).toHaveLength(1);
        expect(d[0]).toEqual({ scheme: 'https', host: d[0].host, path: '/v1/connect/return' });
      });
      expect(hosts.map(d => d[0].host).sort()).toEqual(['api-staging.stackdplatform.com', 'api.stackdplatform.com']);
      applinks.forEach(f => {
        expect(f.body).toContain('android.intent.action.VIEW');
        expect(f.body).toContain('android.intent.category.BROWSABLE');
        expect(f.body).toContain('android.intent.category.DEFAULT');
      });
      const scheme = filters.find(f => dataOf(f).some(d => d.scheme === 'stackd'));
      expect(scheme).toBeTruthy();
      expect(dataOf(scheme)[0]).toEqual({ scheme: 'stackd', host: 'connect' });
      expect(manifest).toMatch(/android:launchMode="singleTask"/); // a warm return arrives as appUrlOpen
    });

    it('the URLs those filters admit are the ones BankConnect.parseReturnUrl accepts', () => {
      const w = boot({});
      const ref = '0123456789abcdef_fedcba9876543210';
      expect(w.BankConnect.parseReturnUrl(`https://api.stackdplatform.com/v1/connect/return?code=abc&state=${ref}`)).toBe(ref);
      expect(w.BankConnect.parseReturnUrl(`https://api-staging.stackdplatform.com/v1/connect/return?state=${ref}`)).toBe(ref);
      expect(w.BankConnect.parseReturnUrl(`stackd://connect/return?ref=${ref}`)).toBe(ref);
      expect(w.BankConnect.parseReturnUrl('https://api.stackdplatform.com/v1/institutions?country=IT')).toBeNull();
    });

    it('iOS: the stackd scheme in Info.plist, the two applinks hosts in the entitlements the target signs with', () => {
      const plist = read('ios/App/App/Info.plist');
      expect(plist).toMatch(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>stackd<\/string>/);
      const ent = read('ios/App/App/App.entitlements');
      expect(ent).toContain('<key>com.apple.developer.associated-domains</key>');
      expect(ent).toContain('<string>applinks:api.stackdplatform.com</string>');
      expect(ent).toContain('<string>applinks:api-staging.stackdplatform.com</string>');
      const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
      expect(pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
      expect(pbx).toContain('/* App.entitlements */ = {isa = PBXFileReference');
    });

    it('the three native plugins are declared for npm, gradle and CocoaPods', () => {
      const pkg = JSON.parse(read('package.json'));
      expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['@capacitor/browser', '@aparajita/capacitor-secure-storage', 'cordova-plugin-purchase']));
      const settings = read('android/capacitor.settings.gradle');
      expect(settings).toContain("include ':capacitor-browser'");
      expect(settings).toContain("include ':aparajita-capacitor-secure-storage'");
      const build = read('android/app/capacitor.build.gradle');
      expect(build).toContain("implementation project(':capacitor-browser')");
      expect(build).toContain("implementation project(':aparajita-capacitor-secure-storage')");
      expect(build).toMatch(/com\.android\.billingclient:billing/);
      const pod = read('ios/App/Podfile');
      expect(pod).toContain("pod 'CapacitorBrowser'");
      expect(pod).toContain("pod 'AparajitaCapacitorSecureStorage'");
      expect(pod).toContain("pod 'CordovaPlugins'");
    });
  });
});
