package net.rslvd.client.ddns

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * A single DDNS update target. [urlTemplate] is a full HTTP(S) URL where the
 * literal token {ip} is replaced with the detected public IPv4 address before
 * the request is made. This makes the updater universal: rslvd targets use the
 * rslvd update endpoint, but any DynDNS-compatible provider works too.
 */
data class DdnsTarget(
    val id: String,
    val label: String,
    val urlTemplate: String,
    val provider: String = PROVIDER_RSLVD,
    var lastStatus: String? = null,
    var lastIp: String? = null,
    var lastRun: Long = 0L,
) {
    fun buildUrl(ip: String): String = urlTemplate.replace(IP_TOKEN, ip)

    companion object {
        const val IP_TOKEN = "{ip}"
        const val PROVIDER_RSLVD = "rslvd"
        const val PROVIDER_CUSTOM = "custom"

        /** rslvd's DynDNS-compatible endpoint for a host's update key. */
        fun rslvdUrl(updateKey: String): String =
            "https://rslvd.net/api/update?key=$updateKey&ip=$IP_TOKEN"
    }
}

class DdnsConfig(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("rslvd_ddns", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(v) = prefs.edit().putBoolean(KEY_ENABLED, v).apply()

    /** Update interval in minutes. WorkManager enforces a 15-minute floor. */
    var intervalMinutes: Long
        get() = prefs.getLong(KEY_INTERVAL, 15L).coerceAtLeast(15L)
        set(v) = prefs.edit().putLong(KEY_INTERVAL, v.coerceAtLeast(15L)).apply()

    var lastDetectedIp: String?
        get() = prefs.getString(KEY_LAST_IP, null)
        set(v) = prefs.edit().putString(KEY_LAST_IP, v).apply()

    var lastRun: Long
        get() = prefs.getLong(KEY_LAST_RUN, 0L)
        set(v) = prefs.edit().putLong(KEY_LAST_RUN, v).apply()

    fun getTargets(): List<DdnsTarget> {
        val raw = prefs.getString(KEY_TARGETS, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                DdnsTarget(
                    id = o.getString("id"),
                    label = o.getString("label"),
                    urlTemplate = o.getString("urlTemplate"),
                    provider = o.optString("provider", DdnsTarget.PROVIDER_RSLVD),
                    lastStatus = o.optString("lastStatus").ifBlankNull(),
                    lastIp = o.optString("lastIp").ifBlankNull(),
                    lastRun = o.optLong("lastRun", 0L),
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveTargets(targets: List<DdnsTarget>) {
        val arr = JSONArray()
        targets.forEach { t ->
            arr.put(
                JSONObject()
                    .put("id", t.id)
                    .put("label", t.label)
                    .put("urlTemplate", t.urlTemplate)
                    .put("provider", t.provider)
                    .put("lastStatus", t.lastStatus ?: "")
                    .put("lastIp", t.lastIp ?: "")
                    .put("lastRun", t.lastRun)
            )
        }
        prefs.edit().putString(KEY_TARGETS, arr.toString()).apply()
    }

    fun addTarget(target: DdnsTarget) {
        val list = getTargets().toMutableList()
        list.removeAll { it.id == target.id }
        list.add(target)
        saveTargets(list)
    }

    fun removeTarget(id: String) {
        saveTargets(getTargets().filterNot { it.id == id })
    }

    private fun String?.ifBlankNull(): String? = if (this.isNullOrBlank()) null else this

    companion object {
        private const val KEY_ENABLED = "enabled"
        private const val KEY_INTERVAL = "interval_minutes"
        private const val KEY_TARGETS = "targets"
        private const val KEY_LAST_IP = "last_ip"
        private const val KEY_LAST_RUN = "last_run"
    }
}
