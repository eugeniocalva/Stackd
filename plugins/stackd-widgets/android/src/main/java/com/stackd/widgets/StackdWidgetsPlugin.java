package com.stackd.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

// 1.2.2 (HG-15, docs/phone-widgets-plan.md WG-3): the app's widget snapshot
// (src/widgets-native.js, StackdWidgets.buildSnapshot) is written to the app's
// private files/widgets/snapshot.json, then every Stack'd home-screen widget
// placed by the user is asked to redraw. The widgets (WG-4) read the same file
// through readSnapshot(). Nothing here ever reads the ledger or writes data
// the app owns.
@CapacitorPlugin(name = "StackdWidgets")
public class StackdWidgetsPlugin extends Plugin {

    static final String DIR = "widgets";
    static final String FILE = "snapshot.json";
    // The snapshot is a few KB; anything far bigger is not ours.
    private static final int MAX_BYTES = 256 * 1024;

    static File snapshotFile(Context ctx) {
        return new File(new File(ctx.getFilesDir(), DIR), FILE);
    }

    // For the widget providers: the last snapshot, or null before the first
    // write / after a clear.
    public static String readSnapshot(Context ctx) {
        File f = snapshotFile(ctx);
        if (!f.isFile() || f.length() > MAX_BYTES) return null;
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
            return new String(buf, 0, off, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    // Every widget of this app the user has placed gets one update broadcast,
    // whatever its provider class (so WG-4 providers need no registry here).
    static void notifyWidgets(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        String pkg = ctx.getPackageName();
        List<AppWidgetProviderInfo> infos = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            infos.addAll(mgr.getInstalledProvidersForPackage(pkg, null));
        } else {
            for (AppWidgetProviderInfo info : mgr.getInstalledProviders()) {
                if (info.provider != null && pkg.equals(info.provider.getPackageName())) infos.add(info);
            }
        }
        for (AppWidgetProviderInfo info : infos) {
            ComponentName cn = info.provider;
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) continue;
            Intent intent = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.setComponent(cn);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(intent);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) { call.reject("json is required"); return; }
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) { call.reject("snapshot too large"); return; }
        Context ctx = getContext();
        File target = snapshotFile(ctx);
        File dir = target.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) { call.reject("cannot create folder"); return; }
        // Atomic: a widget drawing at this moment reads the old file or the
        // new one, never half of one.
        File tmp = new File(dir, FILE + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(bytes);
            out.flush();
        } catch (IOException e) {
            tmp.delete();
            call.reject("write failed", e);
            return;
        }
        if (!tmp.renameTo(target)) {
            tmp.delete();
            call.reject("rename failed");
            return;
        }
        notifyWidgets(ctx);
        JSObject ret = new JSObject();
        ret.put("written", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context ctx = getContext();
        File f = snapshotFile(ctx);
        if (f.exists()) f.delete();
        notifyWidgets(ctx);
        call.resolve();
    }

    // iOS only: the Quick add App Intent's URL. On Android each Quick add
    // circle is a PendingIntent carrying its stackd://open URL, which reaches
    // the app through appUrlOpen, so nothing ever waits here.
    @PluginMethod
    public void takePending(PluginCall call) {
        call.resolve(new JSObject());
    }
}
