package com.stackd.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// W6 Balance curve (wide): every primary-currency account over the last
// month, today's total and the change, in the trend colour as on Home.
public class CurveWidget extends BaseWidget {
    @Override
    protected String target() {
        return "home";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_curve);
        text(rv, R.id.stale, snap.staleText());
        JSONObject c = snap.obj("curve");
        String title = snap.label("curve", ctx.getString(R.string.stackd_widget_curve_name));
        if (c == null) {
            rv.setTextViewText(R.id.title, title);
            JSONObject total = snap.obj("total");
            rv.setTextViewText(R.id.headline, total == null ? "" : total.optString("text"));
            return rv;
        }
        rv.setTextViewText(R.id.title, title + " · " + snap.label("range", "1M"));
        rv.setTextViewText(R.id.headline, c.optString("totalText"));
        int colour = trendColor(ctx, c.optString("trend"));
        String pct = c.optString("pctText");
        rv.setTextViewText(R.id.caption, c.optString("changeText") + (pct.isEmpty() ? "" : "  " + pct));
        rv.setTextColor(R.id.caption, colour);
        JSONArray p = c.optJSONArray("points");
        double[] pts = new double[p == null ? 0 : p.length()];
        for (int i = 0; i < pts.length; i++) pts[i] = p.optDouble(i, 0.5);
        if ("flat".equals(c.optString("trend"))) colour = ctx.getColor(R.color.stackd_widget_text2);
        rv.setImageViewBitmap(R.id.curve, Draw.curve(ctx, pts, colour, wide ? 300 : 150, 64));
        return rv;
    }
}
