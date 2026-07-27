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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import kotlinx.coroutines.delay
import net.rslvd.client.data.TicketDetail
import net.rslvd.client.data.TicketMessage

@Composable
fun SupportScreen(vm: AppViewModel, modifier: Modifier = Modifier) {
    val state by vm.support.collectAsState()
    var showNew by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadTickets() }

    val viewing = state.viewing
    if (viewing != null) {
        TicketThread(vm, viewing, modifier)
        return
    }

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showNew = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("New ticket") },
            )
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                state.loading && state.tickets.isEmpty() ->
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                state.tickets.isEmpty() ->
                    EmptyState(
                        title = "No tickets yet",
                        subtitle = state.error
                            ?: "Our AI assistant answers first — usually within a minute. Escalate to a human anytime.",
                    )
                else -> LazyColumn(
                    Modifier.fillMaxSize().padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.tickets, key = { it.id }) { t ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.fillMaxWidth().padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(t.subject, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                                    Text(
                                        statusLabel(t.status),
                                        fontSize = 11.sp,
                                        color = statusColor(t.status),
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                                Text(
                                    "#${t.id}${t.userEmail?.let { " · $it" } ?: ""} · ${t.messageCount ?: 0} messages",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                )
                                Spacer(Modifier.height(6.dp))
                                OutlinedButton(onClick = { vm.openTicket(t.id) }) { Text("Open") }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showNew) {
        NewTicketDialog(
            onDismiss = { showNew = false },
            onConfirm = { subject, body ->
                vm.createTicket(subject, body) { ok -> if (ok) showNew = false }
            },
        )
    }
}

@Composable
private fun TicketThread(vm: AppViewModel, ticket: TicketDetail, modifier: Modifier) {
    var reply by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    // Poll while the AI reply may still be on its way
    LaunchedEffect(ticket.id, ticket.status) {
        while (ticket.status == "open") {
            delay(6000)
            vm.refreshOpenTicket()
        }
    }

    Column(modifier.fillMaxSize().padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { vm.closeTicketView() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
            }
            Column(Modifier.weight(1f)) {
                Text(ticket.subject, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text("#${ticket.id} · ${statusLabel(ticket.status)}", fontSize = 12.sp, color = statusColor(ticket.status))
            }
            if (ticket.status != "closed" && ticket.status != "escalated") {
                TextButton(onClick = { vm.escalateTicket() }) { Text("Get a human") }
            }
        }

        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(ticket.messages, key = { it.id }) { m -> MessageBubble(m) }
            val last = ticket.messages.lastOrNull()
            if (ticket.status == "open" && last != null && !last.isAi && !last.isStaff) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.height(16.dp).width(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("AI assistant is typing…", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                }
            }
        }

        if (ticket.status != "closed") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = reply,
                    onValueChange = { reply = it },
                    placeholder = { Text("Type your reply…") },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                )
                IconButton(
                    enabled = reply.isNotBlank() && !sending,
                    onClick = {
                        sending = true
                        vm.replyTicket(reply) { ok ->
                            sending = false
                            if (ok) reply = ""
                        }
                    },
                ) { Icon(Icons.AutoMirrored.Filled.Send, "Send") }
            }
        }
    }
}

@Composable
private fun MessageBubble(m: TicketMessage) {
    val fromSupport = m.isAi || m.isStaff
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromSupport) Arrangement.Start else Arrangement.End,
    ) {
        Card {
            Column(Modifier.padding(10.dp)) {
                Text(
                    if (m.isAi) "🤖 AI Assistant" else if (m.isStaff) "🛡 Site Owner" else "You",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (fromSupport) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                Spacer(Modifier.height(4.dp))
                Text(m.body, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun NewTicketDialog(onDismiss: () -> Unit, onConfirm: (String, String) -> Unit) {
    var subject by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New support ticket") },
        text = {
            Column {
                LabeledField(subject, { subject = it.take(200) }, "Subject")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it.take(10000) },
                    label = { Text("Describe your issue") },
                    minLines = 3,
                    maxLines = 6,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = subject.isNotBlank() && body.isNotBlank(),
                onClick = { onConfirm(subject.trim(), body.trim()) },
            ) { Text("Submit") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private fun statusLabel(status: String?) = when (status) {
    "escalated" -> "WITH THE OWNER"
    else -> (status ?: "open").uppercase()
}

@Composable
private fun statusColor(status: String?) = when (status) {
    "answered" -> MaterialTheme.colorScheme.primary
    "escalated" -> MaterialTheme.colorScheme.tertiary
    "closed" -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
    else -> MaterialTheme.colorScheme.secondary
}
