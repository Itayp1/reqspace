package com.itay.tvmovies

import org.json.JSONObject

data class Movie(
    val id: String,
    val title: String,
    val year: Int?,
    val folder: String,
    val hasSubtitles: Boolean,
    val subtitleFormat: String?,
    val watched: Boolean,
    val position: Long,
    val duration: Long,
    val updatedAt: Long,
    val addedAt: Long,
) {
    val displayTitle: String get() = if (year != null) "$title ($year)" else title
    val inProgress: Boolean get() = !watched && position > 0
    val progress: Float get() = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f

    companion object {
        fun fromJson(o: JSONObject) = Movie(
            id = o.getString("id"),
            title = o.getString("title"),
            year = if (o.isNull("year")) null else o.getInt("year"),
            folder = o.optString("folder", ""),
            hasSubtitles = o.optBoolean("hasSubtitles", false),
            subtitleFormat = if (o.isNull("subtitleFormat")) null else o.optString("subtitleFormat"),
            watched = o.optBoolean("watched", false),
            position = o.optLong("position", 0),
            duration = o.optLong("duration", 0),
            updatedAt = o.optLong("updatedAt", 0),
            addedAt = o.optDouble("addedAt", 0.0).toLong(),
        )
    }
}

fun formatTime(ms: Long): String {
    val totalSec = ms / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
