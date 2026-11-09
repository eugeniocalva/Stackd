import SwiftUI
import WidgetKit

// 1.2.2 (HG-15 WG-5, docs/phone-widgets-plan.md §2): the widgets' SwiftUI
// views. Amounts are .privacySensitive(): iOS blanks them on a locked phone
// (Lock Screen, StandBy) while names and dates stay (owner, Q4). Hidden
// balances in the app already arrive masked in the snapshot.

// ── shared pieces ─────────────────────────────────────────────────────────

struct Header: View {
    let title: String
    let stale: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.caption).foregroundStyle(Palette.text2).lineLimit(1)
            Spacer(minLength: 4)
            if let s = stale {
                Text(s).font(.caption2).foregroundStyle(Palette.text2).lineLimit(1)
            }
        }
    }
}

// A round mark: the colour at 16 % behind the name's first letter in the
// colour (HG-9's "colour on a neutral circle"; Android shows the same).
struct Mark: View {
    let name: String
    let color: Color
    var size: CGFloat = 22
    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.16))
            Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                .font(.system(size: size * 0.46, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct Bar: View {
    let fraction: Double
    let fill: Color
    var height: CGFloat = 5
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Capsule().fill(fill)
                    .frame(width: max(height, g.size.width * CGFloat(min(max(fraction, 0), 1))))
                    .opacity(fraction > 0 ? 1 : 0)
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

struct EmptyNote: View {
    let text: String
    var body: some View {
        Text(text).font(.subheadline).foregroundStyle(Palette.text2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct OpenApp: View {
    let snap: Snap?
    var body: some View {
        Text(snap?.label("open", String(localized: "widget.open")) ?? String(localized: "widget.open"))
            .font(.subheadline.bold())
            .foregroundStyle(Palette.text)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .widgetURL(Open.url("home"))
    }
}

extension View {
    func stackdCard() -> some View {
        containerBackground(for: .widget) { Palette.bg }
    }
}

// ── W1 Account balances (wide) ────────────────────────────────────────────

struct BalancesView: View {
    let entry: StackdEntry
    var body: some View {
        if let s = entry.snap, s.hasData {
            let accounts = s.accounts ?? []
            let shown = Array(accounts.prefix(3))
            let rest = (s.accountCount ?? accounts.count) - shown.count
            VStack(alignment: .leading, spacing: 4) {
                Header(title: s.label("accounts", String(localized: "widget.balances.name")), stale: s.staleText(on: entry.date))
                Text(s.total?.text ?? "").font(.title2.bold()).foregroundStyle(Palette.trend(s.total?.trend))
                    .lineLimit(1).minimumScaleFactor(0.6).privacySensitive()
                ForEach(Array(shown.enumerated()), id: \.offset) { _, a in
                    HStack(spacing: 8) {
                        Mark(name: a.name ?? "", color: Palette.hex(a.color, Palette.text2))
                        Text(a.name ?? "").font(.subheadline).foregroundStyle(Palette.text).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(a.text ?? "").font(.subheadline.bold()).foregroundStyle(Palette.trend(a.trend))
                            .lineLimit(1).privacySensitive()
                    }
                }
                if rest > 0, let tpl = (rest == 1 ? s.moreOne : s.moreOther) {
                    Text(tpl.replacingOccurrences(of: "{n}", with: String(rest))).font(.caption2).foregroundStyle(Palette.text2)
                }
                Spacer(minLength: 0)
            }
            .widgetURL(Open.url("home"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }
}

// ── W2 Income vs Expenses (small + wide) ──────────────────────────────────

struct FlowView: View {
    let entry: StackdEntry
    var body: some View {
        if let s = entry.snap, s.hasData {
            VStack(alignment: .leading, spacing: 3) {
                Header(title: s.label("incomeExpense", String(localized: "widget.flow.name")), stale: s.staleText(on: entry.date))
                if let m = s.month {
                    Text(m.netText ?? "").font(.title2.bold()).foregroundStyle(Palette.trend(m.netTrend))
                        .lineLimit(1).minimumScaleFactor(0.6).privacySensitive()
                    Text("\(m.title ?? "") · \(s.label("eom"))").font(.caption2).foregroundStyle(Palette.text2).lineLimit(1)
                    Spacer(minLength: 2)
                    row(s.label("income"), m.incomeText, m.incomeBar, Palette.income)
                    row(s.label("expense"), m.expenseText, m.expenseBar, Palette.expense)
                } else {
                    EmptyNote(text: s.label("nothingMonth"))
                }
            }
            .widgetURL(Open.url("analytics"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }

    private func row(_ label: String, _ value: String?, _ fraction: Double?, _ color: Color) -> some View {
        VStack(spacing: 3) {
            HStack {
                Text(label).font(.caption).foregroundStyle(Palette.text2).lineLimit(1)
                Spacer(minLength: 4)
                Text(value ?? "").font(.caption.bold()).foregroundStyle(color).lineLimit(1).privacySensitive()
            }
            Bar(fraction: fraction ?? 0, fill: color)
        }
    }
}

// ── W3 Categories (wide) ──────────────────────────────────────────────────

struct Ring: View {
    let shares: [Double]
    let colors: [Color]
    var line: CGFloat = 11
    var body: some View {
        ZStack {
            Circle().stroke(Palette.track, lineWidth: line)
            ForEach(Array(shares.indices), id: \.self) { i in
                let start = shares.prefix(i).reduce(0, +)
                let gap = shares.count > 1 ? 0.004 : 0
                Circle()
                    .trim(from: CGFloat(start + gap), to: CGFloat(max(start + gap, start + shares[i] - gap)))
                    .stroke(colors[i], style: StrokeStyle(lineWidth: line, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
        }
        .padding(line / 2)
        .accessibilityHidden(true)
    }
}

struct CategoriesView: View {
    let entry: StackdEntry
    var body: some View {
        if let s = entry.snap, s.hasData {
            VStack(alignment: .leading, spacing: 6) {
                Header(title: s.label("categories", String(localized: "widget.categories.name")), stale: s.staleText(on: entry.date))
                if let c = s.categories, let slices = c.slices, !slices.isEmpty {
                    let colors = slices.map { Palette.hex($0.color, Palette.bar) }
                    HStack(spacing: 12) {
                        ZStack {
                            Ring(shares: slices.map { $0.share ?? 0 }, colors: colors)
                            Text(c.spentText ?? "").font(.caption.bold()).foregroundStyle(Palette.text)
                                .lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, 14).privacySensitive()
                        }
                        .frame(width: 86, height: 86)
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(slices.prefix(4).enumerated()), id: \.offset) { i, sl in
                                HStack(spacing: 6) {
                                    Mark(name: sl.name ?? "", color: colors[i], size: 18)
                                    Text(sl.name ?? "").font(.caption).foregroundStyle(Palette.text).lineLimit(1)
                                    Spacer(minLength: 4)
                                    Text(sl.text ?? "").font(.caption.bold()).foregroundStyle(Palette.text).lineLimit(1).privacySensitive()
                                }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                } else {
                    EmptyNote(text: s.label("noSpending"))
                }
            }
            .widgetURL(Open.url("analytics"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }
}

// ── W4 Budget goals (wide) ────────────────────────────────────────────────

struct BudgetsView: View {
    let entry: StackdEntry
    var body: some View {
        if let s = entry.snap, s.hasData {
            VStack(alignment: .leading, spacing: 4) {
                Header(title: s.label("budgets", String(localized: "widget.budgets.name")), stale: s.staleText(on: entry.date))
                if let b = s.budgets {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(b.spentText ?? "").font(.title3.bold()).foregroundStyle(Palette.text).lineLimit(1).privacySensitive()
                        Text(b.ofText ?? "").font(.caption2).foregroundStyle(Palette.text2).lineLimit(1).privacySensitive()
                        Spacer(minLength: 4)
                        Text(b.pctText ?? "").font(.caption.bold())
                            .foregroundStyle((b.over ?? false) ? Palette.expense : Palette.text).lineLimit(1)
                    }
                    ForEach(Array((b.rows ?? []).prefix(3).enumerated()), id: \.offset) { _, r in
                        let over = r.over ?? false
                        VStack(spacing: 2) {
                            HStack {
                                Text(r.name ?? "").font(.caption).foregroundStyle(Palette.text).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(r.pctText ?? "").font(.caption.bold())
                                    .foregroundStyle(over ? Palette.expense : Palette.text2).lineLimit(1)
                            }
                            Bar(fraction: r.ratio ?? 0, fill: over ? Palette.expense : Palette.bar, height: 4)
                        }
                    }
                    Spacer(minLength: 0)
                } else {
                    EmptyNote(text: s.label("noBudgets"))
                }
            }
            .widgetURL(Open.url("budget"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }
}

// ── W5 Upcoming (small + wide) ────────────────────────────────────────────

struct UpcomingView: View {
    let entry: StackdEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let s = entry.snap, s.hasData {
            let today = Snap.ymd(entry.date)
            let tomorrow = Snap.ymd(entry.date.addingTimeInterval(86_400))
            let wide = family != .systemSmall
            let rows = Array((s.upcoming ?? []).filter { ($0.date ?? "") >= today }.prefix(wide ? 3 : 2))
            VStack(alignment: .leading, spacing: 5) {
                Header(title: s.label("upcoming", String(localized: "widget.upcoming.name")), stale: s.staleText(on: entry.date))
                if rows.isEmpty {
                    EmptyNote(text: s.label("nothingScheduled"))
                } else {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        let day = r.date == today ? s.label("today", r.dayText ?? "")
                            : r.date == tomorrow ? s.label("tomorrow", r.dayText ?? "") : (r.dayText ?? "")
                        let line = rowView(r, day: day, wide: wide)
                        if wide {
                            Link(destination: Open.url("history&day=\(r.date ?? "")")) { line }
                        } else {
                            line
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .widgetURL(Open.url(rows.first.map { "history&day=\($0.date ?? "")" } ?? "history"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }

    private func color(_ kind: String?) -> Color {
        switch kind {
        case "income": return Palette.income
        case "transfer": return Palette.transfer
        default: return Palette.text // spending stays neutral (HG-11)
        }
    }

    private func rowView(_ r: Snap.Upcoming, day: String, wide: Bool) -> some View {
        HStack(spacing: 8) {
            if wide {
                Mark(name: r.name ?? "", color: r.kind == "transfer" ? Palette.transfer : Palette.text2)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(r.name ?? "").font(.caption).foregroundStyle(Palette.text).lineLimit(1)
                Text(day).font(.caption2).foregroundStyle(Palette.text2).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(r.text ?? "").font(.caption.bold()).foregroundStyle(color(r.kind)).lineLimit(1).privacySensitive()
        }
    }
}

// ── W6 Balance curve (wide) ───────────────────────────────────────────────

struct CurveShape: Shape {
    let points: [Double]
    let closed: Bool
    func path(in rect: CGRect) -> Path {
        var p = Path()
        guard points.count > 1 else { return p }
        for (i, v) in points.enumerated() {
            let x = rect.minX + rect.width * CGFloat(i) / CGFloat(points.count - 1)
            let y = rect.minY + rect.height * CGFloat(1 - min(max(v, 0), 1))
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        if closed {
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.closeSubpath()
        }
        return p
    }
}

struct CurveView: View {
    let entry: StackdEntry
    var body: some View {
        if let s = entry.snap, s.hasData {
            let title = s.label("curve", String(localized: "widget.curve.name"))
            VStack(alignment: .leading, spacing: 4) {
                if let c = s.curve {
                    let color = c.trend == "flat" ? Palette.text2 : Palette.trend(c.trend)
                    Header(title: "\(title) · \(s.label("range", "1M"))", stale: s.staleText(on: entry.date))
                    HStack(alignment: .firstTextBaseline) {
                        Text(c.totalText ?? "").font(.title2.bold()).foregroundStyle(Palette.text)
                            .lineLimit(1).minimumScaleFactor(0.6).privacySensitive()
                        Spacer(minLength: 6)
                        Text([c.changeText ?? "", c.pctText ?? ""].filter { !$0.isEmpty }.joined(separator: "  "))
                            .font(.caption.bold()).foregroundStyle(color).lineLimit(1).privacySensitive()
                    }
                    let pts = c.points ?? []
                    ZStack {
                        CurveShape(points: pts, closed: true).fill(color.opacity(0.15))
                        CurveShape(points: pts, closed: false)
                            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    }
                    .padding(.vertical, 2)
                    .accessibilityHidden(true)
                } else {
                    Header(title: title, stale: s.staleText(on: entry.date))
                    Text(s.total?.text ?? "").font(.title2.bold()).foregroundStyle(Palette.text).privacySensitive()
                    Spacer(minLength: 0)
                }
            }
            .widgetURL(Open.url("home"))
        } else {
            OpenApp(snap: entry.snap)
        }
    }
}

// ── W7 Quick add (small) and L1 (Lock Screen) ─────────────────────────────

struct QuickAddView: View {
    let entry: StackdEntry
    var body: some View {
        HStack(spacing: 10) {
            circle("expense", "minus", Palette.addExpense, "expenseBtn", "widget.expense")
            circle("income", "plus", Palette.addIncome, "incomeBtn", "widget.income")
            circle("transfer", "arrow.left.arrow.right", Palette.addTransfer, "transferBtn", "widget.transfer")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(Open.url("add"))
    }

    private func circle(_ type: String, _ symbol: String, _ color: Color, _ labelKey: String, _ fallbackKey: String.LocalizationValue) -> some View {
        let label = entry.snap?.label(labelKey, String(localized: fallbackKey)) ?? String(localized: fallbackKey)
        return Button(intent: QuickAddIntent(type: type)) {
            ZStack {
                Circle().fill(color)
                Image(systemName: symbol).font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
            }
            .frame(width: 40, height: 40)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct QuickAddLockView: View {
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "plus").font(.system(size: 22, weight: .semibold))
        }
        .widgetURL(Open.url("add"))
        .accessibilityLabel(Text("widget.quick.name"))
    }
}
