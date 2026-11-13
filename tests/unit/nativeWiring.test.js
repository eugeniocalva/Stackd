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

    // v1.16 A-03: both stores re-deliver a purchase that was never finished,
    // but only once the store has been initialized. That used to happen only
    // when a paywall or the purchases screen was opened, so a purchase
    // approved during a server outage sat unfinished until the user happened
    // to revisit one — and Google refunds an unacknowledged purchase after
    // three days. Boot has to open the store session for the replay to run.
    it('boot opens the store session on native, so unfinished purchases replay', () => {
      const main = read('src/main.js');
      const guarded = /isNative\(\)[\s\S]{0,400}?initStore\(\)/.test(main);
      expect(guarded).toBe(true);          // native only: the web build has no store
      expect(main).toMatch(/setTimeout\([^)]*initStore|initStore\(\)[\s\S]{0,40}catch/); // off the critical path, never throws
    });

    // 1.0.1 (BUG-03): Back used to branch on activeView only (exitApp() on
    // Home), killing the app under an open sheet. The listener now delegates
    // the whole in-app chain to Router.handleBack and only a bare Home leaves
    // — by backgrounding the app, with exitApp() as the fallback.
    it('the backButton listener delegates to Router.handleBack and minimizes on a bare Home', () => {
      const main = read('src/main.js');
      const at = main.indexOf("addListener('backButton'");
      expect(at).toBeGreaterThan(-1);
      const block = main.slice(at, at + 600);
      expect(block).toContain('Router.handleBack(');
      expect(block).toContain('minimizeApp');
      expect(block).toContain('exitApp');
      expect(block).not.toContain('history.back');
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

    // 1.0.2 (BUG-37): native CSV export opens the share sheet through @capacitor/share.
    it('@capacitor/share is declared for npm, gradle and CocoaPods, with a FileProvider cache path', () => {
      const pkg = JSON.parse(read('package.json'));
      expect(Object.keys(pkg.dependencies)).toContain('@capacitor/share');
      expect(read('android/capacitor.settings.gradle')).toContain("include ':capacitor-share'");
      expect(read('android/app/capacitor.build.gradle')).toContain("implementation project(':capacitor-share')");
      expect(read('ios/App/Podfile')).toContain("pod 'CapacitorShare'");
      expect(read('android/app/src/main/res/xml/file_paths.xml')).toContain('<cache-path ');
    });
  });
});

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E.4): the local stackd-cloud
// plugin (iCloud Drive backups on iOS, a no-op on Android) and the iCloud
// entitlements / plist keys it needs. `npx cap sync` derives the pod name
// (StackdCloud) and the iOS class list (@objc name) from these files.
describe('1.2.0 (UX-11) — stackd-cloud plugin wiring', () => {
  const CONTAINER = 'iCloud.com.stackd.finance';
  const plistArray = (xml, key) => {
    const m = xml.match(new RegExp('<key>' + key.replace(/\./g, '\\.') + '</key>\\s*<array>([\\s\\S]*?)</array>'));
    return m ? [...m[1].matchAll(/<string>([^<]*)<\/string>/g)].map(x => x[1]) : null;
  };

  it('is a local npm dependency with the Capacitor ios/android source layout', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['stackd-cloud']).toBe('file:plugins/stackd-cloud');
    const plugin = JSON.parse(read('plugins/stackd-cloud/package.json'));
    expect(plugin.name).toBe('stackd-cloud');
    expect(plugin.capacitor).toEqual({ ios: { src: 'ios' }, android: { src: 'android' } });
  });

  // `npm ci` (the TestFlight workflow) refuses a lock that disagrees with
  // package.json; `npx cap sync android` resolves the file: link to its
  // realpath (plugins/stackd-cloud) in the two generated gradle files.
  it('the lock links the local package and the cap sync gradle outputs include it', () => {
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.packages[''].dependencies['stackd-cloud']).toBe('file:plugins/stackd-cloud');
    expect(lock.packages['node_modules/stackd-cloud']).toEqual({ resolved: 'plugins/stackd-cloud', link: true });
    expect(lock.packages['plugins/stackd-cloud']).toMatchObject({ version: '1.0.0' });
    const settings = read('android/capacitor.settings.gradle');
    expect(settings).toContain("include ':stackd-cloud'");
    expect(settings).toContain("project(':stackd-cloud').projectDir = new File('../plugins/stackd-cloud/android')");
    expect(read('android/app/capacitor.build.gradle')).toContain("implementation project(':stackd-cloud')");
  });

  it('the podspec is named after the package (StackdCloud) and the Podfile installs it', () => {
    const spec = read('plugins/stackd-cloud/StackdCloud.podspec');
    expect(spec).toMatch(/s\.name\s*=\s*'StackdCloud'/);
    expect(spec).toContain("s.dependency 'Capacitor'");
    expect(spec).toMatch(/s\.source_files\s*=\s*'ios\/Sources\//);
    expect(read('ios/App/Podfile')).toContain("pod 'StackdCloud', :path => '../../plugins/stackd-cloud'");
  });

  it('the Swift plugin is a bridged CAPPlugin exposing available/write/read/list/remove on the ubiquity container', () => {
    const swift = read('plugins/stackd-cloud/ios/Sources/StackdCloudPlugin/StackdCloudPlugin.swift');
    expect(swift).toContain('@objc(StackdCloudPlugin)');
    expect(swift).toMatch(/class StackdCloudPlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/);
    expect(swift).toContain('identifier = "StackdCloudPlugin"');
    expect(swift).toContain('jsName = "StackdCloud"');
    ['available', 'write', 'read', 'list', 'remove'].forEach((m) => {
      expect(swift).toContain(`CAPPluginMethod(name: "${m}", returnType: CAPPluginReturnPromise)`);
      expect(swift).toMatch(new RegExp(`@objc func ${m}\\(_ call: CAPPluginCall\\)`));
    });
    expect(swift).toContain('forUbiquityContainerIdentifier: nil');
    expect(swift).toContain('appendingPathComponent("Documents"');
    expect(swift).toContain('"Stackd Backups"');
    expect(swift).toContain('startDownloadingUbiquitousItem');
    expect(swift).toContain('NSFileCoordinator');
  });

  it('the Android plugin answers available:false and rejects the rest', () => {
    const java = read('plugins/stackd-cloud/android/src/main/java/com/stackd/cloud/StackdCloudPlugin.java');
    expect(java).toContain('@CapacitorPlugin(name = "StackdCloud")');
    expect(java).toContain('ret.put("available", false)');
    ['write', 'read', 'list', 'remove'].forEach((m) => {
      expect(java).toMatch(new RegExp(`public void ${m}\\(PluginCall call\\) \\{\\s*call\\.reject\\(`));
    });
    expect(read('plugins/stackd-cloud/android/build.gradle')).toContain('namespace = "com.stackd.cloud"');
    expect(read('plugins/stackd-cloud/android/src/main/AndroidManifest.xml')).toContain('<manifest');
  });

  it('App.entitlements holds the iCloud Documents service and the container, Info.plist publishes its folder', () => {
    const ent = read('ios/App/App/App.entitlements');
    expect(plistArray(ent, 'com.apple.developer.icloud-services')).toEqual(['CloudDocuments']);
    expect(plistArray(ent, 'com.apple.developer.icloud-container-identifiers')).toEqual([CONTAINER]);
    expect(plistArray(ent, 'com.apple.developer.ubiquity-container-identifiers')).toEqual([CONTAINER]);
    expect(plistArray(ent, 'com.apple.developer.associated-domains')).toEqual(expect.arrayContaining(['applinks:api.stackdplatform.com']));
    const plist = read('ios/App/App/Info.plist');
    const m = plist.match(/<key>NSUbiquitousContainers<\/key>\s*<dict>\s*<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*<\/dict>/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(CONTAINER);
    expect(m[2]).toMatch(/<key>NSUbiquitousContainerIsDocumentScopePublic<\/key>\s*<true\/>/);
    expect(m[2]).toMatch(/<key>NSUbiquitousContainerName<\/key>\s*<string>Stack'd<\/string>/);
    expect(m[2]).toMatch(/<key>NSUbiquitousContainerSupportedFolderLevels<\/key>\s*<string>Any<\/string>/);
  });
});

// 1.3.0 (PL-4, docs/privacy-currencies-plan.md §5): the local stackd-privacy
// plugin — biometric / passcode prompts for App lock, the app-switcher cover
// and the iPhone's native shake detection. No JS wrapper is bundled: the app
// calls Capacitor.Plugins.StackdPrivacy, so the method names on both native
// sides ARE the contract.
describe('1.3.0 (PL-4) — stackd-privacy plugin wiring', () => {
  const METHODS = ['status', 'authenticate', 'setPrivacyCover', 'startShake', 'stopShake'];
  const SWIFT = 'plugins/stackd-privacy/ios/Sources/StackdPrivacyPlugin/StackdPrivacyPlugin.swift';
  const JAVA = 'plugins/stackd-privacy/android/src/main/java/com/stackd/privacy/StackdPrivacyPlugin.java';

  it('is a local npm dependency with the Capacitor ios/android source layout', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['stackd-privacy']).toBe('file:plugins/stackd-privacy');
    const plugin = JSON.parse(read('plugins/stackd-privacy/package.json'));
    expect(plugin.name).toBe('stackd-privacy');
    expect(plugin.capacitor).toEqual({ ios: { src: 'ios' }, android: { src: 'android' } });
    // native only: nothing for a bundler to pick up
    expect(plugin.main).toBeUndefined();
    expect(plugin.module).toBeUndefined();
  });

  // `npm ci` (the TestFlight workflow) refuses a lock that disagrees with
  // package.json; `npx cap update android` writes the two gradle files.
  it('the lock links the local package and the cap gradle outputs include it', () => {
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.packages[''].dependencies['stackd-privacy']).toBe('file:plugins/stackd-privacy');
    expect(lock.packages['node_modules/stackd-privacy']).toEqual({ resolved: 'plugins/stackd-privacy', link: true });
    expect(lock.packages['plugins/stackd-privacy']).toMatchObject({ version: '1.0.0' });
    const settings = read('android/capacitor.settings.gradle');
    expect(settings).toContain("include ':stackd-privacy'");
    expect(settings).toContain("project(':stackd-privacy').projectDir = new File('../plugins/stackd-privacy/android')");
    expect(read('android/app/capacitor.build.gradle')).toContain("implementation project(':stackd-privacy')");
  });

  it('the podspec is named after the package (StackdPrivacy), links its two frameworks, and the Podfile installs it', () => {
    const spec = read('plugins/stackd-privacy/StackdPrivacy.podspec');
    expect(spec).toMatch(/s\.name\s*=\s*'StackdPrivacy'/);
    expect(spec).toContain("s.dependency 'Capacitor'");
    expect(spec).toMatch(/s\.source_files\s*=\s*'ios\/Sources\//);
    expect(spec).toMatch(/s\.ios\.deployment_target\s*=\s*'15\.0'/);
    expect(spec).toMatch(/s\.frameworks\s*=\s*'LocalAuthentication',\s*'CoreMotion'/);
    expect(read('ios/App/Podfile')).toContain("pod 'StackdPrivacy', :path => '../../plugins/stackd-privacy'");
  });

  it('the Swift plugin is a bridged CAPPlugin exposing the five methods', () => {
    const swift = read(SWIFT);
    expect(swift).toContain('@objc(StackdPrivacyPlugin)');
    expect(swift).toMatch(/class StackdPrivacyPlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/);
    expect(swift).toContain('identifier = "StackdPrivacyPlugin"');
    expect(swift).toContain('jsName = "StackdPrivacy"');
    METHODS.forEach((m) => {
      expect(swift).toContain(`CAPPluginMethod(name: "${m}", returnType: CAPPluginReturnPromise)`);
      expect(swift).toMatch(new RegExp(`@objc func ${m}\\(_ call: CAPPluginCall\\)`));
    });
    expect(swift.match(/CAPPluginMethod\(name:/g)).toHaveLength(METHODS.length);
  });

  it('iOS: LocalAuthentication with both policies, no system fallback button, and a call that never rejects', () => {
    const swift = read(SWIFT);
    expect(swift).toContain('import LocalAuthentication');
    expect(swift).toContain('.deviceOwnerAuthenticationWithBiometrics');
    expect(swift).toMatch(/\.deviceOwnerAuthentication\b(?!With)/);
    expect(swift).toContain('localizedFallbackTitle = ""');
    expect(swift).toContain('localizedCancelTitle = cancelTitle');
    // Optic ID exists from iOS 17; the pod's deployment target is 15
    expect(swift).toMatch(/#available\(iOS 17\.0, \*\),\s*type == \.opticID/);
    ['"cancel"', '"lockout"', '"unavailable"', '"failed"'].forEach((code) => expect(swift).toContain(code));
    ['.userCancel', '.appCancel', '.systemCancel', '.userFallback', '.biometryLockout', '.biometryNotAvailable', '.biometryNotEnrolled', '.passcodeNotSet']
      .forEach((c) => expect(swift).toContain(c));
    expect(swift).not.toMatch(/call\.reject\(/);
    ['"biometry"', '"enrolled"', '"deviceSecure"'].forEach((k) => expect(swift).toContain(k));
  });

  it('iOS: the cover follows the app leaving and returning; the shake uses CoreMotion with the JS detector\'s rule', () => {
    const swift = read(SWIFT);
    ['UIApplication.willResignActiveNotification', 'UIApplication.didBecomeActiveNotification', 'UIApplication.didEnterBackgroundNotification']
      .forEach((n) => expect(swift).toContain(n));
    expect(swift).toContain('.systemBackground');
    expect(swift).toContain('import CoreMotion');
    expect(swift).toContain('CMMotionManager()');
    expect(swift).toContain('startDeviceMotionUpdates(to:');
    expect(swift).toContain('stopDeviceMotionUpdates()');
    expect(swift).toContain('userAcceleration');
    expect(swift).toContain('notifyListeners("shake"');
    // The same numbers as Components.PrivacyShake — read from the source, so
    // a change on one side fails here until the other follows.
    const js = read('src/components.js');
    const at = js.indexOf('PrivacyShake: {');
    expect(at).toBeGreaterThan(-1);
    const block = js.slice(at, at + 1500);
    const num = (name) => Number(block.match(new RegExp(name + ':\\s*([\\d.]+)'))[1]);
    const swiftNum = (name) => Number(swift.match(new RegExp('static let ' + name + '\\s*=\\s*([\\d.]+)'))[1]);
    expect(swiftNum('shakeThreshold')).toBe(num('THRESHOLD'));
    expect(swiftNum('shakePeaks')).toBe(num('PEAKS'));
    expect(swiftNum('shakeWindow') * 1000).toBeCloseTo(num('WINDOW_MS'), 6);
    expect(swiftNum('shakePeakGap') * 1000).toBeCloseTo(num('PEAK_GAP_MS'), 6);
    expect(swiftNum('gravity')).toBe(9.81);
    expect(swift).toMatch(/deviceMotionUpdateInterval\s*=\s*1\.0\s*\/\s*60\.0/);
  });

  it('the Android plugin declares the five methods on androidx.biometric and never blocks screenshots', () => {
    const java = read(JAVA);
    expect(java).toContain('package com.stackd.privacy;');
    expect(java).toContain('@CapacitorPlugin(name = "StackdPrivacy")');
    METHODS.forEach((m) => {
      expect(java).toMatch(new RegExp(`@PluginMethod\\s+public void ${m}\\((?:final )?PluginCall call\\)`));
    });
    expect(java.match(/@PluginMethod/g)).toHaveLength(METHODS.length);
    expect(java).toContain('Authenticators.BIOMETRIC_WEAK');
    expect(java).toContain('Authenticators.DEVICE_CREDENTIAL');
    expect(java).not.toContain('BIOMETRIC_STRONG');
    expect(java).toContain('isDeviceSecure()');
    expect(java).toContain('createConfirmDeviceCredentialIntent');
    expect(java).toContain('@ActivityCallback');
    expect(java).toContain('setRecentsScreenshotEnabled(!enabled)');
    expect(java).toContain('Build.VERSION_CODES.TIRAMISU');
    expect(java).not.toContain('FLAG_SECURE'); // plan A9: it would block every screenshot
    // always resolves; one unmatched read keeps the prompt up
    expect(java).not.toMatch(/call\.reject\(/);
    expect(java).not.toMatch(/void onAuthenticationFailed\(/);
    ['"cancel"', '"lockout"', '"unavailable"', '"failed"'].forEach((code) => expect(java).toContain(code));
    // the shake stays in JS on Android
    expect(java.match(/ret\.put\("native", false\)/g)).toHaveLength(2);
    expect(java).not.toContain('"native", true');
  });

  it('the Android module is com.stackd.privacy with the biometric library and the USE_BIOMETRIC permission', () => {
    const gradle = read('plugins/stackd-privacy/android/build.gradle');
    expect(gradle).toContain('namespace = "com.stackd.privacy"');
    expect(gradle).toMatch(/androidxBiometricVersion\s*=.*'1\.1\.0'/);
    expect(gradle).toContain('implementation "androidx.biometric:biometric:$androidxBiometricVersion"');
    expect(gradle).toContain("implementation project(':capacitor-android')");
    expect(gradle).toContain('JavaVersion.VERSION_21');
    const manifest = read('plugins/stackd-privacy/android/src/main/AndroidManifest.xml');
    expect(manifest).toContain('<uses-permission android:name="android.permission.USE_BIOMETRIC" />');
  });

  it('Info.plist explains Face ID, and asks for no motion permission (CoreMotion device motion needs none)', () => {
    const plist = read('ios/App/App/Info.plist');
    expect(plist).toMatch(/<key>NSFaceIDUsageDescription<\/key>\s*<string>Stack'd uses Face ID to unlock the app when App lock is on\.<\/string>/);
    expect(plist).not.toContain('NSMotionUsageDescription');
  });
});
