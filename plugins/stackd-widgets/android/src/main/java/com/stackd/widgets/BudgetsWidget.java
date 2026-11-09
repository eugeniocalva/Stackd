package com.stackd.widgets;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// W4 Budget goals (wide): total spent of the total limit, then the 3
// categories closest to (or over) their limit. Red only when over (HG-8).
public class BudgetsWidget extends BaseWidget {
    private static final int[] ROW = { R.id.row1, R.id.row2, R.id.row3 };
    private static final int[] NAME = { R.id.row1_name, R.id.row2_name, R.id.row3_name };
    private static final int[] VALUE = { R.id.row1_value, R.id.row2_value, R.id.row3_value };
    private static final int[] BAR = { R.id.row1_bar, R.id.row2_bar, R.id.row3_bar };

    @Override
    protected String target() {
        return "budget";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_budget);
        rv.setTextViewText(R.id.title, snap.label("budgets", ctx.getString(R.string.stackd_widget_budgets_name)));
        text(rv, R.id.stale, snap.staleText());
        JSONObject b = snap.obj("budgets");
        if (b == null) {
            Rows.empty(rv, snap.label("noBudgets", ""), R.id.body);
            return rv;
        }
        int expense = ctx.getColor(R.color.stackd_widget_expense);
        int text = ctx.getColor(R.color.stackd_widget_text);
        int text2 = ctx.getColor(R.color.stackd_widget_text2);
        rv.setTextViewText(R.id.headline, b.optString("spentText"));
        rv.setTextViewText(R.id.caption, b.optString("ofText"));
        rv.setTextViewText(R.id.pct, b.optString("pctText"));
        rv.setTextColor(R.id.pct, b.optBoolean("over") ? expense : text);
        JSONArray rows = b.optJSONArray("rows");
        int n = rows == null ? 0 : Math.min(rows.length(), 3);
        float w = wide ? 280 : 130;
        int track = ctx.getColor(R.color.stackd_widget_track);
        int fill = ctx.getColor(R.color.stackd_widget_bar);
        for (int i = 0; i < 3; i++) {
            JSONObject r = i < n ? rows.optJSONObject(i) : null;
            if (r == null) { rv.setViewVisibility(ROW[i], View.GONE); continue; }
            boolean over = r.optBoolean("over");
            rv.setViewVisibility(ROW[i], View.VISIBLE);
            rv.setTextViewText(NAME[i], r.optString("name"));
            rv.setTextViewText(VALUE[i], r.optString("pctText"));
            rv.setTextColor(VALUE[i], over ? expense : text2);
            rv.setImageViewBitmap(BAR[i], Draw.bar(ctx, r.optDouble("ratio", 0), over ? expense : fill, track, w, 5));
        }
        return rv;
    }
}
