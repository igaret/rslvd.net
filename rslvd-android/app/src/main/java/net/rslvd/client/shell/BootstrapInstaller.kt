package net.rslvd.client.shell

import android.content.Context
import android.system.Os
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * Installs the Termux-style rootfs bootstrap into <filesDir>/usr on first run.
 *
 * The bootstrap zip is produced by our termux-packages fork (prefix
 * /data/data/net.rslvd.debug/files/usr) and hosted at repo.rslvd.net together
 * with a SHA-256 checksum file. The zip contains the contents of usr/ plus a
 * SYMLINKS.txt manifest ("target←link" per line) since zip cannot carry
 * symlinks.
 */
object BootstrapInstaller {
    const val REPO_BASE = "https://repo.rslvd.net"

    fun prefixDir(context: Context): File = File(context.filesDir, "usr")
    fun homeDir(context: Context): File = File(context.filesDir, "home")

    fun isInstalled(context: Context): Boolean =
        File(prefixDir(context), ".bootstrap-installed").exists()

    private fun archName(): String {
        val abis = android.os.Build.SUPPORTED_ABIS
        return when {
            abis.contains("arm64-v8a") -> "aarch64"
            abis.contains("x86_64") -> "x86_64"
            abis.contains("armeabi-v7a") -> "arm"
            else -> abis.firstOrNull() ?: "unknown"
        }
    }

    fun bootstrapUrl(): String = "$REPO_BASE/bootstraps/bootstrap-${archName()}.zip"

    /**
     * Downloads, verifies and extracts the bootstrap. Reports progress via
     * [onStatus]. Throws on failure; a partial install is cleaned up so a
     * retry starts fresh.
     */
    fun install(context: Context, onStatus: (String) -> Unit) {
        val prefix = prefixDir(context)
        val staging = File(context.filesDir, "usr-staging")

        try {
            if (staging.exists()) staging.deleteRecursively()
            staging.mkdirs()
            homeDir(context).mkdirs()

            val url = bootstrapUrl()
            onStatus("Downloading bootstrap (${archName()})…")
            val zipFile = File(context.cacheDir, "bootstrap.zip")
            download(url, zipFile, onStatus)

            onStatus("Verifying checksum…")
            val expected = fetchText("$url.sha256").trim().split(Regex("\\s+")).first()
            val actual = sha256(zipFile)
            if (!expected.equals(actual, ignoreCase = true)) {
                throw IllegalStateException("Checksum mismatch — download corrupted")
            }

            onStatus("Extracting…")
            extract(zipFile, staging)
            zipFile.delete()

            onStatus("Finishing install…")
            if (prefix.exists()) prefix.deleteRecursively()
            if (!staging.renameTo(prefix)) {
                throw IllegalStateException("Could not move bootstrap into place")
            }
            File(prefix, "tmp").mkdirs()
            File(prefix, ".bootstrap-installed").writeText("ok")
            onStatus("Environment installed")
        } catch (e: Exception) {
            staging.deleteRecursively()
            throw e
        }
    }

    private fun download(url: String, dest: File, onStatus: (String) -> Unit) {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        try {
            if (conn.responseCode != 200) {
                throw IllegalStateException("Download failed: HTTP ${conn.responseCode}")
            }
            val total = conn.contentLengthLong
            conn.inputStream.use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var done = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        if (total > 0) {
                            onStatus("Downloading… ${done * 100 / total}%")
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun fetchText(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            if (conn.responseCode != 200) {
                throw IllegalStateException("Fetch failed: HTTP ${conn.responseCode} for $url")
            }
            return conn.inputStream.bufferedReader().readText()
        } finally {
            conn.disconnect()
        }
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun extract(zipFile: File, destDir: File) {
        val destPath = destDir.canonicalPath
        val symlinks = mutableListOf<Pair<String, String>>()
        ZipInputStream(zipFile.inputStream().buffered()).use { zis ->
            while (true) {
                val entry = zis.nextEntry ?: break
                if (entry.name == "SYMLINKS.txt") {
                    zis.bufferedReader().readText().lines().forEach { line ->
                        if (line.contains("←")) {
                            val (target, link) = line.split("←", limit = 2)
                            symlinks.add(target to link)
                        }
                    }
                    continue
                }
                val out = File(destDir, entry.name)
                if (!out.canonicalPath.startsWith(destPath)) {
                    throw SecurityException("Blocked zip path traversal: ${entry.name}")
                }
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zis.copyTo(it) }
                    // Zip loses unix permissions; make binaries executable.
                    Os.chmod(out.absolutePath, 448) // 0700
                }
            }
        }
        for ((target, link) in symlinks) {
            val linkFile = File(destDir, link.removePrefix("./"))
            if (!linkFile.canonicalFile.parentFile!!.path.startsWith(destPath)) continue
            linkFile.parentFile?.mkdirs()
            linkFile.delete()
            Os.symlink(target, linkFile.absolutePath)
        }
    }

    /** Environment for processes running inside the bootstrap. */
    fun environment(context: Context): Map<String, String> {
        val prefix = prefixDir(context).absolutePath
        val env = mutableMapOf(
            "PREFIX" to prefix,
            "HOME" to homeDir(context).absolutePath,
            "PATH" to "$prefix/bin:$prefix/bin/applets",
            "TMPDIR" to "$prefix/tmp",
            "LANG" to "en_US.UTF-8",
            "TERM" to "xterm-256color",
            "ANDROID_DATA" to (System.getenv("ANDROID_DATA") ?: "/data"),
            "ANDROID_ROOT" to (System.getenv("ANDROID_ROOT") ?: "/system"),
            "TERMUX_APP_PID" to android.os.Process.myPid().toString(),
        )
        val ldPreload = File(prefix, "lib/libtermux-exec.so")
        if (ldPreload.exists()) env["LD_PRELOAD"] = ldPreload.absolutePath
        return env
    }
}
