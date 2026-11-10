package com.stackd.widgets;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// W5 Upcoming (small + wide): the next scheduled payments. The snapshot holds
// 35 dated days, so the widget drops the days that have passed and names
// Today / Tomorrow itself, even while the app stays closed. A row opens
// History on its day.
public class UpcomingWidget extends BaseWidget {
    private static final int[] SUB = { R.id.row1_sub, R.id.row2_sub, R.id.row3_sub, R.id.row4_sub, R.id.row5_sub, R.id.row6_sub, R.id.row7_sub, R.id.row8_sub };

    @Override
    protected String target() {
        return "history";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_list);
        rv.setTextViewText(R.id.title, snap.label("upcoming", ctx.getString(R.string.stackd_widget_upcoming_name)));
        text(rv, R.id.stale, snap.staleText());
        String today = Snapshot.today();
        String tomorrow = Snapshot.tomorrow();
        JSONArray all = snap.arr("upcoming");
        int max = wide ? rowsFor(50, 54, 2, 8) : 2;
        int shown = 0;
        for (int i = 0; i < all.length() && shown < max; i++) {
            JSONObject r = all.optJSONObject(i);
            if (r == null) continue;
            String date = r.optString("date");
            if (date.compareTo(today) < 0) continue; // a day that has passed
            String day = date.equals(today) ? snap.label("today", r.optString("dayText"))
                : date.equals(tomorrow) ? snap.label("tomorrow", r.optString("dayText"))
                : r.optString("dayText");
            String kind = r.optString("kind");
            int colour = "income".equals(kind) ? ctx.getColor(R.color.stackd_widget_income)
                : "transfer".equals(kind) ? ctx.getColor(R.color.stackd_widget_transfer)
                : ctx.getColor(R.color.stackd_widget_text); // spending stays neutral (HG-11)
            String name = r.optString("name");
            rv.setViewVisibility(Rows.ROW[shown], View.VISIBLE);
            if (wide) {
                rv.setViewVisibility(Rows.MARK[shown], View.VISIBLE);
                rv.setImageViewBitmap(Rows.MARK[shown], Draw.mark(ctx, name, "transfer".equals(kind) ? colour : ctx.getColor(R.color.stackd_widget_text2), 28));
            } else {
                rv.setViewVisibility(Rows.MARK[shown], View.GONE);
            }
            rv.setTextViewText(Rows.NAME[shown], name);
            text(rv, SUB[shown], day);
            rv.setTextViewText(Rows.VALUE[shown], r.optString("text"));
            rv.setTextColor(Rows.VALUE[shown], colour);
            rv.setOnClickPendingIntent(Rows.ROW[shown], open(ctx, "history&day=" + date, shown));
            shown++;
        }
        Rows.hideFrom(rv, shown, 8);
        if (shown == 0) Rows.empty(rv, snap.label("nothingScheduled", ""));
        return rv;
    }
}
