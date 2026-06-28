package net.rslvd.client.ddns

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** Periodic worker that detects the public IP and pushes it to every DDNS target. */
class DdnsWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val config = DdnsConfig(applicationContext)
        if (!config.enabled) return@withContext Result.success()

        val targets = config.getTargets()
        if (targets.isEmpty()) return@withContext Result.success()

        val ip = IpDetector.detect()
            ?: return@withContext Result.retry()

        config.lastDetectedIp = ip
        config.lastRun = System.currentTimeMillis()

        var ok = 0
        var failed = 0
        val updated = targets.map { target ->
            val status = runUpdate(target, ip)
            if (status.startsWith("good") || status.startsWith("nochg") || status == "OK") ok++ else failed++
            target.copy(lastStatus = status, lastIp = ip, lastRun = System.currentTimeMillis())
        }
        config.saveTargets(updated)

        notify(ip, ok, failed)
        if (failed > 0 && ok == 0) Result.retry() else Result.success()
    }

    private fun runUpdate(target: DdnsTarget, ip: String): String {
        return try {
            val req = Request.Builder()
                .url(target.buildUrl(ip))
                .header("User-Agent", "rslvd-android/2.0")
                .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string()?.trim().orEmpty()
                when {
                    body.isNotBlank() -> body.take(40)
                    resp.isSuccessful -> "OK"
                    else -> "HTTP ${resp.code}"
                }
            }
        } catch (e: Exception) {
            "error: ${e.message?.take(30)}"
        }
    }

    private fun notify(ip: String, ok: Int, failed: Int) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return

        val mgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "DDNS Updates", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "Background DDNS update status" }
            )
        }
        val text = if (failed == 0) "$ok target(s) updated → $ip"
        else "$ok ok, $failed failed → $ip"
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentTitle("rslvd DDNS")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, notif)
        } catch (_: SecurityException) {
        }
    }

    companion object {
        const val CHANNEL_ID = "ddns_updates"
        const val NOTIF_ID = 4201
    }
}
