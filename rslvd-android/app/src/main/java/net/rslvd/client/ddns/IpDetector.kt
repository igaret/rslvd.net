package net.rslvd.client.ddns

import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** Detects the device's current public IPv4 address via well-known echo services. */
object IpDetector {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val endpoints = listOf(
        "https://api.ipify.org",
        "https://ipv4.icanhazip.com",
        "https://checkip.amazonaws.com",
    )

    private val ipv4Regex = Regex("""^(\d{1,3}\.){3}\d{1,3}$""")

    /** Returns the public IPv4 string, or null if none of the services responded. */
    fun detect(): String? {
        for (url in endpoints) {
            try {
                client.newCall(Request.Builder().url(url).build()).execute().use { resp ->
                    val body = resp.body?.string()?.trim()
                    if (resp.isSuccessful && !body.isNullOrBlank() && ipv4Regex.matches(body)) {
                        return body
                    }
                }
            } catch (_: Exception) {
                // try next endpoint
            }
        }
        return null
    }
}
