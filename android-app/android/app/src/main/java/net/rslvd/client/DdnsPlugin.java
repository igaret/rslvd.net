package net.rslvd.client;

import android.content.SharedPreferences;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Capacitor plugin that allows the web app to manage DDNS auto-update settings.
 * The web app can enable/disable auto-updates for specific hosts and trigger
 * immediate updates.
 */
@CapacitorPlugin(name = "DdnsClient")
public class DdnsPlugin extends Plugin {
    private static final String PREFS_NAME = "rslvd_ddns";

    @PluginMethod
    public void setHosts(PluginCall call) {
        String keys = call.getString("keys", "");
        SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("ddns_hosts", keys).apply();

        // Reschedule work
        if (keys.isEmpty()) {
            WorkManager.getInstance(getContext()).cancelUniqueWork("rslvd_ddns_update");
        } else {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(
                    DdnsUpdateWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(constraints)
                    .build();
            WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
                    "rslvd_ddns_update",
                    ExistingPeriodicWorkPolicy.REPLACE,
                    work
            );
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getHosts(PluginCall call) {
        SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String keys = prefs.getString("ddns_hosts", "");

        JSObject ret = new JSObject();
        ret.put("keys", keys);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateNow(PluginCall call) {
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(DdnsUpdateWorker.class).build();
        WorkManager.getInstance(getContext()).enqueue(work);

        JSObject ret = new JSObject();
        ret.put("queued", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token", "");
        SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("auth_token", token).apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String token = prefs.getString("auth_token", "");

        JSObject ret = new JSObject();
        ret.put("token", token);
        call.resolve(ret);
    }
}
