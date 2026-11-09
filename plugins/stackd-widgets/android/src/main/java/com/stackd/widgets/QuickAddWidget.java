package com.stackd.widgets;

import android.content.Context;
import android.widget.RemoteViews;

// W7 Quick add (small): three filled circles − + ⇄ with no labels (owner's
// version D). Each opens New log on its type; screen readers still hear the
// type. It needs no figures, so it works before the app has written data.
public class QuickAddWidget extends BaseWidget {
    @Override
    protected String target() {
        return "add";
    }

    @Override
    protected boolean needsData() {
        return false;
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_quick);
        bind(ctx, rv, snap, R.id.btn_expense, "expense", "expenseBtn", R.string.stackd_widget_expense);
        bind(ctx, rv, snap, R.id.btn_income, "income", "incomeBtn", R.string.stackd_widget_income);
        bind(ctx, rv, snap, R.id.btn_transfer, "transfer", "transferBtn", R.string.stackd_widget_transfer);
        return rv;
    }

    private void bind(Context ctx, RemoteViews rv, Snapshot snap, int id, String type, String labelKey, int fallback) {
        String label = snap != null ? snap.label(labelKey, ctx.getString(fallback)) : ctx.getString(fallback);
        rv.setContentDescription(id, label);
        rv.setOnClickPendingIntent(id, open(ctx, "add&type=" + type, 0));
    }
}
