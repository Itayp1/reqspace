package com.itay.tvmovies

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import androidx.tv.material3.darkColorScheme

class MainActivity : ComponentActivity() {
    private val vm: LibraryViewModel by viewModels()

    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Accent)) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        colors = SurfaceDefaults.colors(containerColor = Background, contentColor = Color.White),
                    ) {
                        val url = vm.serverUrl
                        if (url == null) {
                            SetupScreen(onConnect = vm::connect)
                        } else {
                            LibraryScreen(vm, onPlay = { movie, start ->
                                startActivity(PlayerActivity.intent(this@MainActivity, url, movie, start))
                            })
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Coming back from the player: pick up the new progress / watched state.
        vm.refresh()
    }
}

val Background = Color(0xFF0E0E14)
val Accent = Color(0xFFE53935)
