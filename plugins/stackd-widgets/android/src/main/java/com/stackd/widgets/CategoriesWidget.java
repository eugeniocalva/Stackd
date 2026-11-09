package com.stackd.widgets;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// W3 Categories (wide): this month's spending SO FAR, the ring of ≤ 6 slices
// in the app's category colours and the 4 biggest with their amounts.
public class CategoriesWidget extends BaseWidget {
    @Override
    protected String target() {
        return "analytics";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_ring);
        rv.setTextViewText(R.id.title, snap.label("categories", ctx.getString(R.string.stackd_widget_categories_name)));
        text(rv, R.id.stale, snap.staleText());
        JSONObject c = snap.obj("categories");
        JSONArray slices = c == null ? new JSONArray() : c.optJSONArray("slices");
        if (slices == null || slices.length() == 0) {
            Rows.empty(rv, snap.label("noSpending", ""), R.id.body);
            return rv;
        }
        int n = slices.length();
        double[] shares = new double[n];
        int[] colours = new int[n];
        int fallback = ctx.getColor(R.color.stackd_widget_text3);
        for (int i = 0; i < n; i++) {
            JSONObject s = slices.optJSONObject(i);
            shares[i] = s == null ? 0 : s.optDouble("share", 0);
            colours[i] = s == null ? fallback : Draw.color(s.optString("color"), fallback);
        }
        rv.setImageViewBitmap(R.id.ring, Draw.ring(ctx, shares, colours, ctx.getColor(R.color.stackd_widget_track), 96, 12));
        rv.setTextViewText(R.id.ring_center, c.optString("spentText"));
        int shown = Math.min(n, 4);
        for (int i = 0; i < shown; i++) {
            JSONObject s = slices.optJSONObject(i);
            if (s == null) continue;
            String name = s.optString("name");
            rv.setViewVisibility(Rows.ROW[i], View.VISIBLE);
            rv.setImageViewBitmap(Rows.MARK[i], Draw.mark(ctx, name, colours[i], 22));
            rv.setTextViewText(Rows.NAME[i], name);
            rv.setTextViewText(Rows.VALUE[i], s.optString("text"));
        }
        Rows.hideFrom(rv, shown, 4);
        return rv;
    }
}
