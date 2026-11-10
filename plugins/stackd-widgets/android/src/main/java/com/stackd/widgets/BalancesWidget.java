package com.stackd.widgets;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// W1 Account balances (wide): Home's total, then the accounts in the user's
// order, each in its own currency; "+N more" for the rest.
public class BalancesWidget extends BaseWidget {
    @Override
    protected String target() {
        return "home";
    }

    @Override
    protected RemoteViews build(Context ctx, Snapshot snap, boolean wide) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.stackd_widget_list);
        rv.setTextViewText(R.id.title, snap.label("accounts", ctx.getString(R.string.stackd_widget_balances_name)));
        text(rv, R.id.stale, snap.staleText());
        JSONObject total = snap.obj("total");
        if (total != null) {
            text(rv, R.id.headline, total.optString("text"));
            rv.setTextColor(R.id.headline, trendColor(ctx, total.optString("trend")));
        }
        JSONArray accounts = snap.arr("accounts");
        // 4×2: two accounts at the larger text; a taller widget lists up to 8
        int shown = Math.min(accounts.length(), rowsFor(90, 38, 2, 8));
        for (int i = 0; i < shown; i++) {
            JSONObject a = accounts.optJSONObject(i);
            if (a == null) continue;
            String name = a.optString("name");
            int colour = Draw.color(a.optString("color"), ctx.getColor(R.color.stackd_widget_text2));
            rv.setViewVisibility(Rows.ROW[i], View.VISIBLE);
            rv.setImageViewBitmap(Rows.MARK[i], Draw.mark(ctx, name, colour, 28));
            rv.setTextViewText(Rows.NAME[i], name);
            rv.setTextViewText(Rows.VALUE[i], a.optString("text"));
            rv.setTextColor(Rows.VALUE[i], trendColor(ctx, a.optString("trend")));
            // WG-6: TalkBack reads the row as one item
            rv.setContentDescription(Rows.ROW[i], name + ", " + a.optString("text"));
        }
        Rows.hideFrom(rv, shown, 8);
        int rest = snap.json.optInt("accountCount", accounts.length()) - shown;
        if (rest > 0) {
            String tpl = snap.json.optString(rest == 1 ? "moreOne" : "moreOther", "+{n}");
            text(rv, R.id.more, tpl.replace("{n}", String.valueOf(rest)));
        }
        return rv;
    }
}
