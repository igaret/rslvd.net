package net.rslvd.client.ddns

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Reschedules the periodic DDNS worker after a reboot or app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> DdnsScheduler.schedule(context)
        }
    }
}
