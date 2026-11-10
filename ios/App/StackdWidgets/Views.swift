import SwiftUI
import WidgetKit

// 1.2.2 (HG-15 WG-5, docs/phone-widgets-plan.md §2): the widgets' SwiftUI
// views. Amounts are .privacySensitive(): iOS blanks them on a locked phone
// (Lock Screen, StandBy) while names and dates stay (owner, Q4). Hidden
// balances in the app already arrive masked in the snapshot.
// 2026-11-10 (owner, phone check): bigger text everywhere — titles at
// subheadline, rows at subheadline/body — and a large Account balances that
// lists every account. Each layout is sized to the family's height (a medium
// widget has about 123 pt inside its margins); amounts shrink rather than
// cut off (minimumScaleFactor).

// ── shared pieces ─────────────────────────────────────────────────────────

struct Header: View {
    let title: String
    let stale: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.subheadline).foregroundStyle(Palette.text2).lineLimit(1)
            Spacer(minLength: 4)
            if let s = stale {
                Text(s).font(.caption).foregroundStyle(Palette.text2).lineLimit(1)
            }
        }
    }
}

// A round mark: the colour at 16 % behind the name's first letter in the
// colour (HG-9's "colour on a neutral circle"; Android shows the same).
struct Mark: View {
    let name: String
    let color: Color
    var size: CGFloat = 26
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
    var height: CGFloat = 6
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

// An amount: bold, never cut off (it shrinks first), blanked when locked.
struct Amount: View {
    let text: String?
    var font: Font = .subheadline.bold()
    var color: Color = Palette.text
    var body: some View {
        Text(text ?? "").font(font).foregroundStyle(color)
            .lineLimit(1).minimumScaleFactor(0.7).privacySensitive()
    }
}

struct EmptyNote: View {
    let text: String
    var body: some View {
        Text(text).font(.body).foregroundStyle(Palette.text2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct OpenApp: View {
    let snap: Snap?
    var body: some View {
        Text(snap?.label("open", String(localized: "widget.open")) ?? String(localized: "widget.open"))
            .font(.body.bold())
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

// ── W1 Account balances (wide; large lists every account) ────────────────

struct BalancesView: View {
    let entry: StackdEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let s = entry.snap, s.hasData {
            let large = family == .systemLarge
            let accounts = s.accounts ?? []
            let shown = Array(accounts.prefix(large ? 8 : 2))
            let rest = (s.accountCount ?? accounts.count) - shown.count
            VStack(alignment: .leading, spacing: large ? 7 : 4) {
                Header(title: s.label("accounts", String(localized: "widget.balances.name")), stale: s.staleText(on: entry.date))
                Amount(text: s.total?.text, font: large ? .title.bold() : .title2.bold(), color: Palette.trend(s.total?.trend))
                if large { Divider().overlay(Palette.track) }
                ForEach(Array(shown.enumerated()), id: \.offset) { _, a in
                    HStack(spacing: 10) {
                        Mark(name: a.name ?? "", color: Palette.hex(a.color, Palette.text2), size: large ? 30 : 26)
                        Text(a.name ?? "").font(.body).foregroundStyle(Palette.text).lineLimit(1)
                        Spacer(minLength: 6)
                        Amount(text: a.text, font: .body.bold(), color: Palette.trend(a.trend))
                    }
                }
                if rest > 0, let tpl = (rest == 1 ? s.moreOne : s.moreOther) {
                    Text(tpl.replacingOccurrences(of: "{n}", with: String(rest)))
                        .font(.footnote).foregroundStyle(Palette.text2)
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
                    Amount(text: m.netText, font: .title2.bold(), color: Palette.trend(m.netTrend))
                    Text("\(m.title ?? "") · \(s.label("eom"))").font(.footnote).foregroundStyle(Palette.text2).lineLimit(1)
                    Spacer(minLength: 0)
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
                Text(label).font(.subheadline).foregroundStyle(Palette.text2).lineLimit(1)
                Spacer(minLength: 4)
                Amount(text: value, color: color)
            }
            Bar(fraction: fraction ?? 0, fill: color)
        }
    }
}

// ── W3 Categories (wide) ──────────────────────────────────────────────────

struct Ring: View {
    let shares: [Double]
    let colors: [Color]
    var line: CGFloat = 12
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
                            Amount(text: c.spentText, font: .footnote.bold())
                                .padding(.horizontal, 15)
                        }
                        .frame(width: 92, height: 92)
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(slices.prefix(4).enumerated()), id: \.offset) { i, sl in
                                HStack(spacing: 7) {
                                    Mark(name: sl.name ?? "", color: colors[i], size: 20)
                                    Text(sl.name ?? "").font(.subheadline).foregroundStyle(Palette.text).lineLimit(1)
                                    Spacer(minLength: 4)
                                    Amount(text: sl.text)
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
            VStack(alignment: .leading, spacing: 5) {
                Header(title: s.label("budgets", String(localized: "widget.budgets.name")), stale: s.staleText(on: entry.date))
                if let b = s.budgets {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Amount(text: b.spentText, font: .title3.bold())
                        Text(b.ofText ?? "").font(.footnote).foregroundStyle(Palette.text2)
                            .lineLimit(1).minimumScaleFactor(0.8).privacySensitive()
                        Spacer(minLength: 4)
                        Text(b.pctText ?? "").font(.subheadline.bold())
                            .foregroundStyle((b.over ?? false) ? Palette.expense : Palette.text).lineLimit(1)
                    }
                    // two rows: the ones closest to (or over) their limit
                    ForEach(Array((b.rows ?? []).prefix(2).enumerated()), id: \.offset) { _, r in
                        let over = r.over ?? false
                        VStack(spacing: 3) {
                            HStack {
                                Text(r.name ?? "").font(.subheadline).foregroundStyle(Palette.text).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(r.pctText ?? "").font(.subheadline.bold())
                                    .foregroundStyle(over ? Palette.expense : Palette.text2).lineLimit(1)
                            }
                            Bar(fraction: r.ratio ?? 0, fill: over ? Palette.expense : Palette.bar)
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
            VStack(alignment: .leading, spacing: wide ? 6 : 5) {
                Header(title: s.label("upcoming", String(localized: "widget.upcoming.name")), stale: s.staleText(on: entry.date))
                if rows.isEmpty {
                    EmptyNote(text: s.label("nothingScheduled"))
                } else {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        let day = r.date == today ? s.label("today", r.dayText ?? "")
                            : r.date == tomorrow ? s.label("tomorrow", r.dayText ?? "") : (r.dayText ?? "")
                        if wide {
                            Link(destination: Open.url("history&day=\(r.date ?? "")")) { wideRow(r, day: day) }
                        } else {
                            smallRow(r, day: day)
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

    // wide: one line per payment — mark, name, day, amount
    private func wideRow(_ r: Snap.Upcoming, day: String) -> some View {
        HStack(spacing: 9) {
            Mark(name: r.name ?? "", color: r.kind == "transfer" ? Palette.transfer : Palette.text2)
            Text(r.name ?? "").font(.subheadline).foregroundStyle(Palette.text).lineLimit(1)
            Text(day).font(.footnote).foregroundStyle(Palette.text2).lineLimit(1)
            Spacer(minLength: 4)
            Amount(text: r.text, color: color(r.kind))
        }
    }

    // small: the name with its day underneath, the amount on the right
    private func smallRow(_ r: Snap.Upcoming, day: String) -> some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                Text(r.name ?? "").font(.subheadline).foregroundStyle(Palette.text).lineLimit(1)
                Text(day).font(.footnote).foregroundStyle(Palette.text2).lineLimit(1)
            }
            Spacer(minLength: 4)
            Amount(text: r.text, color: color(r.kind))
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
                        Amount(text: c.totalText, font: .title2.bold())
                        Spacer(minLength: 6)
                        Amount(text: [c.changeText ?? "", c.pctText ?? ""].filter { !$0.isEmpty }.joined(separator: "  "),
                               color: color)
                    }
                    let pts = c.points ?? []
                    ZStack {
                        CurveShape(points: pts, closed: true).fill(color.opacity(0.15))
                        CurveShape(points: pts, closed: false)
                            .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    }
                    .padding(.vertical, 2)
                    .accessibilityHidden(true)
                } else {
                    Header(title: title, stale: s.staleText(on: entry.date))
                    Amount(text: s.total?.text, font: .title2.bold())
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
