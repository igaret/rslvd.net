package net.rslvd.client.data

import com.squareup.moshi.Json

data class User(
    val id: String,
    val email: String,
    val displayName: String? = null,
    val plan: String? = null,
    val maxHosts: Int? = null,
    val maxTunnels: Int? = null,
    val status: String? = null,
    val role: String? = null,
    val emailVerified: Boolean = false,
    val tosAccepted: Boolean = true,
    val currentLegalVersion: String? = null,
    val totpEnabled: Boolean = false,
)

data class AuthResponse(
    val token: String? = null,
    val user: User? = null,
    val requireTotp: Boolean? = null,
    val error: String? = null,
)

data class LoginRequest(
    val email: String,
    val password: String,
    @Json(name = "totp_code") val totpCode: String? = null,
)

data class RegisterRequest(
    val email: String,
    val password: String,
    @Json(name = "tos_accepted") val tosAccepted: Boolean = true,
)

data class Host(
    val id: String,
    val hostname: String,
    val fqdn: String,
    @Json(name = "ip_address") val ipAddress: String? = null,
    @Json(name = "ipv6_address") val ipv6Address: String? = null,
    @Json(name = "last_updated") val lastUpdated: String? = null,
    @Json(name = "update_key") val updateKey: String? = null,
    val active: Boolean = true,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "parent_host_id") val parentHostId: String? = null,
    @Json(name = "force_https") val forceHttps: Boolean = true,
)

data class CreateHostRequest(
    val hostname: String,
    @Json(name = "force_https") val forceHttps: Boolean = true,
    @Json(name = "parent_id") val parentId: String? = null,
)

data class Tunnel(
    val id: String,
    val name: String,
    @Json(name = "tunnel_port") val tunnelPort: Int? = null,
    @Json(name = "target_host") val targetHost: String? = null,
    @Json(name = "target_port") val targetPort: Int? = null,
    val protocol: String? = null,
    val status: String? = null,
    val fqdn: String? = null,
    val token: String? = null,
    val active: Boolean = true,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "parent_tunnel_id") val parentTunnelId: String? = null,
    @Json(name = "force_https") val forceHttps: Boolean = true,
)

data class CreateTunnelRequest(
    val name: String,
    @Json(name = "target_port") val targetPort: Int,
    @Json(name = "target_host") val targetHost: String = "localhost",
    val protocol: String = "tcp",
    @Json(name = "force_https") val forceHttps: Boolean = true,
)

data class PlanInfo(
    val key: String,
    val label: String,
    val amount: String,
    val maxHosts: Int? = null,
    val maxTunnels: Int? = null,
)

data class PaymentMethod(
    val type: String? = null,
    val last4: String? = null,
    val expirationMonth: Int? = null,
    val expirationYear: Int? = null,
)

data class SubscriptionInfo(
    val status: String? = null,
    val plan: String? = null,
    val paidThroughDate: String? = null,
    val nextBillingDate: String? = null,
    val paymentMethod: PaymentMethod? = null,
    val error: String? = null,
)

data class GenericResponse(
    val success: Boolean? = null,
    val error: String? = null,
)
