package com.stackd.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

// 1.2.2 (HG-15 WG-4, docs/phone-widgets-plan.md §2): one provider per widget.
// Each draws the app's snapshot (Snapshot) into RemoteViews; a missing or
// empty snapshot draws the "Open Stack'd" card. Redraws come from the plugin
// after every write, from updatePeriodMillis (30 min: the day rolls on its
// own) and from a resize (small ↔ wide layout).
public abstract class BaseWidget extends AppWidgetProvider {

    // Below this width (dp) a resizable widget uses its small layout.
    static final int WIDE_MIN_DP = 220;

    // The widget's height (dp) for this draw: a taller Account balances or
    // Upcoming lists more rows (2026-11-10).
    protected int heightDp = 0;

    protected abstract RemoteViews build(Context ctx, Snapshot snap, boolean wide);

    // The widget's tap when it has data (stackd://open?to=…).
    protected abstract String target();

    // Quick add draws without any data; every other widget needs a snapshot.
    protected boolean needsData() {
        return true;
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Snapshot snap = Snapshot.load(ctx);
        for (int id : ids) draw(ctx, mgr, id, snap);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        draw(ctx, mgr, id, Snapshot.load(ctx));
    }

    private void draw(Context ctx, AppWidgetManager mgr, int id, Snapshot snap) {
        RemoteViews rv;
        try {
            if (needsData() && (snap == null || snap.isEmpty())) {
                rv = placeholder(ctx, snap);
            } else {
                heightDp = heightOf(mgr, id);
                rv = build(ctx, snap, isWide(mgr, id));
                if (rv.getLayoutId() != 0) rv.setOnClickPendingIntent(R.id.widget_root, open(ctx, target(), id));
            }
        } catch (Exception e) {
            // a malformed snapshot never crashes the launcher's widget host
            rv = placeholder(ctx, null);
        }
        mgr.updateAppWidget(id, rv);
    }

    static boolean isWide(AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        return w == 0 || w >= WIDE_MIN_DP;
    }

    // Portrait height: the launcher's MAX height (MIN is the landscape one).
    static int heightOf(AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        if (o == null) return 0;
        int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return h > 0 ? h : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
    }

    // How many rows of rowDp fit under a header of headerDp, between min and max.
    int rowsFor(int headerDp, int rowDp, int min, int max) {
        if (heightDp <= 0) return min;
        return Math.max(min, Math.min(max, (heightDp - headerDp) / rowDp));
    }

    static RemoteViews placeholder(Context ctx, Snapshot snap) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_placeholder);
        String open = snap != null ? snap.label("open", ctx.getString(R.string.stackd_widget_open)) : ctx.getString(R.string.stackd_widget_open);
        rv.setTextViewText(R.id.placeholder_text, open);
        rv.setOnClickPendingIntent(R.id.widget_root, open(ctx, "home", 0));
        return rv;
    }

    // A tap opens the app on stackd://open?to=… (WG-2's whitelist). The
    // request code keeps each target's intent distinct.
    static PendingIntent open(Context ctx, String query, int salt) {
        Uri uri = Uri.parse("stackd://open?to=" + query);
        Intent i = new Intent(Intent.ACTION_VIEW, uri);
        i.setPackage(ctx.getPackageName());
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int code = (query + "#" + salt).hashCode();
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void text(RemoteViews rv, int id, String s) {
        rv.setTextViewText(id, s == null ? "" : s);
        rv.setViewVisibility(id, s == null || s.isEmpty() ? View.GONE : View.VISIBLE);
    }

    static int trendColor(Context ctx, String trend) {
        if ("up".equals(trend)) return ctx.getColor(R.color.stackd_widget_income);
        if ("down".equals(trend)) return ctx.getColor(R.color.stackd_widget_expense);
        return ctx.getColor(R.color.stackd_widget_text);
    }
}
