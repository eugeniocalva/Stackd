package com.stackd.widgets;

import android.view.View;
import android.widget.RemoteViews;

// 1.2.2 (HG-15 WG-4): the four row slots of stackd_widget_list /
// stackd_widget_ring and the three of stackd_widget_budget. Since 2026-11-10
// stackd_widget_list has 8 slots (a taller widget lists more); only touch the
// slots a layout has — RemoteViews fails on an id the layout lacks.
final class Rows {
    private Rows() {}

    static final int[] ROW = { R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5, R.id.row6, R.id.row7, R.id.row8 };
    static final int[] MARK = { R.id.row1_mark, R.id.row2_mark, R.id.row3_mark, R.id.row4_mark, R.id.row5_mark, R.id.row6_mark, R.id.row7_mark, R.id.row8_mark };
    static final int[] NAME = { R.id.row1_name, R.id.row2_name, R.id.row3_name, R.id.row4_name, R.id.row5_name, R.id.row6_name, R.id.row7_name, R.id.row8_name };
    static final int[] VALUE = { R.id.row1_value, R.id.row2_value, R.id.row3_value, R.id.row4_value, R.id.row5_value, R.id.row6_value, R.id.row7_value, R.id.row8_value };

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
