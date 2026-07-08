package net.rslvd.client.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.BufferedWriter
import java.io.OutputStreamWriter

/**
 * A sandboxed shell session running /system/bin/sh inside the app's own
 * process space. Provides access to Android's built-in toybox commands
 * (ping, ip, netstat, nslookup, getprop, ...) for on-device network
 * diagnostics without a third-party terminal app.
 */
class ShellSession(context: Context) {
    private val buffer = StringBuilder()
    private val _output = MutableStateFlow("")
    val output: StateFlow<String> = _output

    private val history = mutableListOf<String>()
    private var historyIndex = -1

    private var process: Process? = null
    private var writer: BufferedWriter? = null
    private val home = context.filesDir.absolutePath
    private val tmp = context.cacheDir.absolutePath

    init {
        start()
    }

    private fun append(text: String) {
        synchronized(buffer) {
            buffer.append(text)
            if (buffer.length > 200_000) buffer.delete(0, buffer.length - 150_000)
            _output.value = buffer.toString()
        }
    }

    private fun start() {
        try {
            val pb = ProcessBuilder("/system/bin/sh")
                .redirectErrorStream(true)
            pb.directory(java.io.File(home))
            pb.environment()["HOME"] = home
            pb.environment()["TMPDIR"] = tmp
            val p = pb.start()
            process = p
            writer = BufferedWriter(OutputStreamWriter(p.outputStream))
            Thread {
                try {
                    val reader = p.inputStream.bufferedReader()
                    val buf = CharArray(4096)
                    while (true) {
                        val n = reader.read(buf)
                        if (n < 0) break
                        append(String(buf, 0, n))
                    }
                } catch (_: Exception) {
                }
                append("\n[process exited]\n")
            }.apply { isDaemon = true }.start()
            append("rslvd shell — /system/bin/sh (app sandbox)\nTry: ping -c 4 rslvd.net · ip addr · netstat · getprop\n\n")
        } catch (e: Exception) {
            append("Failed to start shell: ${e.message}\n")
        }
    }

    fun run(command: String) {
        val cmd = command.trim()
        if (cmd.isEmpty()) return
        if (history.lastOrNull() != cmd) history.add(cmd)
        historyIndex = history.size
        if (cmd == "clear") {
            synchronized(buffer) {
                buffer.setLength(0)
                _output.value = ""
            }
            return
        }
        append("$ $cmd\n")
        val alive = process?.isAlive == true
        if (!alive) {
            append("[restarting shell]\n")
            start()
        }
        try {
            writer?.apply {
                write(cmd)
                newLine()
                flush()
            }
        } catch (e: Exception) {
            append("write failed: ${e.message}\n")
        }
    }

    fun previousCommand(): String? {
        if (history.isEmpty()) return null
        if (historyIndex > 0) historyIndex--
        return history.getOrNull(historyIndex)
    }

    fun nextCommand(): String? {
        if (history.isEmpty()) return null
        if (historyIndex < history.size) historyIndex++
        return if (historyIndex >= history.size) "" else history[historyIndex]
    }

    fun close() {
        try {
            writer?.close()
        } catch (_: Exception) {
        }
        process?.destroy()
        process = null
    }
}

@Composable
fun TerminalScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current.applicationContext
    val session = remember { ShellSession(context) }
    DisposableEffect(Unit) { onDispose { session.close() } }

    val output by session.output.collectAsState()
    var input by remember { mutableStateOf("") }
    val scroll = rememberScrollState()

    LaunchedEffect(output) { scroll.scrollTo(scroll.maxValue) }

    fun submit() {
        session.run(input)
        input = ""
    }

    Column(modifier.fillMaxSize()) {
        SelectionContainer(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color(0xFF0A0A0F))
                .verticalScroll(scroll)
                .padding(12.dp),
        ) {
            Text(
                output,
                fontFamily = FontFamily.Monospace,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = Color(0xFFE8E8F0),
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Command…  (clear to reset)") },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { submit() }),
            )
            Spacer(Modifier.width(6.dp))
            IconButton(onClick = { submit() }) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Run")
            }
        }
    }
}
