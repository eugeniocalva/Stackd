import AppIntents
import Foundation

// 1.2.2 (HG-15 WG-5): one Quick add circle. A small widget has a single tap
// area unless its controls are App Intent buttons (iOS 17), so each circle is
// a Button running this intent. It opens the app and leaves the target in
// the App Group, where the app's StackdWidgets plugin (takePending) picks it
// up on launch and resume. Compiled into both the extension and the App
// target, because an intent that opens the app may run in the app's process.
@available(iOS 17.0, *)
struct QuickAddIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick add"
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    @Parameter(title: "Type")
    var type: String

    init() {
        self.type = "expense"
    }

    init(type: String) {
        self.type = type
    }

    func perform() async throws -> some IntentResult {
        let kind = ["expense", "income", "transfer"].contains(type) ? type : "expense"
        UserDefaults(suiteName: "group.com.stackd.finance")?
            .set("stackd://open?to=add&type=\(kind)", forKey: "pendingOpen")
        return .result()
    }
}
