package com.itay.tvmovies

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

enum class Filter(val label: String) {
    ALL("הכל"),
    CONTINUE("המשך צפייה"),
    UNWATCHED("לא נצפו"),
    WATCHED("נצפו"),
    NEW("נוספו לאחרונה"),
}

class LibraryViewModel(app: Application) : AndroidViewModel(app) {
    var serverUrl by mutableStateOf(Prefs.serverUrl(app))
        private set
    var movies by mutableStateOf<List<Movie>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var filter by mutableStateOf(Filter.ALL)

    val api: ServerApi? get() = serverUrl?.let { ServerApi(it) }

    fun visibleMovies(): List<Movie> = when (filter) {
        Filter.ALL -> movies
        Filter.CONTINUE -> movies.filter { it.inProgress }.sortedByDescending { it.updatedAt }
        Filter.UNWATCHED -> movies.filter { !it.watched }
        Filter.WATCHED -> movies.filter { it.watched }
        Filter.NEW -> movies.sortedByDescending { it.addedAt }.take(40)
    }

    fun count(f: Filter): Int = when (f) {
        Filter.ALL -> movies.size
        Filter.CONTINUE -> movies.count { it.inProgress }
        Filter.UNWATCHED -> movies.count { !it.watched }
        Filter.WATCHED -> movies.count { it.watched }
        Filter.NEW -> minOf(movies.size, 40)
    }

    fun refresh(rescan: Boolean = false) {
        val api = api ?: return
        if (loading) return
        viewModelScope.launch {
            loading = true
            try {
                movies = api.movies(rescan)
                error = null
            } catch (e: Exception) {
                error = "אין חיבור למחשב (${api.baseUrl}).\nודא שהשרת פועל במחשב ושהטלוויזיה באותה רשת."
            }
            loading = false
        }
    }

    fun connect(url: String) {
        Prefs.setServerUrl(getApplication(), url)
        serverUrl = url
        movies = emptyList()
        error = null
        refresh()
    }

    fun disconnect() {
        Prefs.setServerUrl(getApplication(), null)
        serverUrl = null
        movies = emptyList()
        error = null
    }

    fun setWatched(movie: Movie, watched: Boolean) {
        val api = api ?: return
        viewModelScope.launch {
            try {
                val updated = api.setWatched(movie.id, watched)
                movies = movies.map { if (it.id == updated.id) updated else it }
            } catch (e: Exception) {
                error = "לא הצלחתי לעדכן את השרת: ${e.message}"
            }
        }
    }
}
