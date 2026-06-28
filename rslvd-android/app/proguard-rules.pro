# Retrofit / OkHttp / Moshi
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# Moshi generated adapters & model classes
-keep class net.rslvd.client.data.** { *; }
-keepclassmembers class net.rslvd.client.data.** { *; }
