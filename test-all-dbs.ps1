# Reads real connection strings from environment variables instead of hardcoding
# credentials in source. Set these before running (values live only in your shell):
#   $env:TEST_DB_POSTGRES_URL, $env:TEST_DB_MONGODB_URL, $env:TEST_DB_MYSQL_URL
$ErrorActionPreference = "Stop"

$tests = @(
    @{ Type = "sqlite"; Connection = "sqlite://data.db" }
)
if ($env:TEST_DB_POSTGRES_URL) { $tests += @{ Type = "postgres"; Connection = $env:TEST_DB_POSTGRES_URL } }
if ($env:TEST_DB_MONGODB_URL) { $tests += @{ Type = "mongodb"; Connection = $env:TEST_DB_MONGODB_URL } }
if ($env:TEST_DB_MYSQL_URL) { $tests += @{ Type = "mysql"; Connection = $env:TEST_DB_MYSQL_URL } }
if ($tests.Count -eq 1) { Write-Host "Only sqlite will run — set TEST_DB_POSTGRES_URL / TEST_DB_MONGODB_URL / TEST_DB_MYSQL_URL to also test those backends." }

Write-Host "Rebuilding Server..."
Set-Location server
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Set-Location ..

$envPath = "server/.env"
$originalEnv = Get-Content $envPath
if (Test-Path "server/db-config.json") { Remove-Item "server/db-config.json" }

foreach ($test in $tests) {
    Write-Host "`n======================================================="
    Write-Host "🧪 Testing Database: $($test.Type)"
    Write-Host "======================================================="
    
    # Update .env
    $newEnv = $originalEnv | Where-Object { $_ -notmatch '^DB_TYPE=' -and $_ -notmatch '^DB_CONNECTION_STRING=' -and $_ -notmatch '^MONGODB_URI=' }
    $newEnv += "DB_TYPE=$($test.Type)"
    $newEnv += "DB_CONNECTION_STRING=$($test.Connection)"
    $newEnv += "MONGODB_URI=$($test.Connection)"
    $newEnv | Set-Content $envPath
    
    # Restart PM2
    Write-Host "Restarting PM2..."
    pm2 restart reqspace | Out-Null
    
    # Wait for healthy
    Write-Host "Waiting for server to become healthy..."
    $isHealthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $res = curl.exe -s http://localhost:3005/api/health | ConvertFrom-Json
            if ($res.status -eq 'ok') {
                $isHealthy = $true
                break
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    
    if (-not $isHealthy) {
        Write-Host "❌ Server failed to become healthy with $($test.Type)"
        pm2 logs reqspace --lines 30
        throw "Health check failed"
    }
    
    Write-Host "✅ Server is healthy!"
    
    # Run E2E Test
    Write-Host "Running E2E tests..."
    Set-Location server
    npx jest src/tests/auth.e2e.test.ts --runInBand
    $testExitCode = $LASTEXITCODE
    Set-Location ..
    if ($testExitCode -ne 0) {
        Write-Host "❌ Tests failed for $($test.Type)!"
        throw "Tests failed"
    }
    
    Write-Host "✅ Tests passed for $($test.Type)!"
}

# Restore original env
$originalEnv | Set-Content $envPath
Write-Host "Restarting PM2 with original env..."
pm2 restart reqspace | Out-Null

Write-Host "`n🎉 ALL DATABASES TESTED SUCCESSFULLY! 🎉"
