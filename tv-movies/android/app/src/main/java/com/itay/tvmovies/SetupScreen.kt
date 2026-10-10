@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.itay.tvmovies

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import kotlinx.coroutines.launch

@Composable
fun SetupScreen(onConnect: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var searching by remember { mutableStateOf(true) }
    var found by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var address by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var fieldFocused by remember { mutableStateOf(false) }

    fun search() {
        scope.launch {
            searching = true
            found = ServerApi.discover()
            searching = false
        }
    }

    fun tryConnect(input: String) {
        if (input.isBlank()) return
        val url = ServerApi.normalizeUrl(input)
        scope.launch {
            status = "מתחבר ל-$url…"
            try {
                ServerApi(url).serverName()
                onConnect(url)
            } catch (e: Exception) {
                status = "לא הצלחתי להתחבר ל-$url. ודא שהשרת פועל ושהכתובת נכונה."
            }
        }
    }

    LaunchedEffect(Unit) { search() }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 80.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("הסרטים שלי", style = MaterialTheme.typography.displaySmall)
        Text(
            "הפעל את השרת במחשב (start-server.bat) ובחר אותו כאן.",
            style = MaterialTheme.typography.titleMedium,
            color = Color(0xFFBBBBBB),
        )
        Spacer(Modifier.height(8.dp))

        Text("מחשבים שנמצאו ברשת", style = MaterialTheme.typography.titleLarge)
        when {
            searching -> Text("מחפש…", color = Color(0xFFBBBBBB))
            found.isEmpty() -> Text("לא נמצא שרת אוטומטית — אפשר להקליד כתובת למטה.", color = Color(0xFFBBBBBB))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            found.forEach { (name, url) ->
                Button(onClick = { tryConnect(url) }) {
                    Text("$name  ·  ${url.removePrefix("http://")}")
                }
            }
            OutlinedButton(onClick = { search() }, enabled = !searching) { Text("חפש שוב") }
        }

        Spacer(Modifier.height(8.dp))
        Text("או הקלד את כתובת המחשב (מופיעה בחלון השרת)", style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicTextField(
                value = address,
                onValueChange = { address = it },
                singleLine = true,
                textStyle = TextStyle(color = Color.White, fontSize = 22.sp, textDirection = TextDirection.Ltr),
                cursorBrush = SolidColor(Color.White),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { tryConnect(address) }),
                decorationBox = { inner ->
                    if (address.isEmpty()) Text("192.168.1.10:8765", color = Color(0xFF777777), fontSize = 22.sp)
                    inner()
                },
                modifier = Modifier
                    .width(420.dp)
                    .onFocusChanged { fieldFocused = it.isFocused }
                    .background(Color(0xFF1E1E28), RoundedCornerShape(8.dp))
                    .border(2.dp, if (fieldFocused) Color.White else Color(0xFF444455), RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
            Button(onClick = { tryConnect(address) }) { Text("התחבר") }
        }
        status?.let { Text(it, color = Color(0xFFFFB74D)) }
    }
}
