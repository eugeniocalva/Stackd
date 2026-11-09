package com.stackd.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

// W2 Income vs Expenses (small + wide): this month to the END of the month
// (the Home card's EOM side), the net on top, income and expenses as bars.
public class FlowWidget extends BaseWidget {
    @Override
    protected String target() {
        return "analytics";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_flow);
        rv.setTextViewText(R.id.title, snap.label("incomeExpense", ctx.getString(R.string.stackd_widget_flow_name)));
        text(rv, R.id.stale, snap.staleText());
        JSONObject m = snap.obj("month");
        if (m == null) {
            Rows.empty(rv, snap.label("nothingMonth", ""), R.id.headline, R.id.caption, R.id.in_row, R.id.in_bar, R.id.out_row, R.id.out_bar);
            return rv;
        }
        rv.setTextViewText(R.id.headline, m.optString("netText"));
        rv.setTextColor(R.id.headline, trendColor(ctx, m.optString("netTrend")));
        rv.setTextViewText(R.id.caption, m.optString("title") + " · " + snap.label("eom", ""));
        rv.setTextViewText(R.id.in_label, snap.label("income", ""));
        rv.setTextViewText(R.id.in_value, m.optString("incomeText"));
        rv.setTextViewText(R.id.out_label, snap.label("expense", ""));
        rv.setTextViewText(R.id.out_value, m.optString("expenseText"));
        float w = wide ? 280 : 130;
        int track = ctx.getColor(R.color.stackd_widget_track);
        rv.setImageViewBitmap(R.id.in_bar, Draw.bar(ctx, m.optDouble("incomeBar", 0), ctx.getColor(R.color.stackd_widget_income), track, w, 6));
        rv.setImageViewBitmap(R.id.out_bar, Draw.bar(ctx, m.optDouble("expenseBar", 0), ctx.getColor(R.color.stackd_widget_expense), track, w, 6));
        return rv;
    }
}
