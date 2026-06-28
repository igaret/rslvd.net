package net.rslvd.client.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Securely stores the JWT and cached account email using EncryptedSharedPreferences. */
class TokenStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val appContext = context.applicationContext
        try {
            val masterKey = MasterKey.Builder(appContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                appContext,
                "rslvd_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            // Fall back to plain prefs if the keystore is unavailable on this device.
            appContext.getSharedPreferences("rslvd_prefs", Context.MODE_PRIVATE)
        }
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var email: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_EMAIL, value).apply()

    fun isLoggedIn(): Boolean = !token.isNullOrBlank()

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_EMAIL).apply()
    }

    companion object {
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_EMAIL = "account_email"
    }
}
