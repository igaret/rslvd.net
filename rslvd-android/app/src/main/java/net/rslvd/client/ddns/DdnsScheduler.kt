package net.rslvd.client.ddns

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object DdnsScheduler {
    private const val WORK_NAME = "rslvd_ddns_periodic"
    private const val ONESHOT_NAME = "rslvd_ddns_oneshot"

    fun schedule(context: Context) {
        val config = DdnsConfig(context)
        if (!config.enabled) {
            cancel(context)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<DdnsWorker>(
            config.intervalMinutes, TimeUnit.MINUTES
        ).setConstraints(constraints).build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    /** Fire an immediate one-off update (used by the "Update now" button). */
    fun runNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<DdnsWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            ONESHOT_NAME,
            androidx.work.ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }
}
