package com.stackd.cloud;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E.4): iCloud Drive exists only on
// iOS. On Android the plugin answers available:false, so src/backup.js writes
// to the public Documents folder (and the OS Auto Backup keeps the app data);
// every other method rejects.
@CapacitorPlugin(name = "StackdCloud")
public class StackdCloudPlugin extends Plugin {

    private static final String UNAVAILABLE = "iCloud Drive is not available on Android";

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void write(PluginCall call) {
        call.reject(UNAVAILABLE);
    }

    @PluginMethod
    public void read(PluginCall call) {
        call.reject(UNAVAILABLE);
    }

    @PluginMethod
    public void list(PluginCall call) {
        call.reject(UNAVAILABLE);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        call.reject(UNAVAILABLE);
    }
}
