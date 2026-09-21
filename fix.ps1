$lines = Get-Content server/src/index.ts
$filtered = @()
$importsSeen = $false
foreach ($line in $lines) {
  if ($line -match "import authRouter from") {
    if ($importsSeen) { continue }
    $importsSeen = $true
  }
  $filtered += $line
}
$filtered | Set-Content server/src/index.ts
