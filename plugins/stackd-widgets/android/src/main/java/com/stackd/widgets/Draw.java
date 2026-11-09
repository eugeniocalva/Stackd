package com.stackd.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

// 1.2.2 (HG-15 WG-4): RemoteViews cannot draw shapes, so rings, bars, the
// balance curve and the round letter marks are drawn into small bitmaps.
// Sizes are in dp and scaled to the screen; every bitmap stays tiny (the
// whole RemoteViews parcel must stay well under the binder limit).
final class Draw {
    private Draw() {}

    static int px(Context ctx, float dp) {
        return Math.max(1, Math.round(dp * ctx.getResources().getDisplayMetrics().density));
    }

    static int color(String hex, int fallback) {
        try {
            return hex == null || hex.isEmpty() ? fallback : Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    // A round mark: the colour at 16 % behind the first letter in the colour —
    // the app's "icon in its colour on a neutral circle" (HG-9) without the
    // Lucide glyph set on Android.
    static Bitmap mark(Context ctx, String name, int colour, float dp) {
        int s = px(ctx, dp);
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.argb(41, Color.red(colour), Color.green(colour), Color.blue(colour)));
        c.drawCircle(s / 2f, s / 2f, s / 2f, p);
        String letter = name == null || name.trim().isEmpty() ? "•" : name.trim().substring(0, name.trim().offsetByCodePoints(0, 1)).toUpperCase();
        p.setColor(colour);
        p.setTextSize(s * 0.46f);
        p.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        p.setTextAlign(Paint.Align.CENTER);
        Paint.FontMetrics fm = p.getFontMetrics();
        c.drawText(letter, s / 2f, s / 2f - (fm.ascent + fm.descent) / 2f, p);
        return b;
    }

    // A ring of slices (shares 0–1, in order) over a track; a share total
    // under 1 leaves the rest as track (budget ring).
    static Bitmap ring(Context ctx, double[] shares, int[] colours, int track, float dp, float strokeDp) {
        int s = px(ctx, dp);
        float stroke = px(ctx, strokeDp);
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        RectF r = new RectF(stroke / 2f, stroke / 2f, s - stroke / 2f, s - stroke / 2f);
        p.setColor(track);
        c.drawArc(r, 0, 360, false, p);
        float start = -90f;
        float gap = shares.length > 1 ? 2f : 0f;
        for (int i = 0; i < shares.length; i++) {
            float sweep = (float) (Math.max(0, Math.min(1, shares[i])) * 360f);
            if (sweep <= 0) continue;
            p.setColor(colours[i]);
            c.drawArc(r, start + gap / 2f, Math.max(0.5f, sweep - gap), false, p);
            start += sweep;
        }
        return b;
    }

    // A rounded bar: fraction 0–1 of the width filled over a track.
    static Bitmap bar(Context ctx, double fraction, int fill, int track, float wDp, float hDp) {
        int w = px(ctx, wDp), h = px(ctx, hDp);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float rad = h / 2f;
        p.setColor(track);
        c.drawRoundRect(new RectF(0, 0, w, h), rad, rad, p);
        float fw = (float) (Math.max(0, Math.min(1, fraction)) * w);
        if (fw > 0) {
            p.setColor(fill);
            c.drawRoundRect(new RectF(0, 0, Math.max(fw, h), h), rad, rad, p);
        }
        return b;
    }

    // The balance curve: points 0–1 (bottom to top), a line and a soft fill.
    static Bitmap curve(Context ctx, double[] pts, int colour, float wDp, float hDp) {
        int w = px(ctx, wDp), h = px(ctx, hDp);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        if (pts.length < 2) return b;
        Canvas c = new Canvas(b);
        float pad = px(ctx, 3);
        float usable = h - 2 * pad;
        Path line = new Path();
        for (int i = 0; i < pts.length; i++) {
            float x = (float) i / (pts.length - 1) * w;
            float y = pad + (float) (1 - Math.max(0, Math.min(1, pts[i]))) * usable;
            if (i == 0) line.moveTo(x, y); else line.lineTo(x, y);
        }
        Path fill = new Path(line);
        fill.lineTo(w, h);
        fill.lineTo(0, h);
        fill.close();
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.argb(38, Color.red(colour), Color.green(colour), Color.blue(colour)));
        c.drawPath(fill, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(px(ctx, 2));
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(colour);
        c.drawPath(line, p);
        return b;
    }
}
