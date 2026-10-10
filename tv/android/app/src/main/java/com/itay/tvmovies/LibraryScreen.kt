@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.itay.tvmovies

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Button
import androidx.tv.material3.Card
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.FilterChip
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import androidx.tv.material3.Text
import coil.compose.AsyncImage

@Composable
fun LibraryScreen(vm: LibraryViewModel, onPlay: (Movie, Long) -> Unit) {
    val api = vm.api ?: return
    var selectedId by remember { mutableStateOf<String?>(null) }
    val gridState = rememberLazyGridState()
    val firstFilterFocus = remember { FocusRequester() }
    val visible = vm.visibleMovies()

    LaunchedEffect(Unit) {
        runCatching { firstFilterFocus.requestFocus() }
    }

    Column(Modifier.fillMaxSize().padding(start = 48.dp, end = 48.dp, top = 28.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("הסרטים שלי", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(32.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Filter.entries.forEachIndexed { index, f ->
                    FilterChip(
                        selected = vm.filter == f,
                        onClick = { vm.filter = f },
                        modifier = if (index == 0) Modifier.focusRequester(firstFilterFocus) else Modifier,
                    ) { Text("${f.label} (${vm.count(f)})") }
                }
            }
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = { vm.refresh(rescan = true) }) { Text(if (vm.loading) "טוען…" else "רענן") }
            Spacer(Modifier.width(8.dp))
            OutlinedButton(onClick = { vm.disconnect() }) { Text("החלף מחשב") }
        }
        Spacer(Modifier.height(16.dp))

        val error = vm.error
        when {
            error != null && vm.movies.isEmpty() -> Message(error) {
                Button(onClick = { vm.refresh() }) { Text("נסה שוב") }
            }
            vm.movies.isEmpty() && vm.loading -> Message("טוען את רשימת הסרטים…")
            visible.isEmpty() -> Message(
                if (vm.movies.isEmpty()) "לא נמצאו סרטים בתיקיות שהוגדרו בשרת." else "אין סרטים ברשימה הזו."
            )
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(170.dp),
                state = gridState,
                contentPadding = PaddingValues(top = 12.dp, bottom = 48.dp, start = 8.dp, end = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(22.dp),
                verticalArrangement = Arrangement.spacedBy(26.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(visible, key = { it.id }) { movie ->
                    MovieCard(
                        movie = movie,
                        posterUrl = api.posterUrl(movie.id),
                        onClick = { selectedId = movie.id },
                        onLongClick = { vm.setWatched(movie, !movie.watched) },
                    )
                }
            }
        }
    }

    val selected = selectedId?.let { id -> vm.movies.firstOrNull { it.id == id } }
    if (selected != null) {
        MovieDetailsDialog(
            movie = selected,
            posterUrl = api.posterUrl(selected.id),
            onDismiss = { selectedId = null },
            onPlay = { start ->
                selectedId = null
                onPlay(selected, start)
            },
            onToggleWatched = { vm.setWatched(selected, !selected.watched) },
        )
    }
}

@Composable
private fun Message(text: String, action: (@Composable () -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            action()
        }
    }
}

@Composable
private fun Poster(movie: Movie, posterUrl: String, modifier: Modifier = Modifier) {
    Box(modifier.background(Brush.verticalGradient(listOf(Color(0xFF3A2D5C), Color(0xFF1B1B2A))))) {
        // Placeholder title, covered by the poster once it loads.
        Text(
            movie.displayTitle,
            modifier = Modifier.align(Alignment.Center).padding(12.dp),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium,
        )
        AsyncImage(
            model = posterUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun MovieCard(movie: Movie, posterUrl: String, onClick: () -> Unit, onLongClick: () -> Unit) {
    Column {
        Card(
            onClick = onClick,
            onLongClick = onLongClick,
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f),
        ) {
            Box(Modifier.fillMaxSize()) {
                Poster(movie, posterUrl, Modifier.fillMaxSize())
                if (movie.watched) {
                    Box(
                        Modifier.align(Alignment.TopStart).padding(8.dp).size(34.dp)
                            .background(Color(0xE02E7D32), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Text("✓", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                }
                if (movie.inProgress) ProgressBar(movie.progress, Modifier.align(Alignment.BottomCenter))
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            movie.displayTitle,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (movie.watched) Color(0xFF9E9E9E) else Color.White,
        )
    }
}

@Composable
private fun ProgressBar(progress: Float, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(6.dp).background(Color(0x99000000))) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(progress).background(Accent))
    }
}

@Composable
private fun MovieDetailsDialog(
    movie: Movie,
    posterUrl: String,
    onDismiss: () -> Unit,
    onPlay: (Long) -> Unit,
    onToggleWatched: () -> Unit,
) {
    val firstButton = remember { FocusRequester() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            colors = SurfaceDefaults.colors(containerColor = Color(0xF20E0E14), contentColor = Color.White),
        ) {
            Row(Modifier.fillMaxSize().padding(64.dp), verticalAlignment = Alignment.CenterVertically) {
                Poster(
                    movie, posterUrl,
                    Modifier.width(260.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp)),
                )
                Spacer(Modifier.width(48.dp))
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(movie.title, style = MaterialTheme.typography.displaySmall, maxLines = 2)
                    val details = listOfNotNull(
                        movie.year?.toString(),
                        movie.folder.ifBlank { null },
                        if (movie.duration > 0) formatTime(movie.duration) else null,
                        if (movie.hasSubtitles) "כתוביות" else null,
                    ).joinToString("  ·  ")
                    if (details.isNotEmpty()) Text(details, color = Color(0xFFBBBBBB), style = MaterialTheme.typography.titleMedium)
                    Text(
                        when {
                            movie.watched -> "✓ צפית בסרט הזה"
                            movie.inProgress -> "עצרת ב-${formatTime(movie.position)}"
                            else -> "עוד לא צפית"
                        },
                        color = if (movie.watched) Color(0xFF81C784) else Color(0xFFFFB74D),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (movie.inProgress) {
                            Button(onClick = { onPlay(movie.position) }, modifier = Modifier.focusRequester(firstButton)) {
                                Text("▶  המשך מ-${formatTime(movie.position)}")
                            }
                            OutlinedButton(onClick = { onPlay(0) }) { Text("מההתחלה") }
                        } else {
                            Button(onClick = { onPlay(0) }, modifier = Modifier.focusRequester(firstButton)) {
                                Text("▶  נגן")
                            }
                        }
                        OutlinedButton(onClick = onToggleWatched) {
                            Text(if (movie.watched) "סמן כלא נצפה" else "סמן כנצפה")
                        }
                    }
                }
            }
            LaunchedEffect(movie.inProgress) { runCatching { firstButton.requestFocus() } }
        }
    }
}
