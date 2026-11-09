import Foundation
import Capacitor
import WidgetKit

// 1.2.2 (HG-15, docs/phone-widgets-plan.md WG-3): the app's widget snapshot
// (src/widgets-native.js) goes to the App Group shared with the WidgetKit
// extension (WG-5): <group>/widgets/snapshot.json, then every timeline reloads.
// The extension's Quick add App Intent leaves its stackd://open URL in the
// group's UserDefaults; takePending() hands it to the app once.
// Until the App Group entitlement is on the app target, write() rejects and
// the JS side simply tries again on the next change.
@objc(StackdWidgetsPlugin)
public class StackdWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StackdWidgetsPlugin"
    public let jsName = "StackdWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise)
    ]

    static let group = "group.com.stackd.finance"
    static let pendingKey = "pendingOpen"
    private let maxBytes = 256 * 1024
    private let queue = DispatchQueue(label: "com.stackd.finance.widgets", qos: .utility)

    private func fileURL() -> URL? {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: StackdWidgetsPlugin.group) else {
            return nil
        }
        let dir = container.appendingPathComponent("widgets", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
        }
        return dir.appendingPathComponent("snapshot.json")
    }

    private func reload() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else { call.reject("json is required"); return }
        guard let data = json.data(using: .utf8), data.count <= maxBytes else { call.reject("snapshot too large"); return }
        queue.async {
            guard let url = self.fileURL() else { call.reject("App Group unavailable"); return }
            do {
                // Atomic, and readable by the extension after the first unlock.
                try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            } catch {
                call.reject("write failed")
                return
            }
            self.reload()
            call.resolve(["written": true])
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        queue.async {
            if let url = self.fileURL() { try? FileManager.default.removeItem(at: url) }
            self.reload()
            call.resolve()
        }
    }

    @objc func takePending(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: StackdWidgetsPlugin.group),
              let url = defaults.string(forKey: StackdWidgetsPlugin.pendingKey) else {
            call.resolve([:])
            return
        }
        defaults.removeObject(forKey: StackdWidgetsPlugin.pendingKey)
        // Only our own scheme ever comes back; anything else is dropped.
        call.resolve(url.hasPrefix("stackd://open") ? ["url": url] : [:])
    }
}
