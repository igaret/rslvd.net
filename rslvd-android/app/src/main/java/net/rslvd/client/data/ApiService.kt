package net.rslvd.client.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @GET("auth/me")
    suspend fun me(): Response<User>

    @GET("hosts")
    suspend fun hosts(): Response<List<Host>>

    @POST("hosts")
    suspend fun createHost(@Body body: CreateHostRequest): Response<Host>

    @DELETE("hosts/{id}")
    suspend fun deleteHost(@Path("id") id: Int): Response<GenericResponse>

    @GET("tunnels")
    suspend fun tunnels(): Response<List<Tunnel>>

    @POST("tunnels")
    suspend fun createTunnel(@Body body: CreateTunnelRequest): Response<Tunnel>

    @DELETE("tunnels/{id}")
    suspend fun deleteTunnel(@Path("id") id: Int): Response<GenericResponse>
}
