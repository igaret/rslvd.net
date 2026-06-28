package net.rslvd.client.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Indigo = Color(0xFF4F46E5)
private val IndigoLight = Color(0xFF818CF8)

private val DarkColors = darkColorScheme(
    primary = IndigoLight,
    secondary = Color(0xFF22D3EE),
    background = Color(0xFF0F172A),
    surface = Color(0xFF1E293B),
)

private val LightColors = lightColorScheme(
    primary = Indigo,
    secondary = Color(0xFF0891B2),
)

@Composable
fun RslvdTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
