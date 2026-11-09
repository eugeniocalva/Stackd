package com.stackd.widgets;

import android.view.View;
import android.widget.RemoteViews;

// 1.2.2 (HG-15 WG-4): the four row slots of stackd_widget_list /
// stackd_widget_ring and the three of stackd_widget_budget.
final class Rows {
    private Rows() {}

    static final int[] ROW = { R.id.row1, R.id.row2, R.id.row3, R.id.row4 };
    static final int[] MARK = { R.id.row1_mark, R.id.row2_mark, R.id.row3_mark, R.id.row4_mark };
    static final int[] NAME = { R.id.row1_name, R.id.row2_name, R.id.row3_name, R.id.row4_name };
    static final int[] VALUE = { R.id.row1_value, R.id.row2_value, R.id.row3_value, R.id.row4_value };

    static void hideFrom(RemoteViews rv, int from, int count) {
        for (int i = from; i < count; i++) rv.setViewVisibility(ROW[i], View.GONE);
    }

    // Shows the "nothing to show" sentence in place of the widget's body.
    static void empty(RemoteViews rv, String text, int... bodyIds) {
        for (int id : bodyIds) rv.setViewVisibility(id, View.GONE);
        rv.setTextViewText(R.id.empty, text);
        rv.setViewVisibility(R.id.empty, View.VISIBLE);
    }
}
