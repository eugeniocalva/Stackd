package com.stackd.widgets;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

// 1.2.2 (HG-15 WG-4): the widgets' read-only view of the app's snapshot
// (docs/phone-widgets-plan.md §4). Every text is already formatted,
// translated and masked by the app; this only picks fields and works out the
// day, which moves on while the app is closed.
final class Snapshot {
    static final int VERSION = 1;

    final JSONObject json;
    final JSONObject labels;

    private Snapshot(JSONObject json) {
        this.json = json;
        JSONObject l = json.optJSONObject("labels");
        this.labels = l != null ? l : new JSONObject();
    }

    // null when there is no file yet, it is unreadable, or it is from a newer
    // app than these widgets understand: the widget then shows "Open Stack'd".
    static Snapshot load(Context ctx) {
        String raw = StackdWidgetsPlugin.readSnapshot(ctx);
        if (raw == null) return null;
        try {
            JSONObject j = new JSONObject(raw);
            if (j.optInt("v", 0) != VERSION) return null;
            return new Snapshot(j);
        } catch (Exception e) {
            return null;
        }
    }

    boolean isEmpty() {
        return json.optBoolean("empty", true);
    }

    String label(String key, String fallback) {
        String s = labels.optString(key, "");
        return s.isEmpty() ? fallback : s;
    }

    JSONObject obj(String key) {
        return json.optJSONObject(key);
    }

    JSONArray arr(String key) {
        JSONArray a = json.optJSONArray(key);
        return a != null ? a : new JSONArray();
    }

    static String today() {
        return ymd(new Date());
    }

    static String tomorrow() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 12);
        c.add(Calendar.DAY_OF_MONTH, 1);
        return ymd(c.getTime());
    }

    private static String ymd(Date d) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(d);
    }

    // The figures describe an earlier day: say when they were taken.
    boolean isStale() {
        return !today().equals(json.optString("day", ""));
    }

    String staleText() {
        return isStale() ? json.optString("updatedText", "") : "";
    }
}
