package net.rslvd.client;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 9001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DdnsPlugin.class);
        super.onCreate(savedInstanceState);
        requestNotificationPermissionIfNeeded();
        scheduleDdnsUpdatesIfConfigured();
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                    REQ_POST_NOTIFICATIONS);
        }
    }

    private void scheduleDdnsUpdatesIfConfigured() {
        SharedPreferences prefs = getSharedPreferences("rslvd_ddns", Context.MODE_PRIVATE);
        String hosts = prefs.getString("ddns_hosts", "");
        if (hosts.isEmpty()) return;

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest ddnsWork = new PeriodicWorkRequest.Builder(
                DdnsUpdateWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        // KEEP avoids resetting the 15-minute timer on every cold start;
        // DdnsPlugin uses REPLACE when the configuration actually changes.
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "rslvd_ddns_update",
                ExistingPeriodicWorkPolicy.KEEP,
                ddnsWork
        );
    }
}
