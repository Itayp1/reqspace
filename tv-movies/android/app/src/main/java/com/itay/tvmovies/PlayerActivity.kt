package com.itay.tvmovies

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {

    private lateinit var api: ServerApi
    private lateinit var movieId: String
    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private var finishedWatching = false
    private val handler = Handler(Looper.getMainLooper())
    private val periodicSave = object : Runnable {
        override fun run() {
            saveProgress()
            handler.postDelayed(this, SAVE_INTERVAL_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        api = ServerApi(intent.getStringExtra(EXTRA_SERVER)!!)
        movieId = intent.getStringExtra(EXTRA_ID)!!
        val title = intent.getStringExtra(EXTRA_TITLE) ?: ""
        val startPosition = intent.getLongExtra(EXTRA_START, 0)
        val subtitleFormat = intent.getStringExtra(EXTRA_SUBTITLES)

        playerView = PlayerView(this).apply {
            setBackgroundColor(Color.BLACK)
            setShowSubtitleButton(true)
            controllerShowTimeoutMs = 4000
            keepScreenOn = true
        }
        setContentView(playerView)

        val renderers = DefaultRenderersFactory(this).setEnableDecoderFallback(true)
        val exo = ExoPlayer.Builder(this, renderers)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(30_000)
            .build()
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setPreferredTextLanguage("he")
            .setPreferredAudioLanguages("he", "en")
            .build()

        val item = MediaItem.Builder()
            .setUri(api.streamUrl(movieId))
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
        if (subtitleFormat != null) {
            item.setSubtitleConfigurations(
                listOf(
                    MediaItem.SubtitleConfiguration.Builder(Uri.parse(api.subtitlesUrl(movieId)))
                        .setMimeType(if (subtitleFormat == "vtt") MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP)
                        .setLanguage("he")
                        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                        .build()
                )
            )
        }
        exo.setMediaItem(item.build(), startPosition)
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) onMovieEnded()
            }

            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(
                    this@PlayerActivity,
                    "שגיאה בניגון (${error.errorCodeName}). ייתכן שהטלוויזיה לא תומכת בפורמט של הקובץ.",
                    Toast.LENGTH_LONG,
                ).show()
            }
        })
        exo.playWhenReady = true
        exo.prepare()
        playerView.player = exo
        player = exo
        playerView.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        handler.postDelayed(periodicSave, SAVE_INTERVAL_MS)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(periodicSave)
        saveProgress()
        player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
    }

    private fun saveProgress() {
        val p = player ?: return
        if (finishedWatching) return
        val duration = p.duration
        if (duration == C.TIME_UNSET || duration <= 0) return
        // A few seconds in doesn't count as "started watching".
        val position = if (p.currentPosition < MIN_RESUME_MS) 0 else p.currentPosition
        backgroundScope.launch {
            runCatching { api.saveProgress(movieId, position, duration) }
        }
    }

    private fun onMovieEnded() {
        if (finishedWatching) return
        finishedWatching = true
        backgroundScope.launch { runCatching { api.setWatched(movieId, true) } }
        finish()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = player
        if (p != null && !playerView.isControllerFullyVisible) {
            // With the controls hidden: left/right seek, OK toggles pause.
            val handled = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { if (event.action == KeyEvent.ACTION_DOWN) p.seekBack(); true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { if (event.action == KeyEvent.ACTION_DOWN) p.seekForward(); true }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                        if (p.isPlaying) p.pause() else p.play()
                    }
                    true
                }
                else -> false
            }
            if (handled) {
                playerView.showController()
                return true
            }
        } else if (event.keyCode == KeyEvent.KEYCODE_BACK && playerView.isControllerFullyVisible) {
            // First Back hides the controls, a second one leaves the movie.
            if (event.action == KeyEvent.ACTION_UP) playerView.hideController()
            return true
        }
        return playerView.dispatchKeyEvent(event) || super.dispatchKeyEvent(event)
    }

    companion object {
        private const val EXTRA_SERVER = "server"
        private const val EXTRA_ID = "id"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_START = "start"
        private const val EXTRA_SUBTITLES = "subtitles"
        private const val SAVE_INTERVAL_MS = 15_000L
        private const val MIN_RESUME_MS = 15_000L

        fun intent(context: Context, serverUrl: String, movie: Movie, startPosition: Long): Intent =
            Intent(context, PlayerActivity::class.java)
                .putExtra(EXTRA_SERVER, serverUrl)
                .putExtra(EXTRA_ID, movie.id)
                .putExtra(EXTRA_TITLE, movie.displayTitle)
                .putExtra(EXTRA_START, startPosition)
                .putExtra(EXTRA_SUBTITLES, if (movie.hasSubtitles) (movie.subtitleFormat ?: "srt") else null)
    }
}
