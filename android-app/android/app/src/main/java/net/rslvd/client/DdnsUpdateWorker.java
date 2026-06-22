package net.rslvd.client;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
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

        Log.d(TAG, "DDNS update complete: " + successCount + "/" + updateKeys.length + " hosts updated");
        return Result.success();
    }
}
