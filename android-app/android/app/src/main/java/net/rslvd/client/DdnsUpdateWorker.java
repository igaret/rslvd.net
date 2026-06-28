package net.rslvd.client;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Background worker that periodically updates DDNS hostnames with the device's
 * current public IP address. Uses the /api/update endpoint with the host's update_key.
 */
public class DdnsUpdateWorker extends Worker {
    private static final String TAG = "DdnsUpdateWorker";
    private static final String PREFS_NAME = "rslvd_ddns";
    private static final String BASE_URL = "https://rslvd.net";
    private static final String CHANNEL_ID = "rslvd_ddns_status";
    private static final int NOTIFICATION_ID = 4201;

    public DdnsUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        String hostsJson = prefs.getString("ddns_hosts", "");
        if (hostsJson.isEmpty()) {
            Log.d(TAG, "No DDNS hosts configured, skipping update");
            return Result.success();
        }

        // Parse comma-separated update keys
        String[] updateKeys = hostsJson.split(",");
        int successCount = 0;

        for (String key : updateKeys) {
            key = key.trim();
            if (key.isEmpty()) continue;

            try {
                String updateUrl = BASE_URL + "/api/update?key=" + key;
                URL url = new URL(updateUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int code = conn.getResponseCode();
                if (code == 200) {
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(conn.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        response.append(line);
                    }
                    reader.close();
                    Log.d(TAG, "Updated host (key=" + key.substring(0, Math.min(key.length(), 8)) + "...): " + response);
                    successCount++;
                } else {
                    Log.w(TAG, "Update failed for key " + key.substring(0, Math.min(key.length(), 8)) + "... HTTP " + code);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error updating host: " + e.getMessage());
            }
        }

        int total = countNonEmpty(updateKeys);
        Log.d(TAG, "DDNS update complete: " + successCount + "/" + total + " hosts updated");
        notifyResult(successCount, total);
        return Result.success();
    }

    private int countNonEmpty(String[] keys) {
        int n = 0;
        for (String k : keys) if (!k.trim().isEmpty()) n++;
        return n;
    }

    private void notifyResult(int successCount, int total) {
        Context ctx = getApplicationContext();

        // On Android 13+ the POST_NOTIFICATIONS runtime permission is required.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "DDNS Updates", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Status of background DNS updates");
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }

        String text = successCount == total
                ? "Updated " + successCount + " hostname" + (successCount == 1 ? "" : "s")
                : "Updated " + successCount + "/" + total + " hostnames (some failed)";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                .setContentTitle("rslvd.net DDNS")
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true)
                .setAutoCancel(true);

        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
    }
}
