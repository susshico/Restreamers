# Guide: Multitrack, Multivideo, 2K/4K, and Twitch VOD Track Support

This guide explains how to configure **OBS Studio**, **Datarhei Restreamer**, and custom **FFmpeg/Datarhei Core** processes to support multitrack audio (Twitch VOD Track), multivideo, and high-resolution 2K/4K streaming.

---

## 1. OBS Studio Configuration

### A. Twitch VOD Track (Audio Separation)
To play music or background audio on your live stream while ensuring it is excluded from your saved Twitch VOD archives (preventing copyright/DMCA muting):

1. Connect your Twitch account directly to OBS under **Settings > Stream**.
2. Go to **Settings > Output** and set the **Output Mode** to **Advanced**.
3. Under the **Streaming** tab:
   - Check the box for **Twitch VOD Track**.
   - Select **Track 2** (default) as the designated VOD track.
4. In the **Audio Mixer** section of OBS, click the gear icon (or three dots) next to any audio source and select **Advanced Audio Properties**:
   - **Track 1 (Live Feed)**: Keep all audio sources (microphone, game, alerts, background music) **checked**.
   - **Track 2 (VOD Archive)**: Check your microphone, game audio, and alerts, but **uncheck** your music source (e.g., Spotify, browser).

---

### B. 2K and 4K Streaming Settings
Streaming in 1440p (2K) or 2160p (4K) requires high bitrates and modern encoders.

1. Go to **Settings > Video**:
   - Set **Base (Canvas) Resolution** to `2560x1440` (2K) or `3840x2160` (4K).
   - Set **Output (Scaled) Resolution** to match the Canvas resolution.
2. Go to **Settings > Output > Streaming**:
   - **Encoder**: Select a hardware encoder:
     - **NVIDIA NVENC H.264** (ideal for compatibility).
     - **NVIDIA NVENC HEVC / AV1** (highly recommended for YouTube and Twitch's Enhanced Broadcasting for superior quality at lower bitrates).
   - **Rate Control**: CBR
   - **Bitrate Recommendations**:
     - **2K (1440p) H.264**: `8,000 - 10,000 Kbps`
     - **2K (1440p) HEVC/AV1**: `6,000 - 8,000 Kbps`
     - **4K (2160p) H.264**: `15,000 - 20,000 Kbps`
     - **4K (2160p) HEVC/AV1**: `10,000 - 15,000 Kbps`

---

### C. Multitrack Video / Multivideo Setup
For sending multiple video feeds simultaneously (such as a primary camera and a secondary gameplay camera, or multi-resolution streaming):
1. **Twitch Enhanced Broadcasting**: If supported, OBS can automatically negotiate multitrack video pushes directly.
2. **SRT Protocol**: SRT natively supports multiplexing multiple audio/video streams into a single connection. In OBS, set your stream target to an SRT address (e.g. `srt://your-restreamer-ip:6000`).

---

## 2. Datarhei Restreamer Configuration

To support 2K/4K streams without overloading your Restreamer host CPU, you must configure the Restreamer stream to pass the packets through without re-encoding.

### A. Enable Passthrough ("Copy") Mode
1. Open the Restreamer Web UI.
2. Go to **Edit Channel** for your active ingest feed.
3. Under the **Video** tab, set the encoder profile to **Copy (passthrough)**.
4. Under the **Audio** tab, set the encoder profile to **Copy (passthrough)**.
5. Save settings. This ensures Restreamer forwards the raw 2K/4K H.264/HEVC video packets directly to Twitch/YouTube with nearly 0% CPU usage.

---

### B. Custom Twitch VOD Track Egress
Standard RTMP publication configurations in the Restreamer UI only map a single audio track. To forward *both* audio tracks (Track 1 for live, Track 2 for VOD) and tell Twitch to separate them, you must use a custom FFmpeg/Datarhei Core publication process.

This process explicitly:
1. Maps the video track (`0:v:0`).
2. Maps the primary live audio track (`0:a:0`).
3. Maps the VOD audio track (`0:a:1`).
4. Injects the `rtmp_twitch_vod_track=2` metadata flag into the FLV container metadata.

#### API Payload Configuration
The custom Datarhei Core process can be created by sending a `POST` request to `/api/v3/process` on your Restreamer server:

```json
{
  "id": "twitch-vod-publication",
  "autostart": true,
  "input": [
    {
      "address": "rtmp://127.0.0.1:1935/live/stream",
      "options": ["-listen", "0"]
    }
  ],
  "output": [
    {
      "address": "rtmp://live.twitch.tv/app/{YOUR_TWITCH_STREAM_KEY}",
      "options": [
        "-map", "0:v:0",
        "-map", "0:a:0",
        "-map", "0:a:1",
        "-c:v", "copy",
        "-c:a", "copy",
        "-metadata", "rtmp_twitch_vod_track=2",
        "-f", "flv"
      ]
    }
  ],
  "reconnect": true,
  "reconnect_delay_seconds": 5
}
```

We provide an automation script [setup_twitch_vod.ps1](file:///d:/restreamer/setup_twitch_vod.ps1) to configure this process automatically on your local Restreamer instance.
