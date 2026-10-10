package com.itay.tvmovies

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL

/** Outlives activities, so progress saved while closing the player still reaches the server. */
val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

class ServerApi(val baseUrl: String) {

    fun streamUrl(id: String) = "$baseUrl/stream/$id"
    fun posterUrl(id: String) = "$baseUrl/poster/$id"
    fun subtitlesUrl(id: String) = "$baseUrl/subtitles/$id"

    suspend fun serverName(): String = withContext(Dispatchers.IO) {
        JSONObject(request("GET", "/api/info")).getString("name")
    }

    suspend fun movies(refresh: Boolean = false): List<Movie> = withContext(Dispatchers.IO) {
        val arr = JSONObject(request("GET", "/api/movies" + if (refresh) "?refresh=1" else "")).getJSONArray("movies")
        List(arr.length()) { Movie.fromJson(arr.getJSONObject(it)) }
    }

    suspend fun setWatched(id: String, watched: Boolean): Movie = withContext(Dispatchers.IO) {
        Movie.fromJson(JSONObject(request("POST", "/api/movies/$id/watched", JSONObject().put("watched", watched))))
    }

    suspend fun saveProgress(id: String, position: Long, duration: Long): Movie = withContext(Dispatchers.IO) {
        val body = JSONObject().put("position", position).put("duration", duration)
        Movie.fromJson(JSONObject(request("POST", "/api/movies/$id/progress", body)))
    }

    private fun request(method: String, path: String, body: JSONObject? = null): String {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 4000
            conn.readTimeout = 15000
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            if (code !in 200..299) throw RuntimeException("השרת החזיר שגיאה $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        const val DEFAULT_PORT = 8765
        private const val DISCOVERY_PORT = 8766

        /** Accepts "192.168.1.10", "192.168.1.10:8765" or a full http:// URL. */
        fun normalizeUrl(input: String): String {
            var s = input.trim().trimEnd('/')
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            val hostPart = s.substringAfter("://")
            if (!hostPart.contains(':')) s = "$s:$DEFAULT_PORT"
            return s
        }

        /** Broadcasts on the local network and returns every movie server that answers. */
        suspend fun discover(timeoutMs: Long = 2500): List<Pair<String, String>> = withContext(Dispatchers.IO) {
            val found = LinkedHashMap<String, String>()
            try {
                DatagramSocket().use { socket ->
                    socket.broadcast = true
                    socket.soTimeout = 400
                    val msg = "TVMOVIES_DISCOVER".toByteArray()
                    val target = InetAddress.getByName("255.255.255.255")
                    repeat(2) { socket.send(DatagramPacket(msg, msg.size, target, DISCOVERY_PORT)) }
                    val deadline = System.currentTimeMillis() + timeoutMs
                    val buf = ByteArray(2048)
                    while (System.currentTimeMillis() < deadline) {
                        val packet = DatagramPacket(buf, buf.size)
                        try {
                            socket.receive(packet)
                        } catch (e: SocketTimeoutException) {
                            continue
                        }
                        try {
                            val json = JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8))
                            val url = "http://${packet.address.hostAddress}:${json.getInt("port")}"
                            found[url] = json.optString("name", url)
                        } catch (e: Exception) {
                            // Not one of ours.
                        }
                    }
                }
            } catch (e: Exception) {
                // No network or broadcast not allowed: fall back to manual entry.
            }
            found.map { (url, name) -> name to url }
        }
    }
}

object Prefs {
    private fun prefs(context: Context) = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun serverUrl(context: Context): String? = prefs(context).getString("server_url", null)

    fun setServerUrl(context: Context, url: String?) {
        prefs(context).edit().putString("server_url", url).apply()
    }
}
