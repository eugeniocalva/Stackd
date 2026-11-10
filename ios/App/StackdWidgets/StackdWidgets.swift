import SwiftUI
import WidgetKit

// 1.2.2 (HG-15 WG-5, docs/phone-widgets-plan.md §2): Stack'd's Home Screen and
// Lock Screen widgets. All of them draw the one snapshot the app writes to
// the App Group (Snapshot.swift); names and descriptions in the widget
// gallery come from Localizable.xcstrings (en/fr/it/es/pt).

@main
struct StackdWidgetsBundle: WidgetBundle {
    var body: some Widget {
        BalancesWidget()
        FlowWidget()
        CategoriesWidget()
        BudgetsWidget()
        UpcomingWidget()
        CurveWidget()
        QuickAddWidget()
        QuickAddLockWidget()
    }
}

struct BalancesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdBalances", provider: StackdProvider()) { e in
            BalancesView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.balances.name"))
        .description(Text("widget.balances.desc"))
        // 2026-11-10 (owner): a large size that lists every account
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct FlowWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdFlow", provider: StackdProvider()) { e in
            FlowView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.flow.name"))
        .description(Text("widget.flow.desc"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CategoriesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdCategories", provider: StackdProvider()) { e in
            CategoriesView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.categories.name"))
        .description(Text("widget.categories.desc"))
        .supportedFamilies([.systemMedium])
    }
}

struct BudgetsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdBudgets", provider: StackdProvider()) { e in
            BudgetsView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.budgets.name"))
        .description(Text("widget.budgets.desc"))
        .supportedFamilies([.systemMedium])
    }
}

struct UpcomingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdUpcoming", provider: StackdProvider()) { e in
            UpcomingView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.upcoming.name"))
        .description(Text("widget.upcoming.desc"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CurveWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdCurve", provider: StackdProvider()) { e in
            CurveView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.curve.name"))
        .description(Text("widget.curve.desc"))
        .supportedFamilies([.systemMedium])
    }
}

struct QuickAddWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdQuickAdd", provider: StackdProvider()) { e in
            QuickAddView(entry: e).stackdCard()
        }
        .configurationDisplayName(Text("widget.quick.name"))
        .description(Text("widget.quick.desc"))
        .supportedFamilies([.systemSmall])
    }
}

struct QuickAddLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StackdQuickAddLock", provider: StackdProvider()) { _ in
            QuickAddLockView().containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName(Text("widget.quick.name"))
        .description(Text("widget.quick.desc"))
        .supportedFamilies([.accessoryCircular])
    }
}
