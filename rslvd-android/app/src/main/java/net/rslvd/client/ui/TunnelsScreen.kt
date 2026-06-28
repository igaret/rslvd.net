package net.rslvd.client.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.rslvd.client.data.Tunnel

@Composable
fun TunnelsScreen(vm: AppViewModel, modifier: Modifier = Modifier) {
    val state by vm.tunnels.collectAsState()
    var showAdd by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<Tunnel?>(null) }

    LaunchedEffect(Unit) { if (state.items.isEmpty()) vm.loadTunnels() }

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("Add tunnel") },
            )
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                state.loading && state.items.isEmpty() ->
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                state.items.isEmpty() ->
                    EmptyState(
                        title = "No tunnels yet",
                        subtitle = state.error ?: "Create a tunnel to expose a local port through an @rslvd.net subdomain.",
                    )
                else -> LazyColumn(
                    Modifier.fillMaxSize().padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.items, key = { it.id }) { t ->
                        TunnelCard(
                            tunnel = t,
                            onCopyToken = { t.token?.let { vm.copyText("token", it) } },
                            onCopyFqdn = { t.fqdn?.let { vm.copyText("hostname", it) } },
                            onDelete = { confirmDelete = t },
                        )
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddTunnelDialog(
            onDismiss = { showAdd = false },
            onConfirm = { name, port, host, proto, https ->
                vm.createTunnel(name, port, host, proto, https) { ok -> if (ok) showAdd = false }
            },
        )
    }

    confirmDelete?.let { t ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete tunnel") },
            text = { Text("Delete ${t.name}? This removes its DNS record.") },
            confirmButton = { TextButton(onClick = { vm.deleteTunnel(t); confirmDelete = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun TunnelCard(tunnel: Tunnel, onCopyToken: () -> Unit, onCopyFqdn: () -> Unit, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tunnel.fqdn ?: tunnel.name, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                IconButton(onClick = onCopyFqdn) { Icon(Icons.Filled.ContentCopy, "Copy hostname") }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Delete", tint = MaterialTheme.colorScheme.error) }
            }
            Text(
                "${tunnel.protocol?.uppercase() ?: "TCP"} → ${tunnel.targetHost ?: "localhost"}:${tunnel.targetPort ?: "?"}  ·  ${tunnel.status ?: "?"}",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(8.dp))
            if (!tunnel.token.isNullOrBlank()) {
                OutlinedButton(onClick = onCopyToken) {
                    Icon(Icons.Filled.ContentCopy, null, Modifier.height(16.dp)); Text(" Copy connect token")
                }
            }
        }
    }
}

@Composable
private fun AddTunnelDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, Int, String, String, Boolean) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("localhost") }
    var proto by remember { mutableStateOf("tcp") }
    var https by remember { mutableStateOf(true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add tunnel") },
        text = {
            Column {
                LabeledField(name, { name = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' } }, "subdomain")
                Spacer(Modifier.height(8.dp))
                LabeledField(host, { host = it }, "target host")
                Spacer(Modifier.height(8.dp))
                LabeledField(port, { port = it.filter { c -> c.isDigit() }.take(5) }, "target port")
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("tcp", "udp", "dns2tcp").forEach { p ->
                        FilterChip(selected = proto == p, onClick = { proto = p }, label = { Text(p) })
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Force HTTPS", modifier = Modifier.weight(1f))
                    Switch(checked = https, onCheckedChange = { https = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank() && port.toIntOrNull() != null,
                onClick = { onConfirm(name, port.toInt(), host, proto, https) },
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
