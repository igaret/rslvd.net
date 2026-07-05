package net.rslvd.client.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private const val BILLING_URL = "https://rslvd.net/dashboard"

/**
 * Billing tab. Shows the current plan / subscription status and the available
 * plans. Card entry and checkout happen in the rslvd.net web dashboard
 * (Square Web Payments SDK) so no card data ever touches the app.
 */
@Composable
fun BillingScreen(vm: AppViewModel, modifier: Modifier = Modifier) {
    val user by vm.user.collectAsState()
    val billing by vm.billing.collectAsState()
    val context = LocalContext.current
    var showCancel by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadBilling(); vm.refreshUser() }

    val sub = billing.subscription
    val status = sub?.status ?: user?.status ?: "free"
    val planLabel = billing.plans.firstOrNull { it.key == (sub?.plan ?: user?.plan) }?.label
        ?: (sub?.plan ?: user?.plan ?: "free").replaceFirstChar { it.uppercase() }
    val isPaid = status == "active" || status == "cancelling" || status == "past_due"

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Current plan", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (isPaid) planLabel else "Free", fontWeight = FontWeight.Bold, fontSize = 22.sp)
                    Spacer(Modifier.weight(1f))
                    StatusBadge(status)
                }
                if (isPaid) {
                    Spacer(Modifier.height(8.dp))
                    sub?.paidThroughDate?.let {
                        InfoLine(if (status == "cancelling") "Active until" else "Renews", it.take(10))
                    }
                    sub?.paymentMethod?.let { pm ->
                        InfoLine("Card", "${pm.type ?: "Card"} •••• ${pm.last4 ?: "????"}" +
                            (pm.expirationMonth?.let { m -> "  (${m}/${pm.expirationYear})" } ?: ""))
                    }
                } else {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Free tier: up to ${user?.maxHosts ?: 2} hosts and ${user?.maxTunnels ?: 2} tunnels.",
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f), fontSize = 14.sp,
                    )
                }
            }
        }

        if (billing.loading) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.padding(16.dp))
            }
        }

        billing.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 14.sp)
        }

        if (billing.plans.isNotEmpty()) {
            Text("Plans", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            billing.plans.forEach { p ->
                val isCurrent = isPaid && p.key == (sub?.plan ?: user?.plan)
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.label, fontWeight = FontWeight.Bold)
                            Text(
                                "${p.maxHosts?.let { if (it >= 999999) "Unlimited" else "$it" } ?: "?"} hosts · " +
                                    "${p.maxTunnels?.let { if (it >= 999999) "Unlimited" else "$it" } ?: "?"} tunnels",
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                            )
                        }
                        Text(if (isCurrent) "Current" else p.amount, fontWeight = FontWeight.Medium,
                            color = if (isCurrent) Color(0xFF34D399) else MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Button(
            onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BILLING_URL))) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (isPaid) "Manage billing on rslvd.net" else "Subscribe on rslvd.net") }
        Text(
            "Payments are processed securely by Square on rslvd.net — card details never touch this app.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )

        if (status == "active") {
            OutlinedButton(
                onClick = { showCancel = true },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Cancel subscription") }
        }

        OutlinedButton(onClick = { vm.loadBilling() }, modifier = Modifier.fillMaxWidth()) {
            Text("Refresh")
        }
    }

    if (showCancel) {
        AlertDialog(
            onDismissRequest = { showCancel = false },
            title = { Text("Cancel subscription?") },
            text = { Text("Your plan stays active until the end of the period you already paid for, then your account returns to the Free tier.") },
            confirmButton = {
                TextButton(onClick = { showCancel = false; vm.cancelSubscription { } }) {
                    Text("Cancel subscription", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { showCancel = false }) { Text("Keep plan") } },
        )
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (label, color) = when (status) {
        "active" -> "Active" to Color(0xFF34D399)
        "cancelling" -> "Cancelling" to Color(0xFFFBBF24)
        "past_due" -> "Past due" to Color(0xFFF87171)
        else -> "Free" to Color(0xFF9CA3AF)
    }
    Text(label, color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp)
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f), fontSize = 14.sp)
        Text(value, fontWeight = FontWeight.Medium, fontSize = 14.sp)
    }
}
