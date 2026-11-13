package com.stackd.privacy;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricManager.Authenticators;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// 1.3.0 (PL-4, docs/privacy-currencies-plan.md §5): the native half of App
// lock and Shake to hide. The JS side (src/app-lock.js, Components.PrivacyShake)
// reaches this as window.Capacitor.Plugins.StackdPrivacy.
//   status()          what the phone offers: biometry kind, enrolled, screen lock
//   authenticate()    the system prompt; ALWAYS resolves {ok} or {ok:false, code}
//   setPrivacyCover() keeps the app's content out of the app switcher
//   startShake()/stopShake()  iPhone only; here they answer native:false and
//                     the JS detector keeps listening to devicemotion
@CapacitorPlugin(name = "StackdPrivacy")
public class StackdPrivacyPlugin extends Plugin {

    private static final String CANCEL = "cancel";
    private static final String LOCKOUT = "lockout";
    private static final String UNAVAILABLE = "unavailable";
    private static final String FAILED = "failed";

    // The call whose prompt is on screen. UI thread only. A second
    // authenticate() while one is up answers 'failed' at once: BiometricPrompt
    // would drop it silently and its call would never resolve.
    private PluginCall pending;

    // ---- status -----------------------------------------------------------

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("biometry", biometryKind(ctx));
        ret.put("enrolled", weakBiometrics(ctx) == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("deviceSecure", deviceSecure(ctx));
        call.resolve(ret);
    }

    private static int weakBiometrics(Context ctx) {
        try {
            return BiometricManager.from(ctx).canAuthenticate(Authenticators.BIOMETRIC_WEAK);
        } catch (Exception e) {
            return BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE;
        }
    }

    private static boolean deviceSecure(Context ctx) {
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    // One declared sensor names itself; several, or a sensor the system knows
    // without declaring a feature (face unlock before Android 10), is 'generic'.
    private static String biometryKind(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        boolean fingerprint = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean face = pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        boolean iris = pm.hasSystemFeature(PackageManager.FEATURE_IRIS);
        int count = (fingerprint ? 1 : 0) + (face ? 1 : 0) + (iris ? 1 : 0);
        if (count > 1) return "generic";
        if (fingerprint) return "fingerprint";
        if (face) return "face";
        if (iris) return "iris";
        int can = weakBiometrics(ctx);
        boolean known = can == BiometricManager.BIOMETRIC_SUCCESS || can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED;
        return known ? "generic" : "none";
    }

    // ---- authenticate -----------------------------------------------------

    @PluginMethod
    public void authenticate(final PluginCall call) {
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            resolveFailure(call, FAILED);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                startAuthentication(activity, call);
            } catch (Exception e) {
                if (pending == call) pending = null;
                resolveFailure(call, FAILED);
            }
        });
    }

    private void startAuthentication(AppCompatActivity activity, final PluginCall call) {
        if (pending != null) {
            resolveFailure(call, FAILED);
            return;
        }
        Context ctx = getContext();
        String reason = text(call.getString("reason"));
        String title = text(call.getString("title"));
        String cancelTitle = text(call.getString("cancelTitle"));
        boolean allowCredential = Boolean.TRUE.equals(call.getBoolean("allowDeviceCredential", false));

        int can = weakBiometrics(ctx);
        // BIOMETRIC_STATUS_UNKNOWN (older phones with a non-fingerprint sensor)
        // is not a no: the prompt itself gives the real answer.
        boolean biometricsPossible = can == BiometricManager.BIOMETRIC_SUCCESS || can == BiometricManager.BIOMETRIC_STATUS_UNKNOWN;
        int authenticators = Authenticators.BIOMETRIC_WEAK;

        if (allowCredential) {
            if (!deviceSecure(ctx)) {
                resolveFailure(call, UNAVAILABLE);
                return;
            }
            // The phone's passcode alone: BiometricPrompt takes DEVICE_CREDENTIAL
            // on its own only from Android 11, so older phones without usable
            // biometrics go through the keyguard's own confirmation screen.
            if (!biometricsPossible && Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                confirmDeviceCredential(ctx, call, title, reason);
                return;
            }
            authenticators = Authenticators.BIOMETRIC_WEAK | Authenticators.DEVICE_CREDENTIAL;
        } else if (!biometricsPossible) {
            resolveFailure(call, UNAVAILABLE);
            return;
        }

        // BiometricPrompt returns without a callback when the fragment state is
        // already saved (the activity is on its way out): answer here instead.
        if (activity.isFinishing() || activity.isDestroyed() || activity.getSupportFragmentManager().isStateSaved()) {
            resolveFailure(call, FAILED);
            return;
        }

        String heading = !title.isEmpty() ? title : (!reason.isEmpty() ? reason : appName(ctx));
        BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(heading)
            .setAllowedAuthenticators(authenticators)
            .setConfirmationRequired(false);
        if (!title.isEmpty() && !reason.isEmpty()) info.setSubtitle(reason);
        // A negative button is mandatory without DEVICE_CREDENTIAL and
        // forbidden with it (the system shows its own "use PIN" control).
        if (!allowCredential) {
            info.setNegativeButtonText(!cancelTitle.isEmpty() ? cancelTitle : ctx.getString(android.R.string.cancel));
        }

        BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(ctx), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                finish(call, null);
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                finish(call, codeFor(errorCode));
            }
            // onAuthenticationFailed (one read that did not match) is left
            // alone on purpose: the prompt stays up and the call stays open.
        });
        pending = call;
        prompt.authenticate(info.build());
    }

    @SuppressWarnings("deprecation")
    private void confirmDeviceCredential(Context ctx, PluginCall call, String title, String reason) {
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
        Intent intent = km == null ? null : km.createConfirmDeviceCredentialIntent(
            title.isEmpty() ? null : title,
            reason.isEmpty() ? null : reason
        );
        if (intent == null) {
            resolveFailure(call, UNAVAILABLE);
            return;
        }
        pending = call;
        startActivityForResult(call, intent, "credentialResult");
    }

    @ActivityCallback
    private void credentialResult(PluginCall call, ActivityResult result) {
        pending = null;
        if (call == null) return;
        if (result != null && result.getResultCode() == Activity.RESULT_OK) {
            resolveSuccess(call);
        } else {
            resolveFailure(call, CANCEL);
        }
    }

    // The one exit of a BiometricPrompt call: a callback for a call that is no
    // longer the pending one has been answered already.
    private void finish(PluginCall call, String failure) {
        if (pending != call) return;
        pending = null;
        if (failure == null) {
            resolveSuccess(call);
        } else {
            resolveFailure(call, failure);
        }
    }

    private static String codeFor(int errorCode) {
        switch (errorCode) {
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_CANCELED: // the system took the prompt away (app left, screen off)
                return CANCEL;
            case BiometricPrompt.ERROR_LOCKOUT:
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return LOCKOUT;
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
            case BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL:
            case BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED:
                return UNAVAILABLE;
            default:
                return FAILED;
        }
    }

    private static void resolveSuccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private static void resolveFailure(PluginCall call, String code) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("code", code);
        call.resolve(ret);
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String appName(Context ctx) {
        try {
            CharSequence label = ctx.getApplicationInfo().loadLabel(ctx.getPackageManager());
            if (label != null && label.length() > 0) return label.toString();
        } catch (Exception ignored) {
            // fall through to the fixed name
        }
        return "Stack'd";
    }

    // ---- app-switcher cover -----------------------------------------------

    // Android 13+ can leave the app out of the Recents thumbnail. Older
    // versions keep their thumbnail (plan A9): the only switch they offer also
    // blocks every screenshot of the app, which is not what App lock promises.
    @PluginMethod
    public void setPrivacyCover(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        final Activity activity = getActivity();
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(new JSObject());
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    activity.setRecentsScreenshotEnabled(!enabled);
                }
            } catch (Exception ignored) {
                // the thumbnail stays as it was
            }
            call.resolve(new JSObject());
        });
    }

    // ---- shake ------------------------------------------------------------

    // Android's WebView delivers devicemotion without a permission, so the JS
    // detector does the work here.
    @PluginMethod
    public void startShake(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("native", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopShake(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("native", false);
        call.resolve(ret);
    }
}
