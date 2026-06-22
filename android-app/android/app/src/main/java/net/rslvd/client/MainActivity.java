package net.rslvd.client;

import android.os.Bundle;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DdnsPlugin.class);
        super.onCreate(savedInstanceState);
        scheduleDdnsUpdates();
    }

    private void scheduleDdnsUpdates() {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest ddnsWork = new PeriodicWorkRequest.Builder(
                DdnsUpdateWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "rslvd_ddns_update",
                ExistingPeriodicWorkPolicy.KEEP,
                ddnsWork
        );
    }
}
