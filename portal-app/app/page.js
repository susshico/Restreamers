'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const videoRef = useRef(null);

  // Stream state
  const [streamUrl, setStreamUrl] = useState('memfs/live.m3u8');
  const [fallbackHlsUrl, setFallbackHlsUrl] = useState('https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8');
  const [status, setStatus] = useState('CONNECTING'); // CONNECTING, LIVE, BUFFERING, BACKUP_ACTIVE, RECONNECTING
  const [sourceMode, setSourceMode] = useState('Primary');
  
  // Custom Settings
  const [backupImage, setBackupImage] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [failoverMode, setFailoverMode] = useState('image'); // image, youtube
  const [showSettings, setShowSettings] = useState(false);

  // Settings Temp Inputs
  const [tempYtUrl, setTempYtUrl] = useState('');
  const [tempMode, setTempMode] = useState('image');
  const [tempImage, setTempImage] = useState('');

  // Internal Logic Refs
  const hlsInstanceRef = useRef(null);
  const stallTimerRef = useRef(null);
  const probeIntervalRef = useRef(null);
  const isFallbackActiveRef = useRef(false);

  // Parse Stream Settings from URL Query Parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlStream = params.get('stream');
      const urlFallback = params.get('fallback');
      
      if (urlStream) setStreamUrl(urlStream);
      if (urlFallback) setFallbackHlsUrl(urlFallback);

      // Load Settings from LocalStorage
      const localImage = localStorage.getItem('susshico_backup_image') || '';
      const localYt = localStorage.getItem('susshico_yt_url') || '';
      const localMode = localStorage.getItem('susshico_failover_mode') || 'image';

      setBackupImage(localImage);
      setYtUrl(localYt);
      setFailoverMode(localMode);

      setTempImage(localImage);
      setTempYtUrl(localYt);
      setTempMode(localMode);
    }
  }, []);

  // Init/Re-init Video Player
  const initPlayer = (url, isFallback = false) => {
    isFallbackActiveRef.current = isFallback;
    clearStallTimer();
    stopProbe();

    if (isFallback) {
      setStatus('BACKUP_ACTIVE');
      setSourceMode('Fallback Mode');
    } else {
      setStatus('CONNECTING');
      setSourceMode('Primary Server');
    }

    console.log(`Loading HLS url: ${url}`);
    const video = videoRef.current;
    if (!video) return;

    // Destroy old Hls instance
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    // Load Hls.js dynamically to support Next.js SSR
    import('hls.js').then((HlsModule) => {
      const Hls = HlsModule.default;
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          manifestLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 1000,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 2,
        });

        hlsInstanceRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isFallbackActiveRef.current) {
            setStatus('LIVE');
            video.play().catch(err => console.log('Autoplay blocked:', err));
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal && !isFallbackActiveRef.current) {
            console.warn('Fatal HLS error, triggering failover.');
            triggerFailover();
          }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari player
        video.src = url;
        video.onloadedmetadata = () => {
          if (!isFallbackActiveRef.current) {
            setStatus('LIVE');
            video.play().catch(err => console.log('Autoplay blocked:', err));
          }
        };
        video.onerror = () => {
          if (!isFallbackActiveRef.current) {
            console.warn('Native video error, triggering failover.');
            triggerFailover();
          }
        };
      }
    });
  };

  // Start player on load
  useEffect(() => {
    initPlayer(streamUrl, false);
    return () => {
      if (hlsInstanceRef.current) hlsInstanceRef.current.destroy();
      clearStallTimer();
      stopProbe();
    };
  }, [streamUrl]);

  // Monitor Stall Timers
  const startStallTimer = () => {
    if (stallTimerRef.current) return;
    setStatus('BUFFERING');

    stallTimerRef.current = setTimeout(() => {
      console.warn('Playback stalled for 5s. Triggering failover.');
      triggerFailover();
    }, 5000);
  };

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  // Trigger Failover Mode
  const triggerFailover = () => {
    if (isFallbackActiveRef.current) return;
    isFallbackActiveRef.current = true;
    clearStallTimer();

    setStatus('RECONNECTING');
    setSourceMode('Reconnecting...');

    // Start background check loop to see when primary recovers
    startBackgroundProbe();
  };

  // Probe primary HLS stream in background
  const startBackgroundProbe = () => {
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);

    probeIntervalRef.current = setInterval(() => {
      console.log('Probing primary stream: ' + streamUrl);
      fetch(streamUrl, { method: 'HEAD', cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            console.log('Primary stream recovered!');
            stopProbe();
            initPlayer(streamUrl, false);
          }
        })
        .catch(() => {
          console.log('Primary stream still offline...');
        });
    }, 5000);
  };

  const stopProbe = () => {
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
  };

  // Parse YouTube video ID
  const getYouTubeId = (url) => {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : url;
  };

  // Settings Save
  const handleSaveSettings = () => {
    localStorage.setItem('susshico_yt_url', tempYtUrl);
    localStorage.setItem('susshico_failover_mode', tempMode);
    localStorage.setItem('susshico_backup_image', tempImage);

    setYtUrl(tempYtUrl);
    setFailoverMode(tempMode);
    setBackupImage(tempImage);

    setShowSettings(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTempImage(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setTempImage('');
  };

  // Render Status Badge Class
  const getStatusClass = () => {
    if (status === 'LIVE') return 'status-live';
    if (status === 'BACKUP_ACTIVE') return 'status-backup';
    return 'status-connecting';
  };

  const getStatusLabel = () => {
    if (status === 'LIVE') return 'LIVE';
    if (status === 'BACKUP_ACTIVE') return 'BACKUP ACTIVE';
    if (status === 'RECONNECTING') return 'RECONNECTING';
    if (status === 'BUFFERING') return 'BUFFERING';
    return 'CONNECTING';
  };

  const ytVideoId = getYouTubeId(ytUrl);
  const showBackupView = isFallbackActiveRef.current;

  return (
    <div className="portal-container">
      <div className="bg-grid"></div>
      <div className="glow-blob-1"></div>
      <div className="glow-blob-2"></div>

      <div className="portal-card">
        {/* Header section */}
        <header className="card-header">
          <div className="brand-section">
            <img className="brand-logo" src="/index_icon.svg" alt="Susshico Logo" onError={(e) => { e.target.src = 'favicon.ico'; }} />
            <div>
              <h1 className="brand-title">Susshico Portal</h1>
              <div className="brand-subtitle">Automated Restream Hub</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`status-badge ${getStatusClass()}`}>
              <span className="status-indicator"></span>
              <span>{getStatusLabel()}</span>
            </div>
            <button className="settings-btn" onClick={() => setShowSettings(true)} title="Stream failover settings">
              <svg viewBox="0 0 24 24">
                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Video Player wrapper */}
        <div className="player-wrapper">
          <video
            ref={videoRef}
            className="player-element"
            controls
            playsInline
            muted
            onWaiting={startStallTimer}
            onPlaying={clearStallTimer}
            onStalled={startStallTimer}
          ></video>

          {/* Failover Backup View Container */}
          {showBackupView && (
            <div className="backup-view-container active">
              {backupImage && failoverMode === 'image' && (
                <div
                  className="backup-image-view active"
                  style={{ backgroundImage: `url(${backupImage})` }}
                ></div>
              )}

              {/* YouTube Player component */}
              {ytVideoId && (
                <div className={`yt-player-wrapper ${failoverMode === 'youtube' ? 'active' : ''}`}>
                  <iframe
                    src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&loop=1&playlist=${ytVideoId}&controls=${failoverMode === 'youtube' ? '1' : '0'}&mute=0`}
                    allow="autoplay; encrypted-media"
                    title="Backup Stream Player"
                  ></iframe>
                </div>
              )}

              {/* Default stream failover if no custom settings */}
              {!backupImage && !ytVideoId && (
                <div className="backup-image-view active" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', color: 'var(--text-muted)' }}>
                  Playing Default Failover Stream...
                </div>
              )}
            </div>
          )}

          {/* Connecting Loading Spinner */}
          {(status === 'CONNECTING' || status === 'BUFFERING') && (
            <div className="player-overlay active">
              <div className="overlay-spinner"></div>
              <div className="overlay-title">{status === 'CONNECTING' ? 'Connecting to Stream...' : 'Buffering...'}</div>
              <div className="overlay-desc">Attempting to establish live connection with primary stream source.</div>
            </div>
          )}
        </div>

        {/* Details section */}
        <div className="stream-details">
          <div className="info-box">
            <h3>Live Stream Feed</h3>
            <p>Welcome to the custom mobile-friendly stream portal. This portal automatically detects stream dropouts or mobile network disconnects, failing over to your custom configurations in 5 seconds without user intervention.</p>
          </div>
          <div className="meta-box">
            <div className="meta-item">
              <span className="meta-label">Source Mode:</span>
              <span className="meta-value" style={{ color: showBackupView ? 'var(--accent-orange)' : 'var(--status-live)' }}>
                {sourceMode}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Twitch VOD Track:</span>
              <span className="meta-value">Enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-modal active">
          <div className="settings-modal-content">
            <div className="settings-modal-header">
              <h2>Failover Configuration</h2>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)}>&times;</button>
            </div>
            <div className="settings-modal-body">
              
              {/* Image Upload */}
              <div className="settings-field">
                <label>Custom Failover Image</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} />
                <div className="settings-help">Displayed during stream outages.</div>
                
                {tempImage && (
                  <div className="preview-container" style={{ display: 'flex' }}>
                    <div className="preview-image-wrapper">
                      <img src={tempImage} alt="Backup Preview" />
                      <span className="settings-help">Image uploaded</span>
                    </div>
                    <button className="remove-btn" onClick={handleRemoveImage}>Remove Image</button>
                  </div>
                )}
              </div>

              {/* YouTube URL */}
              <div className="settings-field">
                <label>Backup YouTube Video/Music</label>
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={tempYtUrl}
                  onChange={(e) => setTempYtUrl(e.target.value)}
                />
                <div className="settings-help">YouTube video or live stream to play on disconnect.</div>
              </div>

              {/* Failover Mode */}
              <div className="settings-field">
                <label>Display Mode</label>
                <select value={tempMode} onChange={(e) => setTempMode(e.target.value)}>
                  <option value="image">Show custom image (play YouTube audio in background)</option>
                  <option value="youtube">Show YouTube video directly (video + audio)</option>
                </select>
              </div>

            </div>
            <div className="settings-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
