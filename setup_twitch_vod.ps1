# PowerShell Script to Configure Twitch VOD Track Publication on Datarhei Restreamer
# This script sends a POST request to your local Datarhei Core REST API to register a custom publication process.

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Susshico Restreamer: Twitch VOD Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Get Restreamer API settings from user
$port = Read-Host "Enter your local Restreamer API port [default: 8080]"
if ([string]::IsNullOrEmpty($port)) { $port = "8080" }

$twitchKey = Read-Host "Enter your Twitch Stream Key"
if ([string]::IsNullOrEmpty($twitchKey)) {
    Write-Error "Twitch Stream Key is required!"
    exit
}

$channelId = Read-Host "Enter your Ingest Channel ID [default: live]"
if ([string]::IsNullOrEmpty($channelId)) { $channelId = "live" }

# Formulate inputs and outputs
# Datarhei Core hosts streams under http://127.0.0.1:{port}/memfs/{channelId}.m3u8
$inputAddress = "http://127.0.0.1:$port/memfs/$channelId.m3u8"
$outputAddress = "rtmp://live.twitch.tv/app/$twitchKey"

Write-Host ""
Write-Host "Probing local API connection at http://127.0.0.1:$port/api/v3/process ..." -ForegroundColor Yellow

# Test connectivity
try {
    $testConn = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v3/process" -Method Get -ErrorAction Stop
    Write-Host "Connected successfully to Datarhei Core API!" -ForegroundColor Green
} catch {
    Write-Host "Failed to connect to Restreamer API on port $port." -ForegroundColor Red
    Write-Host "Make sure your Restreamer Docker container is running and port $port is exposed." -ForegroundColor Red
    exit
}

# Construct JSON payload for custom process
# This maps the video and both audio tracks (Track 1 for Live, Track 2 for VOD)
# and sends the custom 'rtmp_twitch_vod_track=2' metadata required by Twitch.
$payload = @{
    id = "twitch-vod-publish"
    autostart = $true
    input = @(
        @{
            address = $inputAddress
            options = @("-re")
        }
    )
    output = @(
        @{
            address = $outputAddress
            options = @(
                "-map", "0:v:0",
                "-map", "0:a:0",
                "-map", "0:a:1",
                "-c:v", "copy",
                "-c:a", "copy",
                "-metadata", "rtmp_twitch_vod_track=2",
                "-f", "flv"
            )
        }
    )
    reconnect = $true
    reconnect_delay_seconds = 5
} | ConvertTo-Json -Depth 5

Write-Host "Registering Custom Twitch VOD publication process in Restreamer..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v3/process" -Method Post -Body $payload -ContentType "application/json"
    Write-Host "Success! Twitch VOD Track publication process has been created." -ForegroundColor Green
    Write-Host "Process ID: $($response.id)" -ForegroundColor Green
    Write-Host "You can monitor the stream process logs in the Restreamer Admin Panel under expert logs." -ForegroundColor Green
} catch {
    Write-Host "Error creating process: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = [System.Console]::ReadKey($true)
