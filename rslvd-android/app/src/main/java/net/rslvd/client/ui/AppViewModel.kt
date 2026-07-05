package net.rslvd.client.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.rslvd.client.data.Host
import net.rslvd.client.data.LoginResult
import net.rslvd.client.data.PlanInfo
import net.rslvd.client.data.SubscriptionInfo
import net.rslvd.client.data.Repository
import net.rslvd.client.data.Tunnel
import net.rslvd.client.data.User
import net.rslvd.client.ddns.DdnsConfig
import net.rslvd.client.ddns.DdnsScheduler
import net.rslvd.client.ddns.DdnsTarget

data class HostsState(
    val loading: Boolean = false,
    val items: List<Host> = emptyList(),
    val error: String? = null,
)

data class TunnelsState(
    val loading: Boolean = false,
    val items: List<Tunnel> = emptyList(),
    val error: String? = null,
)

data class BillingState(
    val loading: Boolean = false,
    val plans: List<PlanInfo> = emptyList(),
    val subscription: SubscriptionInfo? = null,
    val error: String? = null,
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = Repository.get(app)
    private val ddnsConfig = DdnsConfig(app)

    private val _authed = MutableStateFlow(repo.isLoggedIn())
    val authed: StateFlow<Boolean> = _authed.asStateFlow()

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _hosts = MutableStateFlow(HostsState())
    val hosts: StateFlow<HostsState> = _hosts.asStateFlow()

    private val _tunnels = MutableStateFlow(TunnelsState())
    val tunnels: StateFlow<TunnelsState> = _tunnels.asStateFlow()

    private val _snackbar = MutableStateFlow<String?>(null)
    val snackbar: StateFlow<String?> = _snackbar.asStateFlow()

    private val _billing = MutableStateFlow(BillingState())
    val billing: StateFlow<BillingState> = _billing.asStateFlow()

    private val _ddns = MutableStateFlow(DdnsUiState())
    val ddns: StateFlow<DdnsUiState> = _ddns.asStateFlow()

    val accountEmail: String? get() = repo.tokenStore.email

    init {
        if (_authed.value) refreshUser()
        refreshDdns()
    }

    fun snackbarShown() { _snackbar.value = null }
    private fun toast(msg: String) { _snackbar.value = msg }

    fun copyText(label: String, text: String) {
        val cm = getApplication<Application>()
            .getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cm.setPrimaryClip(android.content.ClipData.newPlainText(label, text))
        toast("Copied $label")
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    fun login(email: String, password: String, totp: String?, onResult: (LoginResult) -> Unit) {
        viewModelScope.launch {
            val result = repo.login(email, password, totp)
            if (result is LoginResult.Success) {
                _authed.value = true
                _user.value = result.user
                loadAll()
            }
            onResult(result)
        }
    }

    fun register(email: String, password: String, onResult: (LoginResult) -> Unit) {
        viewModelScope.launch {
            val result = repo.register(email, password)
            if (result is LoginResult.Success) {
                _authed.value = true
                _user.value = result.user
                loadAll()
            }
            onResult(result)
        }
    }

    fun logout() {
        repo.logout()
        _authed.value = false
        _user.value = null
        _hosts.value = HostsState()
        _tunnels.value = TunnelsState()
    }

    fun refreshUser() {
        viewModelScope.launch {
            repo.me().onSuccess { _user.value = it }
                .onFailure { if ((it as? net.rslvd.client.data.ApiException)?.code == 401) logout() }
        }
    }

    private fun loadAll() {
        loadHosts()
        loadTunnels()
        refreshDdns()
    }

    // ── Hosts ──────────────────────────────────────────────────────────────────
    fun loadHosts() {
        _hosts.value = _hosts.value.copy(loading = true, error = null)
        viewModelScope.launch {
            repo.hosts()
                .onSuccess { _hosts.value = HostsState(items = it) }
                .onFailure { handleAuthError(it); _hosts.value = _hosts.value.copy(loading = false, error = it.message) }
        }
    }

    fun createHost(hostname: String, forceHttps: Boolean, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            repo.createHost(hostname, forceHttps)
                .onSuccess { toast("Created ${it.fqdn}"); loadHosts(); refreshDdns(); onDone(true) }
                .onFailure { toast(it.message ?: "Failed to create host"); onDone(false) }
        }
    }

    fun deleteHost(host: Host) {
        viewModelScope.launch {
            repo.deleteHost(host.id)
                .onSuccess { toast("Deleted ${host.fqdn}"); loadHosts(); refreshDdns() }
                .onFailure { toast(it.message ?: "Failed to delete host") }
        }
    }

    // ── Tunnels ──────────────────────────────────────────────────────────────
    fun loadTunnels() {
        _tunnels.value = _tunnels.value.copy(loading = true, error = null)
        viewModelScope.launch {
            repo.tunnels()
                .onSuccess { _tunnels.value = TunnelsState(items = it) }
                .onFailure { handleAuthError(it); _tunnels.value = _tunnels.value.copy(loading = false, error = it.message) }
        }
    }

    fun createTunnel(name: String, port: Int, host: String, protocol: String, forceHttps: Boolean, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            repo.createTunnel(name, port, host, protocol, forceHttps)
                .onSuccess { toast("Created ${it.fqdn ?: it.name}"); loadTunnels(); onDone(true) }
                .onFailure { toast(it.message ?: "Failed to create tunnel"); onDone(false) }
        }
    }

    fun deleteTunnel(tunnel: Tunnel) {
        viewModelScope.launch {
            repo.deleteTunnel(tunnel.id)
                .onSuccess { toast("Deleted ${tunnel.name}"); loadTunnels() }
                .onFailure { toast(it.message ?: "Failed to delete tunnel") }
        }
    }

    // ── Billing ──────────────────────────────────────────────────────────────
    fun loadBilling() {
        _billing.value = _billing.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val plans = repo.plans().getOrElse { handleAuthError(it); emptyList() }
            repo.subscription()
                .onSuccess { _billing.value = BillingState(plans = plans, subscription = it) }
                .onFailure {
                    handleAuthError(it)
                    _billing.value = BillingState(plans = plans, error = if (plans.isEmpty()) it.message else null)
                }
        }
    }

    fun cancelSubscription(onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            repo.cancelSubscription()
                .onSuccess { toast("Subscription will end at your paid-through date"); loadBilling(); refreshUser(); onDone(true) }
                .onFailure { toast(it.message ?: "Cancellation failed"); onDone(false) }
        }
    }

    private fun handleAuthError(t: Throwable) {
        if ((t as? net.rslvd.client.data.ApiException)?.code == 401) logout()
    }

    // ── DDNS ───────────────────────────────────────────────────────────────────
    fun refreshDdns() {
        _ddns.value = DdnsUiState(
            enabled = ddnsConfig.enabled,
            intervalMinutes = ddnsConfig.intervalMinutes,
            lastDetectedIp = ddnsConfig.lastDetectedIp,
            lastRun = ddnsConfig.lastRun,
            targets = ddnsConfig.getTargets(),
        )
    }

    fun setDdnsEnabled(enabled: Boolean) {
        ddnsConfig.enabled = enabled
        DdnsScheduler.schedule(getApplication())
        if (enabled) toast("Background DDNS updates enabled") else toast("Background DDNS updates disabled")
        refreshDdns()
    }

    fun setDdnsInterval(minutes: Long) {
        ddnsConfig.intervalMinutes = minutes
        if (ddnsConfig.enabled) DdnsScheduler.schedule(getApplication())
        refreshDdns()
    }

    /** Add a target for an rslvd host using its update key. */
    fun addRslvdTarget(host: Host) {
        val key = host.updateKey
        if (key.isNullOrBlank()) { toast("This host has no update key"); return }
        ddnsConfig.addTarget(
            DdnsTarget(
                id = "host-${host.id}",
                label = host.fqdn,
                urlTemplate = DdnsTarget.rslvdUrl(key),
                provider = DdnsTarget.PROVIDER_RSLVD,
            )
        )
        toast("Added ${host.fqdn} to DDNS")
        refreshDdns()
    }

    fun addCustomTarget(label: String, urlTemplate: String, onDone: (Boolean) -> Unit) {
        val url = urlTemplate.trim()
        if (label.isBlank() || !url.contains(DdnsTarget.IP_TOKEN)) {
            toast("URL must contain ${DdnsTarget.IP_TOKEN}")
            onDone(false)
            return
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("URL must start with http:// or https://")
            onDone(false)
            return
        }
        ddnsConfig.addTarget(
            DdnsTarget(
                id = "custom-${System.currentTimeMillis()}",
                label = label.trim(),
                urlTemplate = url,
                provider = DdnsTarget.PROVIDER_CUSTOM,
            )
        )
        toast("Added $label to DDNS")
        refreshDdns()
        onDone(true)
    }

    fun removeTarget(id: String) {
        ddnsConfig.removeTarget(id)
        refreshDdns()
    }

    fun runDdnsNow() {
        if (ddnsConfig.getTargets().isEmpty()) { toast("Add at least one DDNS target first"); return }
        DdnsScheduler.runNow(getApplication())
        toast("Updating now…")
    }
}

data class DdnsUiState(
    val enabled: Boolean = false,
    val intervalMinutes: Long = 15,
    val lastDetectedIp: String? = null,
    val lastRun: Long = 0L,
    val targets: List<DdnsTarget> = emptyList(),
)
