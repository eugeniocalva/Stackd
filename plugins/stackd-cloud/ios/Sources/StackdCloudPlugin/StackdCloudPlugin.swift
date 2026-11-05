import Foundation
import Capacitor

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E.4): Stack'd backups in the
// user's own iCloud Drive. Files live in the app's ubiquity container
// (iCloud.com.stackd.finance, see App.entitlements) under
// "Documents/Stackd Backups", which Info.plist's NSUbiquitousContainers makes
// visible in Files > iCloud Drive > Stack'd. Nothing here talks to a network
// API: iCloud Drive syncs the folder on the system's own schedule.
// The JS side (src/backup.js) reaches this as window.Capacitor.Plugins.StackdCloud
// and falls back to the app's Documents folder when available() is false.
// Every file is UTF-8 text (a JSON backup bundle); names are plain file names.
@objc(StackdCloudPlugin)
public class StackdCloudPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StackdCloudPlugin"
    public let jsName = "StackdCloud"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let folderName = "Stackd Backups"
    private let queue = DispatchQueue(label: "com.stackd.finance.cloud", qos: .utility)

    // url(forUbiquityContainerIdentifier:) can block, so it never runs on the
    // main thread. nil = not signed in to iCloud, iCloud Drive off for the
    // app, or the entitlement missing.
    private func folderURL() -> URL? {
        guard FileManager.default.ubiquityIdentityToken != nil,
              let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
            return nil
        }
        let folder = container.appendingPathComponent("Documents", isDirectory: true)
            .appendingPathComponent(folderName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: folder.path) {
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        }
        return folder
    }

    // A plain file name: no path separators, no parent references, bounded.
    private func safeName(_ call: CAPPluginCall) -> String? {
        guard let name = call.getString("name"), !name.isEmpty, name.count <= 200,
              !name.contains("/"), !name.contains("\\"), !name.contains(".."), !name.hasPrefix(".") else {
            return nil
        }
        return name
    }

    @objc func available(_ call: CAPPluginCall) {
        queue.async {
            call.resolve(["available": self.folderURL() != nil])
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let name = safeName(call) else { call.reject("invalid name"); return }
        guard let text = call.getString("data") else { call.reject("missing data"); return }
        queue.async {
            guard let folder = self.folderURL() else { call.reject("iCloud Drive unavailable"); return }
            let url = folder.appendingPathComponent(name, isDirectory: false)
            guard let bytes = text.data(using: .utf8) else { call.reject("encoding failed"); return }
            var coordError: NSError?
            var writeError: Error?
            NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forReplacing, error: &coordError) { target in
                do {
                    try bytes.write(to: target, options: .atomic)
                } catch {
                    writeError = error
                }
            }
            if let error = coordError ?? (writeError as NSError?) {
                call.reject("write failed", nil, error)
                return
            }
            call.resolve(["uri": url.absoluteString])
        }
    }

    // Waits (up to ~15 s) for an evicted file to come down from iCloud.
    private func ensureDownloaded(_ url: URL) {
        let fm = FileManager.default
        guard fm.isUbiquitousItem(at: url) else { return }
        try? fm.startDownloadingUbiquitousItem(at: url)
        let keys: Set<URLResourceKey> = [.ubiquitousItemDownloadingStatusKey]
        for _ in 0..<60 {
            var probe = url
            probe.removeAllCachedResourceValues()
            if let values = try? probe.resourceValues(forKeys: keys),
               values.ubiquitousItemDownloadingStatus == URLUbiquitousItemDownloadingStatus.current {
                return
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let name = safeName(call) else { call.reject("invalid name"); return }
        queue.async {
            guard let folder = self.folderURL() else { call.reject("iCloud Drive unavailable"); return }
            let url = folder.appendingPathComponent(name, isDirectory: false)
            self.ensureDownloaded(url)
            var coordError: NSError?
            var text: String?
            var readError: Error?
            NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordError) { target in
                do {
                    let bytes = try Data(contentsOf: target)
                    text = String(data: bytes, encoding: .utf8)
                } catch {
                    readError = error
                }
            }
            if let error = coordError ?? (readError as NSError?) {
                call.reject("not found", nil, error)
                return
            }
            guard let data = text else { call.reject("not UTF-8 text"); return }
            call.resolve(["data": data])
        }
    }

    // [{ name, size, mtime }] (mtime in ms). A file not downloaded yet shows
    // as ".<name>.icloud" on older iOS versions: it is listed by its real name.
    @objc func list(_ call: CAPPluginCall) {
        queue.async {
            guard let folder = self.folderURL() else { call.resolve(["files": []]); return }
            let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .isDirectoryKey]
            let urls = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys, options: [])) ?? []
            var files: [[String: Any]] = []
            var seen = Set<String>()
            for url in urls {
                let values = try? url.resourceValues(forKeys: Set(keys))
                if values?.isDirectory == true { continue }
                var name = url.lastPathComponent
                if name.hasPrefix(".") && name.hasSuffix(".icloud") {
                    name = String(name.dropFirst().dropLast(".icloud".count))
                }
                if name.isEmpty || name.hasPrefix(".") || seen.contains(name) { continue }
                seen.insert(name)
                let mtime = (values?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
                files.append(["name": name, "size": values?.fileSize ?? 0, "mtime": mtime])
            }
            call.resolve(["files": files])
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let name = safeName(call) else { call.reject("invalid name"); return }
        queue.async {
            guard let folder = self.folderURL() else { call.reject("iCloud Drive unavailable"); return }
            let url = folder.appendingPathComponent(name, isDirectory: false)
            var coordError: NSError?
            var removeError: Error?
            NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forDeleting, error: &coordError) { target in
                do {
                    try FileManager.default.removeItem(at: target)
                } catch {
                    removeError = error
                }
            }
            if let error = coordError ?? (removeError as NSError?) {
                call.reject("remove failed", nil, error)
                return
            }
            call.resolve()
        }
    }
}
