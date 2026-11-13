import Foundation
import UIKit
import Capacitor
import LocalAuthentication
import CoreMotion

// 1.3.0 (PL-4, docs/privacy-currencies-plan.md §5): the native half of App
// lock and Shake to hide. The JS side (src/app-lock.js, Components.PrivacyShake)
// reaches this as window.Capacitor.Plugins.StackdPrivacy.
//   status()          what the phone offers: biometry kind, enrolled, passcode
//   authenticate()    Face ID / Touch ID (or the passcode); ALWAYS resolves
//                     {ok: true} or {ok: false, code}
//   setPrivacyCover() an opaque view over the app while it is not active, so
//                     the app switcher shows no figures
//   startShake()/stopShake()  CoreMotion shake detection, event "shake".
//                     WebKit's devicemotion needs a per-launch permission call
//                     from a tap (PL-1); CoreMotion needs none.
// Threading: `authenticating`, the cover and CMMotionManager start/stop live on
// the main thread; the shake peaks live on `motionQueue` (serial).
@objc(StackdPrivacyPlugin)
public class StackdPrivacyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StackdPrivacyPlugin"
    public let jsName = "StackdPrivacy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPrivacyCover", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startShake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopShake", returnType: CAPPluginReturnPromise)
    ]

    deinit {
        let center = NotificationCenter.default
        coverObservers.forEach { center.removeObserver($0) }
        shakeObservers.forEach { center.removeObserver($0) }
        if let waiter = activeWaiter { center.removeObserver(waiter) }
        motion.stopDeviceMotionUpdates()
    }

    private static var appName: String {
        if let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String, !name.isEmpty {
            return name
        }
        return "Stack'd"
    }

    // MARK: - status

    @objc func status(_ call: CAPPluginCall) {
        let context = LAContext()
        // biometryType is only meaningful after canEvaluatePolicy has run; it
        // then names the sensor even when nothing is enrolled.
        let enrolled = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        let biometry = StackdPrivacyPlugin.biometryName(context.biometryType)
        let deviceSecure = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        call.resolve([
            "biometry": biometry,
            "enrolled": enrolled,
            "deviceSecure": deviceSecure
        ])
    }

    private static func biometryName(_ type: LABiometryType) -> String {
        if #available(iOS 17.0, *), type == .opticID { return "iris" }
        switch type {
        case .faceID: return "face"
        case .touchID: return "fingerprint"
        default: return "none"
        }
    }

    // MARK: - authenticate

    // True from the moment a call is accepted until it is answered. A second
    // call in that time answers 'failed' at once, and the cover stays away
    // while our own system prompt is what made the app inactive.
    private var authenticating = false
    private var activeWaiter: NSObjectProtocol?

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = (call.getString("reason") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cancelTitle = (call.getString("cancelTitle") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let allowCredential = call.getBool("allowDeviceCredential") ?? false
        // `title` is Android's prompt heading; the iOS sheet has no such line.
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.authenticating else {
                call.resolve(["ok": false, "code": "failed"])
                return
            }
            self.authenticating = true
            if UIApplication.shared.applicationState == .active {
                self.evaluate(call, reason: reason, cancelTitle: cancelTitle, allowCredential: allowCredential)
                return
            }
            // Asked on the way back to the foreground (the app's "resume"):
            // LocalAuthentication cancels a prompt started before the app is
            // active, so the prompt waits for that moment.
            self.activeWaiter = NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
            ) { [weak self] _ in
                // One shot: the token is dropped before the prompt starts
                // (deinit drops it too, so a dead plugin never gets here).
                guard let self = self, let waiter = self.activeWaiter else { return }
                NotificationCenter.default.removeObserver(waiter)
                self.activeWaiter = nil
                self.evaluate(call, reason: reason, cancelTitle: cancelTitle, allowCredential: allowCredential)
            }
        }
    }

    // Main thread.
    private func evaluate(_ call: CAPPluginCall, reason: String, cancelTitle: String, allowCredential: Bool) {
        let context = LAContext()
        let policy: LAPolicy = allowCredential ? .deviceOwnerAuthentication : .deviceOwnerAuthenticationWithBiometrics
        if !allowCredential {
            // Biometrics only: no system "Enter Password" button, and the
            // cancel button carries the app's words ("Use PIN").
            context.localizedFallbackTitle = ""
            if !cancelTitle.isEmpty { context.localizedCancelTitle = cancelTitle }
        }
        var error: NSError?
        guard context.canEvaluatePolicy(policy, error: &error) else {
            authenticating = false
            call.resolve(["ok": false, "code": StackdPrivacyPlugin.code(for: error)])
            return
        }
        // An empty reason raises an exception in LocalAuthentication.
        let text = reason.isEmpty ? StackdPrivacyPlugin.appName : reason
        context.evaluatePolicy(policy, localizedReason: text) { [weak self] success, evalError in
            let result: [String: Any] = success
                ? ["ok": true]
                : ["ok": false, "code": StackdPrivacyPlugin.code(for: evalError)]
            let taken = !success && StackdPrivacyPlugin.isSystemCancel(evalError)
            DispatchQueue.main.async {
                if let self = self {
                    self.authenticating = false
                    // The system took the prompt away (app switcher, a call)
                    // and the app is still not in front: no resign notification
                    // will come now, so the cover goes up here.
                    if taken && UIApplication.shared.applicationState != .active {
                        self.showCover()
                    }
                }
                call.resolve(result)
            }
        }
    }

    private static func isSystemCancel(_ error: Error?) -> Bool {
        guard let error = error else { return false }
        let nsError = error as NSError
        return nsError.domain == LAErrorDomain
            && (nsError.code == LAError.Code.systemCancel.rawValue || nsError.code == LAError.Code.appCancel.rawValue)
    }

    private static func code(for error: Error?) -> String {
        guard let error = error else { return "failed" }
        let nsError = error as NSError
        guard nsError.domain == LAErrorDomain, let code = LAError.Code(rawValue: nsError.code) else {
            return "failed"
        }
        switch code {
        case .userCancel, .appCancel, .systemCancel, .userFallback:
            return "cancel"
        case .biometryLockout:
            return "lockout"
        case .biometryNotAvailable, .biometryNotEnrolled, .passcodeNotSet:
            return "unavailable"
        default:
            return "failed"
        }
    }

    // MARK: - app-switcher cover

    private static let coverTag = 0x535450 // "STP"
    private var coverEnabled = false
    private var coverObservers: [NSObjectProtocol] = []
    private weak var coverView: UIView?

    @objc func setPrivacyCover(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async { [weak self] in
            if let self = self {
                self.coverEnabled = enabled
                if enabled {
                    self.observeCover()
                } else {
                    let center = NotificationCenter.default
                    self.coverObservers.forEach { center.removeObserver($0) }
                    self.coverObservers = []
                    self.hideCover()
                }
            }
            call.resolve([:])
        }
    }

    // UIKit posts these on the main thread; `queue: nil` runs the block inside
    // the post, so the cover is in place before the system takes its snapshot.
    // The app is scene-based (one scene): both families are observed and the
    // handlers do nothing the second time.
    private func observeCover() {
        guard coverObservers.isEmpty else { return }
        let center = NotificationCenter.default
        let resigning: [Notification.Name] = [UIApplication.willResignActiveNotification, UIScene.willDeactivateNotification]
        let background: [Notification.Name] = [UIApplication.didEnterBackgroundNotification, UIScene.didEnterBackgroundNotification]
        let active: [Notification.Name] = [UIApplication.didBecomeActiveNotification, UIScene.didActivateNotification]
        for name in resigning {
            coverObservers.append(center.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
                // Our own Face ID / passcode prompt also makes the app
                // inactive: no cover behind it.
                guard let self = self, !self.authenticating else { return }
                self.showCover()
            })
        }
        for name in background {
            coverObservers.append(center.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
                // Left for real (also from under a prompt): always covered.
                self?.showCover()
            })
        }
        for name in active {
            coverObservers.append(center.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
                self?.hideCover()
            })
        }
    }

    private func appWindow() -> UIWindow? {
        if let window = bridge?.viewController?.viewIfLoaded?.window { return window }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            if let key = scene.windows.first(where: { $0.isKeyWindow }) { return key }
        }
        return scenes.first?.windows.first
    }

    // Main thread.
    private func showCover() {
        guard coverEnabled, let window = appWindow() else { return }
        if let existing = coverView ?? window.subviews.first(where: { $0.tag == StackdPrivacyPlugin.coverTag }) {
            if existing.superview !== window {
                existing.removeFromSuperview()
                existing.frame = window.bounds
                window.addSubview(existing)
            }
            window.bringSubviewToFront(existing)
            coverView = existing
            return
        }
        let cover = UIView(frame: window.bounds)
        cover.tag = StackdPrivacyPlugin.coverTag
        cover.backgroundColor = .systemBackground
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.isAccessibilityElement = false
        let label = UILabel()
        label.text = StackdPrivacyPlugin.appName
        label.font = UIFont.systemFont(ofSize: 28, weight: .semibold)
        label.textColor = .label
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: cover.centerYAnchor)
        ])
        window.addSubview(cover)
        coverView = cover
    }

    // Main thread.
    private func hideCover() {
        coverView?.removeFromSuperview()
        coverView = nil
        // A cover a previous plugin instance left behind is found by its tag.
        if let window = appWindow() {
            window.subviews.filter { $0.tag == StackdPrivacyPlugin.coverTag }.forEach { $0.removeFromSuperview() }
        }
    }

    // MARK: - shake

    // The same rule as Components.PrivacyShake (src/components.js): PEAKS
    // jolts above THRESHOLD m/s² (gravity removed) inside WINDOW, one jolt
    // counted at most every PEAK_GAP. The cooldown between two shakes stays in JS.
    private static let shakeThreshold = 13.0   // m/s²
    private static let shakePeaks = 3
    private static let shakeWindow = 0.9       // s
    private static let shakePeakGap = 0.09     // s
    private static let gravity = 9.81          // userAcceleration is in g

    private let motion = CMMotionManager()
    private let motionQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "com.stackd.finance.privacy.motion"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .utility
        return queue
    }()
    private var shakeWanted = false
    private var shakeObservers: [NSObjectProtocol] = []
    // motionQueue only.
    private var peaks: [TimeInterval] = []
    private var lastPeak: TimeInterval = -1

    @objc func startShake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.motion.isDeviceMotionAvailable else {
                call.resolve(["native": false])
                return
            }
            self.shakeWanted = true
            self.observeShake()
            if UIApplication.shared.applicationState != .background {
                self.beginMotion()
            }
            call.resolve(["native": true])
        }
    }

    @objc func stopShake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve(["native": false])
                return
            }
            self.shakeWanted = false
            let center = NotificationCenter.default
            self.shakeObservers.forEach { center.removeObserver($0) }
            self.shakeObservers = []
            self.endMotion()
            call.resolve(["native": self.motion.isDeviceMotionAvailable])
        }
    }

    // No motion feed while the app is in the background (battery); it comes
    // back with the app when a shake is still wanted.
    private func observeShake() {
        guard shakeObservers.isEmpty else { return }
        let center = NotificationCenter.default
        let leaving: [Notification.Name] = [UIApplication.didEnterBackgroundNotification, UIScene.didEnterBackgroundNotification]
        let returning: [Notification.Name] = [
            UIApplication.willEnterForegroundNotification, UIScene.willEnterForegroundNotification,
            UIApplication.didBecomeActiveNotification
        ]
        for name in leaving {
            shakeObservers.append(center.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
                self?.endMotion()
            })
        }
        for name in returning {
            shakeObservers.append(center.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
                guard let self = self, self.shakeWanted else { return }
                self.beginMotion()
            })
        }
    }

    // Main thread. Idempotent.
    private func beginMotion() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motionQueue.addOperation { [weak self] in
            self?.peaks = []
            self?.lastPeak = -1
        }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: motionQueue) { [weak self] data, _ in
            guard let self = self, let data = data else { return }
            let a = data.userAcceleration
            let magnitude = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot() * StackdPrivacyPlugin.gravity
            self.sample(magnitude: magnitude, at: data.timestamp)
        }
    }

    // Main thread. Idempotent.
    private func endMotion() {
        if motion.isDeviceMotionActive { motion.stopDeviceMotionUpdates() }
    }

    // motionQueue. `now` is the sample's own timestamp (seconds since boot).
    private func sample(magnitude: Double, at now: TimeInterval) {
        if magnitude < StackdPrivacyPlugin.shakeThreshold { return }
        if lastPeak >= 0 && now - lastPeak < StackdPrivacyPlugin.shakePeakGap { return }
        lastPeak = now
        peaks = peaks.filter { now - $0 <= StackdPrivacyPlugin.shakeWindow }
        peaks.append(now)
        if peaks.count < StackdPrivacyPlugin.shakePeaks { return }
        peaks = []
        notifyListeners("shake", data: [:])
    }
}
