import Foundation
import SwiftUI
import UIKit
import WidgetKit

// 1.2.2 (HG-15 WG-5, docs/phone-widgets-plan.md §4): the widgets' read-only
// view of the app's snapshot. The app (src/widgets-native.js) writes every
// text already formatted, translated and masked into the App Group; the
// widgets only pick fields and work out the day, which moves on while the
// app is closed. Every field is optional: an older or newer app never makes
// a widget crash, it shows "Open Stack'd" instead.

enum StackdGroup {
    static let id = "group.com.stackd.finance"
    static let pendingKey = "pendingOpen"

    static var snapshotURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)?
            .appendingPathComponent("widgets", isDirectory: true)
            .appendingPathComponent("snapshot.json")
    }
}

struct Snap: Decodable {
    struct Total: Decodable { let text: String?; let trend: String? }
    struct Account: Decodable { let name: String?; let icon: String?; let color: String?; let text: String?; let trend: String?; let other: Bool? }
    struct Month: Decodable {
        let title: String?; let incomeText: String?; let expenseText: String?
        let netText: String?; let netTrend: String?
        let incomeBar: Double?; let expenseBar: Double?
    }
    struct Slice: Decodable { let name: String?; let icon: String?; let color: String?; let share: Double?; let text: String? }
    struct Cats: Decodable { let spentText: String?; let slices: [Slice]? }
    struct BudgetRow: Decodable { let name: String?; let icon: String?; let ratio: Double?; let pctText: String?; let over: Bool? }
    struct Budgets: Decodable {
        let spentText: String?; let limitText: String?; let ofText: String?
        let ratio: Double?; let pctText: String?; let over: Bool?
        let rows: [BudgetRow]?
    }
    struct Upcoming: Decodable { let date: String?; let dayText: String?; let name: String?; let icon: String?; let text: String?; let kind: String? }
    struct Curve: Decodable {
        let range: String?; let totalText: String?; let changeText: String?
        let pctText: String?; let trend: String?; let points: [Double]?
    }

    let v: Int?
    let day: String?
    let masked: Bool?
    let updatedText: String?
    let labels: [String: String]?
    let empty: Bool?
    let total: Total?
    let accounts: [Account]?
    let accountCount: Int?
    let moreOne: String?
    let moreOther: String?
    let month: Month?
    let categories: Cats?
    let budgets: Budgets?
    let upcoming: [Upcoming]?
    let curve: Curve?

    static let version = 1

    static func load() -> Snap? {
        guard let url = StackdGroup.snapshotURL,
              let data = try? Data(contentsOf: url),
              let snap = try? JSONDecoder().decode(Snap.self, from: data),
              snap.v == version else { return nil }
        return snap
    }

    var hasData: Bool { !(empty ?? true) }

    func label(_ key: String, _ fallback: String = "") -> String {
        let s = labels?[key] ?? ""
        return s.isEmpty ? fallback : s
    }

    // The figures describe an earlier day: say when they were taken.
    func staleText(on date: Date) -> String? {
        guard let d = day, d != Snap.ymd(date), let t = updatedText, !t.isEmpty else { return nil }
        return t
    }

    static func ymd(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

// One timeline for every widget: now, then the next local midnight, so
// Upcoming rolls Today / Tomorrow and the stale stamp appears without the
// app. The app's write reloads every timeline (WidgetCenter) in between.
struct StackdEntry: TimelineEntry {
    let date: Date
    let snap: Snap?
}

struct StackdProvider: TimelineProvider {
    func placeholder(in context: Context) -> StackdEntry {
        StackdEntry(date: Date(), snap: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (StackdEntry) -> Void) {
        completion(StackdEntry(date: Date(), snap: Snap.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StackdEntry>) -> Void) {
        let now = Date()
        let snap = Snap.load()
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400)).addingTimeInterval(5)
        let entries = [StackdEntry(date: now, snap: snap), StackdEntry(date: midnight, snap: snap)]
        completion(Timeline(entries: entries, policy: .after(midnight)))
    }
}

// The app's colours (src/styles/variables.css), light and dark.
enum Palette {
    static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
    static let bg = dyn(0xFFFFFF, 0x161E2E)
    static let text = dyn(0x1A1E21, 0xF8FAFC)
    static let text2 = dyn(0x475569, 0x94A3B8)
    static let track = dyn(0xE2E8F0, 0x1F293D)
    static let income = dyn(0x059669, 0x34D399)
    static let expense = dyn(0xDC2626, 0xF87171)
    static let transfer = dyn(0x2F62A8, 0x8AB4F0)
    static let bar = dyn(0x64748B, 0x94A3B8)
    // Quick add's filled circles: the same in both themes.
    static let addExpense = Color(UIColor(hex: 0xEF4444))
    static let addIncome = Color(UIColor(hex: 0x059669))
    static let addTransfer = Color(UIColor(hex: 0x2F62A8))

    static func trend(_ t: String?) -> Color {
        switch t {
        case "up": return income
        case "down": return expense
        default: return text
        }
    }

    // "#3b82f6" from the snapshot; anything else falls back.
    static func hex(_ s: String?, _ fallback: Color) -> Color {
        guard var h = s, h.hasPrefix("#") else { return fallback }
        h.removeFirst()
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return fallback }
        return Color(UIColor(hex: v))
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

// stackd://open?to=… (the app's WG-2 whitelist).
enum Open {
    static func url(_ query: String) -> URL {
        URL(string: "stackd://open?to=\(query)") ?? URL(string: "stackd://open")!
    }
}
