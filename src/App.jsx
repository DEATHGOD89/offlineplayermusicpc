import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { 
  Search, 
  Plus, 
  Library, 
  FolderPlus, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Volume1, 
  Repeat, 
  Shuffle, 
  Sliders, 
  Heart, 
  Music, 
  Folder, 
  Settings, 
  Bell, 
  Trash2, 
  X, 
  Home, 
  ListMusic, 
  Menu, 
  CheckCircle, 
  Globe, 
  Activity,
  Flame,
  Zap,
  Target,
  Smile,
  Moon,
  Headphones,
  Compass,
  ChevronDown,
  Edit3,
  MoreHorizontal,
  RefreshCw
} from 'lucide-react';

import UploadModal from './components/UploadModal/UploadModal';
import { 
  getAllSongs, 
  saveSong, 
  saveSongs,
  deleteSong, 
  clearAllSongs,
  getAllPlaylists, 
  savePlaylist, 
  deletePlaylist,
  getAllBackgrounds,
  saveBackground,
  deleteBackground,
  clearAllLocalData
} from './services/db';
import { seedInitialSongsIfEmpty } from './services/seeder';
import {
  getCloudSongs,
  likeCloudSong,
  deleteCloudSong,
  isSupabaseConfigured,
  syncFilebaseVault
} from './services/supabase';

import './App.css';

// Generates a dynamic gradient from text hashcode for covers & playlist tiles
function generateCoverGradient(text) {
  if (!text) return 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 45) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 55%) 0%, hsl(${h2}, 80%, 45%) 100%)`;
}

// Safe prompt wrapper that never throws or blocks in webview / electron / restricted contexts
const safePrompt = (message, defaultValue = '') => {
  try {
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      return window.prompt(message, defaultValue);
    }
  } catch (e) {
    console.debug("safePrompt: window.prompt is not available", e);
  }
  return null;
};

// ==========================================================================
// AMPLIFY MOOD PRESETS FOR INTERACTIVE VIBE SELECTOR
// ==========================================================================
const MOOD_PRESETS = [
  { id: 'Chill', label: 'Chill', icon: Flame, keywords: ['chill', 'ambient', 'lo-fi', 'relax', 'calm', 'soft', 'acoustic'] },
  { id: 'Energetic', label: 'Energetic', icon: Zap, keywords: ['energy', 'energetic', 'rock', 'pop', 'dance', 'synthwave', 'fast', 'electronic'] },
  { id: 'Focus', label: 'Focus', icon: Target, keywords: ['focus', 'study', 'classical', 'piano', 'instrumental', 'ambient'] },
  { id: 'Nostalgic', label: 'Nostalgic', icon: Smile, keywords: ['nostalgic', 'retro', '80s', '90s', 'vintage', 'old', 'memory'] },
  { id: 'Atmospheric', label: 'Atmospheric', icon: Headphones, keywords: ['atmospheric', 'space', 'dark', 'deep', 'cinematic', 'drone'] },
  { id: 'Late Night', label: 'Late Night', icon: Moon, keywords: ['night', 'midnight', 'drive', 'neo-soul', 'jazz', 'r&b', 'dark'] },
];

// ==========================================================================
// COMPONENT: WaveformTimeline (Live Interactive Symmetric Audio Waveform)
// ==========================================================================
function WaveformTimeline({ analyser, isPlaying, currentTime, duration, onSeek, isDocumentVisible = true }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timeRef = useRef({ currentTime: 0, duration: 0 });

  timeRef.current.currentTime = currentTime;
  timeRef.current.duration = duration;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 300);
    let height = (canvas.height = 44);

    const handleResize = () => {
      if (canvas && canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
      }
    };
    window.addEventListener('resize', handleResize);

    const bufferLength = analyser?.current ? analyser.current.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isDocumentVisible) return;
      animRef.current = requestAnimationFrame(draw);

      if (analyser?.current && isPlaying) {
        analyser.current.getByteFrequencyData(dataArray);
      }

      ctx.clearRect(0, 0, width, height);

      const barCount = Math.min(80, Math.max(30, Math.floor(width / 6.5)));
      const barWidth = 2.5;
      const gap = (width - (barCount * barWidth)) / Math.max(1, (barCount - 1));
      const currT = timeRef.current.currentTime;
      const durT = timeRef.current.duration;
      const progress = durT > 0 ? currT / durT : 0;
      const playedBars = Math.floor(progress * barCount);

      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        let liveVal = 0;
        if (analyser?.current && isPlaying && dataArray.length > 0) {
          const dataIdx = Math.floor((i / barCount) * (bufferLength / 3));
          liveVal = dataArray[dataIdx] || 0;
        }

        const normalized = Math.sin((i / barCount) * Math.PI) * 0.65 + 0.35;
        const liveAmp = (liveVal / 255) * 0.55;
        const barHeight = Math.max(4, (normalized + liveAmp) * (height * 0.42));

        const isPlayed = i <= playedBars;
        ctx.fillStyle = isPlayed ? '#ffffff' : 'rgba(148, 163, 184, 0.28)';

        if (isPlayed) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
        } else {
          ctx.shadowBlur = 0;
        }

        const x = i * (barWidth + gap);
        ctx.beginPath();
        ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [analyser, isPlaying, isDocumentVisible]);

  const handleCanvasClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek({ target: { value: ratio * duration } });
  };

  return (
    <div className="audio-timeline-waveform-wrap" onClick={handleCanvasClick}>
      <canvas ref={canvasRef} className="audio-timeline-canvas" />
    </div>
  );
}

// ==========================================================================
// SYNCHRONOUS CACHE & UTILITY ENGINE: Eliminates image/audio flickering & visual lag
// ==========================================================================
const coverUrlCache = new Map();
const folderCollageCache = new Map();
const audioUrlCache = new Map();
const customBgUrlCache = new Map();

const formatTime = (secs) => {
  if (isNaN(secs) || secs === undefined || secs === null) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const getCoverUrl = (track) => {
  if (!track) return null;
  if (track.coverUrl) return track.coverUrl;
  if (track.cover_url) return track.cover_url;
  if (!track.coverBlob) return null;
  if (!coverUrlCache.has(track.id)) {
    coverUrlCache.set(track.id, URL.createObjectURL(track.coverBlob));
  }
  return coverUrlCache.get(track.id);
};

const getTrackAudioUrl = (track) => {
  if (!track) return null;
  if (track.audioBlob) {
    if (!audioUrlCache.has(track.id)) {
      audioUrlCache.set(track.id, URL.createObjectURL(track.audioBlob));
    }
    return audioUrlCache.get(track.id);
  }
  return track.url || null;
};

const getCustomBgUrl = (bg) => {
  if (!bg || !bg.blob) return null;
  if (!customBgUrlCache.has(bg.id)) {
    customBgUrlCache.set(bg.id, URL.createObjectURL(bg.blob));
  }
  return customBgUrlCache.get(bg.id);
};

const getFolderCovers = (folderName, songs) => {
  if (!folderCollageCache.has(folderName)) {
    const folderSongs = songs.filter(s => (s.album === folderName || (!s.album && folderName === 'Music Folder')));
    const coverBlobs = folderSongs.map(s => s.coverBlob).filter(Boolean).slice(0, 4);
    const urls = coverBlobs.map(blob => URL.createObjectURL(blob));
    folderCollageCache.set(folderName, urls);
  }
  return folderCollageCache.get(folderName);
};

const clearCoverCaches = () => {
  for (const url of coverUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  coverUrlCache.clear();
  
  for (const urls of folderCollageCache.values()) {
    urls.forEach(url => URL.revokeObjectURL(url));
  }
  folderCollageCache.clear();

  for (const url of audioUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  audioUrlCache.clear();

  for (const url of customBgUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  customBgUrlCache.clear();
};

const revokeTrackUrls = (trackId) => {
  if (coverUrlCache.has(trackId)) {
    const url = coverUrlCache.get(trackId);
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    coverUrlCache.delete(trackId);
  }
  if (audioUrlCache.has(trackId)) {
    const url = audioUrlCache.get(trackId);
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    audioUrlCache.delete(trackId);
  }
};


// ==========================================================================
// COMPONENT: TrackCover (Synchronous, zero-flicker, memory-leak-safe cover art)
// ==========================================================================
const TrackCover = memo(function TrackCover({ track, className = "", size = "small" }) {
  const url = getCoverUrl(track);

  if (url) {
    return (
      <img 
        src={url} 
        alt={track?.title || 'Track'} 
        className={className} 
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  const grad = track?.coverGradient || generateCoverGradient(track?.title || 'Track');
  return (
    <div 
      className={`${className} fallback-gradient`} 
      style={{ 
        background: grad, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: 'white' 
      }}
    >
      <Music size={size === "large" ? 34 : (size === "small" ? 18 : 22)} strokeWidth={2.2} style={{ opacity: 0.85 }} />
    </div>
  );
});

// ==========================================================================
// COMPONENT: TrackRow (High-performance memoized song row for 60/120fps list rendering)
// ==========================================================================
const TrackRow = memo(function TrackRow({
  song,
  idx,
  isCurrent,
  isPlaying,
  isMenuOpen,
  openUpward,
  onPlay,
  onToggleMenu,
  onToggleFavorite,
  onAddToPlaylist,
  onOpenDsp,
  onDelete
}) {
  return (
    <div 
      className={`amplify-track-row ${isCurrent ? 'active' : ''} ${isMenuOpen ? 'menu-open' : ''}`}
      onClick={onPlay}
    >
      {/* Index / Drag Handle */}
      <div className="amplify-track-handle">
        {idx < 2 ? (
          <span className="amplify-track-num">{idx + 1}.</span>
        ) : (
          <span className="amplify-track-drag">≡</span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="amplify-track-thumb">
        <TrackCover track={song} className="amplify-thumb-img" />
        {isCurrent && isPlaying && (
          <div className="amplify-thumb-playing-indicator">
            <span className="bar b1"></span>
            <span className="bar b2"></span>
            <span className="bar b3"></span>
          </div>
        )}
      </div>

      {/* Title & Artist */}
      <div className="amplify-track-meta">
        <span className="amplify-track-title truncate">{song.title}</span>
        <span className="amplify-track-artist truncate">{song.artist}</span>
      </div>

      {/* Duration */}
      <span className="amplify-track-duration">
        {formatTime(song.duration)}
      </span>

      {/* More actions menu */}
      <div className="amplify-track-menu-container">
        <button 
          type="button"
          className={`amplify-track-menu-btn ${isMenuOpen ? 'active' : ''}`}
          onClick={onToggleMenu}
          title="Track options"
        >
          <MoreHorizontal size={17} style={{ pointerEvents: 'none' }} />
        </button>

        {isMenuOpen && (
          <div className={`amplify-track-popover ${openUpward ? 'popover-up' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={onPlay}>
              <Play size={13} fill="currentColor" />
              <span>Play Now</span>
            </button>
            <button type="button" onClick={onToggleFavorite}>
              <Heart size={13} fill={song.isFavorite ? 'var(--primary)' : 'none'} color={song.isFavorite ? 'var(--primary)' : 'currentColor'} />
              <span>{song.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
            </button>
            <button type="button" onClick={onAddToPlaylist}>
              <Plus size={13} />
              <span>Add to Playlist...</span>
            </button>
            <button type="button" onClick={onOpenDsp}>
              <Sliders size={13} />
              <span>Cinematic DSP EQ</span>
            </button>
            <button type="button" className="delete-opt" onClick={onDelete}>
              <Trash2 size={13} />
              <span>Delete Track</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ==========================================================================
// COMPONENT: FolderCollage (Synchronous dynamic collage generator)
// ==========================================================================
function FolderCollage({ folderName, songs }) {
  const urls = getFolderCovers(folderName, songs);

  if (urls.length >= 4) {
    return (
      <div className="folder-collage grid-2x2">
        {urls.map((url, i) => <img key={i} src={url} alt="" className="collage-tile" />)}
      </div>
    );
  } else if (urls.length >= 2) {
    return (
      <div className="folder-collage grid-1x2">
        {urls.slice(0, 2).map((url, i) => <img key={i} src={url} alt="" className="collage-tile" />)}
      </div>
    );
  } else if (urls.length === 1) {
    return <img src={urls[0]} alt="" className="folder-collage-full" />;
  }

  const grad = generateCoverGradient(folderName);
  return (
    <div className="folder-collage-gradient" style={{ background: grad }}>
      <Folder size={28} className="text-white" />
    </div>
  );
}

const DEFAULT_BG_LIST = [
  { id: 'default-1', name: 'Toji (No Cursed Energy)', src: 'bg_toji.jpg', isDefault: true, isImage: true },
];

// ==========================================================================
// MAIN REACT WEB APPLICATION CONTAINER
// ==========================================================================
export default function App() {
  // --- ROTATING VIDEO BACKGROUND STATES ---
  const [bgVideoIndex, setBgVideoIndex] = useState(0);
  const [customBackgrounds, setCustomBackgrounds] = useState([]);
  const [hiddenDefaultBgs, setHiddenDefaultBgs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('spoty_hidden_default_bgs') || '[]');
    } catch { return []; }
  });
  const [bgMode, setBgMode] = useState(() => {
    return localStorage.getItem('spoty_bg_mode') || 'static';
  });
  const [activeBgId, setActiveBgId] = useState(() => {
    return localStorage.getItem('spoty_active_bg_id') || 'default-1';
  });
  const [bgRotateTime, setBgRotateTime] = useState(() => {
    return parseInt(localStorage.getItem('spoty_bg_rotate_time') || '30', 10);
  });

  // Derive the list of visible (non-hidden) default backgrounds
  const visibleDefaultBgs = DEFAULT_BG_LIST.filter(bg => !hiddenDefaultBgs.includes(bg.id));
  const visibleDefaultVideos = visibleDefaultBgs.map(bg => bg.src);

  useEffect(() => {
    if (bgMode !== 'rotate') return;
    if (visibleDefaultVideos.length === 0) return; // nothing to rotate
    const intervalMs = bgRotateTime * 1000;
    const interval = setInterval(() => {
      setBgVideoIndex((prev) => (prev + 1) % visibleDefaultVideos.length);
    }, intervalMs); // cycle background dynamically
    return () => clearInterval(interval);
  }, [bgMode, bgRotateTime, visibleDefaultVideos.length]);

  // --- BACKGROUND VIDEO STREAM RESOLVER ---
  const getActiveBackgroundSrc = () => {
    if (bgMode === 'disabled') {
      return '';
    }
    if (bgMode === 'rotate') {
      if (visibleDefaultVideos.length === 0) return '';
      return visibleDefaultVideos[bgVideoIndex % visibleDefaultVideos.length];
    }
    if (activeBgId.startsWith('default-')) {
      // Check if this default was hidden
      if (hiddenDefaultBgs.includes(activeBgId)) {
        // Fall back to first visible default or empty
        return visibleDefaultVideos.length > 0 ? visibleDefaultVideos[0] : '';
      }
      const match = DEFAULT_BG_LIST.find(b => b.id === activeBgId);
      return match ? match.src : '';
    }
    const matchCustom = customBackgrounds.find(b => b.id === activeBgId);
    if (matchCustom) {
      const url = getCustomBgUrl(matchCustom);
      return url || '';
    }
    return '';
  };

  const isActiveBackgroundAnImage = () => {
    if (bgMode === 'disabled') return false;
    if (bgMode === 'rotate') {
      const activeDefault = visibleDefaultBgs[bgVideoIndex % visibleDefaultBgs.length];
      return activeDefault ? !!activeDefault.isImage : false;
    }
    if (activeBgId.startsWith('default-')) {
      const match = DEFAULT_BG_LIST.find(b => b.id === activeBgId);
      return match ? !!match.isImage : false;
    }
    const matchCustom = customBackgrounds.find(b => b.id === activeBgId);
    return matchCustom ? !!matchCustom.isImage : false;
  };

  const handleSelectBackground = (id) => {
    setActiveBgId(id);
    localStorage.setItem('spoty_active_bg_id', id);
    setBgMode('static');
    localStorage.setItem('spoty_bg_mode', 'static');
    triggerNotification("Background locked!");
  };

  const handleUploadBackground = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      triggerNotification("File too large! Select a file < 20MB.", "error");
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      triggerNotification("Please upload a valid Image (PNG/JPG) or MP4 Video.", "error");
      return;
    }

    try {
      const bgData = {
        id: 'bg-custom-' + Date.now(),
        name: file.name.substring(0, 24) || 'Custom Background',
        blob: file,
        isImage: isImage,
        addedAt: Date.now()
      };

      await saveBackground(bgData);
      setCustomBackgrounds(prev => [bgData, ...prev]);

      setActiveBgId(bgData.id);
      localStorage.setItem('spoty_active_bg_id', bgData.id);
      setBgMode('static');
      localStorage.setItem('spoty_bg_mode', 'static');

      triggerNotification("Custom background applied!");
    } catch (err) {
      console.error(err);
      triggerNotification("Failed to save custom background.", "error");
    }
  };

  const handleDeleteBackground = async (id, e) => {
    e.stopPropagation();
    if (confirm("Delete this custom background permanently?")) {
      try {
        await deleteBackground(id);
        if (customBgUrlCache.has(id)) {
          URL.revokeObjectURL(customBgUrlCache.get(id));
          customBgUrlCache.delete(id);
        }
        setCustomBackgrounds(prev => prev.filter(b => b.id !== id));
        if (activeBgId === id) {
          setActiveBgId('default-1');
          localStorage.setItem('spoty_active_bg_id', 'default-1');
        }
        triggerNotification("Background video deleted.");
      } catch (err) {
        console.error(err);
        triggerNotification("Failed to delete background.", "error");
      }
    }
  };

  const handleDeleteDefaultBackground = (id, e) => {
    e.stopPropagation();
    if (confirm("Remove this default background video? You can restore it later.")) {
      const updated = [...hiddenDefaultBgs, id];
      setHiddenDefaultBgs(updated);
      localStorage.setItem('spoty_hidden_default_bgs', JSON.stringify(updated));
      setBgVideoIndex(0); // reset rotation index
      if (activeBgId === id) {
        // Switch to rotate mode if the active background was removed
        setBgMode('rotate');
        localStorage.setItem('spoty_bg_mode', 'rotate');
        setActiveBgId('default-1');
        localStorage.setItem('spoty_active_bg_id', 'default-1');
      }
      triggerNotification("Default background removed.");
    }
  };

  const handleRestoreAllDefaultBackgrounds = () => {
    setHiddenDefaultBgs([]);
    localStorage.setItem('spoty_hidden_default_bgs', JSON.stringify([]));
    setBgVideoIndex(0);
    triggerNotification("All default backgrounds restored!");
  };

  // --- CORE APPLICATION STATES ---
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('spoty_username') || '';
  });
  const [activeTheme, setActiveTheme] = useState(() => {
    const saved = localStorage.getItem('spoty_color_theme');
    if (saved && saved !== 'terracotta') {
      localStorage.setItem('spoty_color_theme', 'terracotta');
    }
    return 'terracotta';
  });
  
  // --- CLOUD ONLINE MODE STATES ---
  const [cloudSongs, setCloudSongs] = useState([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isSyncingVault, setIsSyncingVault] = useState(false);
  const [isCloudConfigured, setIsCloudConfigured] = useState(() => isSupabaseConfigured());

  const [sbUrl, setSbUrl] = useState(() => localStorage.getItem('spoty_supabase_url') || '');
  const [sbAnonKey, setSbAnonKey] = useState(() => localStorage.getItem('spoty_supabase_anon_key') || '');

  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playQueue, setPlayQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeView, setActiveView] = useState('home'); // 'home', 'library', 'favorites', 'playlists', 'folders', 'equalizer', 'settings'
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [selectedMood, setSelectedMood] = useState('All');
  const [selectedGenreDropdown, setSelectedGenreDropdown] = useState('All');
  const [activeTrackMenuId, setActiveTrackMenuId] = useState(null);
  const [currentSort, setCurrentSort] = useState('Recently Added');
  const [visualizerMode, setVisualizerMode] = useState('none'); // 'none', 'bars', 'circular', 'particles'
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);

  // --- MOBILE RESPONSIVE & BATTERY PERFORMANCE STATES ---
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  });
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    const handleVisibility = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Global click outside listener to close active track action menu
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.amplify-track-menu-container')) {
        setActiveTrackMenuId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  // --- BULK SELECTION STATES (SETTINGS LIBRARY MANAGER) ---
  const [selectedFolderNames, setSelectedFolderNames] = useState([]);
  const [selectedSongIds, setSelectedSongIds] = useState([]);
  const [songManagerSearch, setSongManagerSearch] = useState('');
  const [songManagerLimit, setSongManagerLimit] = useState(50);
  
  // --- NON-BLOCKING MODAL STATES ---
  const [playlistModal, setPlaylistModal] = useState({ isOpen: false, song: null, mode: 'add' });

  // --- COMPUTED PROPERTIES ---
  const listeningHours = Math.round(songs.reduce((acc, s) => acc + (s.duration || 0), 0) / 3600);

  const filteredManagerSongs = songs.filter(song => {
    if (!songManagerSearch.trim()) return true;
    const q = songManagerSearch.toLowerCase().trim();
    return song.title.toLowerCase().includes(q) || 
           song.artist.toLowerCase().includes(q) || 
           (song.album && song.album.toLowerCase().includes(q));
  });

  const displayedManagerSongs = filteredManagerSongs.slice(0, songManagerLimit);

  // Combined list of local offline songs and online cloud songs
  const allSongs = useMemo(() => {
    const cloudMap = new Map(cloudSongs.map(cs => [cs.id, cs]));
    
    // Process local songs: if they exist in cloud, merge cloud-authoritative fields (like coverUrl, url, likes)
    const mergedLocalSongs = songs.map(localSong => {
      const cloudSong = cloudMap.get(localSong.id);
      if (cloudSong) {
        return {
          ...localSong,
          // Cloud song takes precedence for coverUrl, url, likes since they are uploaded/stored in Supabase
          coverUrl: cloudSong.coverUrl || localSong.coverUrl,
          url: cloudSong.url || localSong.url,
          likes: cloudSong.likes !== undefined ? cloudSong.likes : localSong.likes,
          isCloud: true
        };
      }
      return localSong;
    });

    const localIds = new Set(songs.map(s => s.id));
    const uniqueCloudSongs = cloudSongs.filter(cs => !localIds.has(cs.id));

    return [...mergedLocalSongs, ...uniqueCloudSongs];
  }, [songs, cloudSongs]);

  const mergedCurrentTrack = useMemo(() => {
    if (!currentTrack) return null;
    return allSongs.find(s => s.id === currentTrack.id) || currentTrack;
  }, [currentTrack, allSongs]);

  // Cache for dynamic ambient colors to eliminate repeated canvas extraction
  const ambientColorCache = useRef(new Map());

  // Dynamic Ambient Glow Color extraction
  useEffect(() => {
    if (!mergedCurrentTrack) {
      document.documentElement.style.setProperty('--glow-color-a', 'var(--primary)');
      document.documentElement.style.setProperty('--glow-color-b', 'var(--secondary)');
      document.documentElement.style.setProperty('--glow-color-c', 'var(--primary-glow)');
      return;
    }

    const fallbackColors = () => {
      const text = mergedCurrentTrack.title;
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
      }
      const h1 = Math.abs(hash % 360);
      const h2 = (h1 + 45) % 360;
      const h3 = (h1 + 180) % 360;
      
      const cA = `hsl(${h1}, 70%, 55%)`;
      const cB = `hsl(${h2}, 80%, 45%)`;
      const cC = `hsl(${h3}, 65%, 50%)`;
      document.documentElement.style.setProperty('--glow-color-a', cA);
      document.documentElement.style.setProperty('--glow-color-b', cB);
      document.documentElement.style.setProperty('--glow-color-c', cC);
      return { cA, cB, cC };
    };

    // On mobile devices, always use fast hash-based colors to prevent GPU readback stall and jank!
    if (isMobile) {
      fallbackColors();
      return;
    }

    // Check cache
    if (ambientColorCache.current.has(mergedCurrentTrack.id)) {
      const { cA, cB, cC } = ambientColorCache.current.get(mergedCurrentTrack.id);
      document.documentElement.style.setProperty('--glow-color-a', cA);
      document.documentElement.style.setProperty('--glow-color-b', cB);
      document.documentElement.style.setProperty('--glow-color-c', cC);
      return;
    }

    let active = true;
    const url = getCoverUrl(mergedCurrentTrack);
    if (!url) {
      fallbackColors();
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 5;
        canvas.height = 5;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallbackColors();
          return;
        }
        ctx.drawImage(img, 0, 0, 5, 5);
        const data = ctx.getImageData(0, 0, 5, 5).data;
        
        const r1 = data[24], g1 = data[25], b1 = data[26];
        const r2 = data[48], g2 = data[49], b2 = data[50];
        const r3 = data[72], g3 = data[73], b3 = data[74];
        
        const cA = `rgb(${r1}, ${g1}, ${b1})`;
        const cB = `rgb(${r2}, ${g2}, ${b2})`;
        const cC = `rgb(${r3}, ${g3}, ${b3})`;

        ambientColorCache.current.set(mergedCurrentTrack.id, { cA, cB, cC });
        document.documentElement.style.setProperty('--glow-color-a', cA);
        document.documentElement.style.setProperty('--glow-color-b', cB);
        document.documentElement.style.setProperty('--glow-color-c', cC);
      } catch (err) {
        fallbackColors();
      }
    };
    img.onerror = () => {
      if (!active) return;
      fallbackColors();
    };
    img.src = url;

    return () => {
      active = false;
    };
  }, [mergedCurrentTrack, isMobile]);

  const handleToggleVisualizer = () => {
    const modes = ['none', 'bars', 'circular', 'particles'];
    const nextIdx = (modes.indexOf(visualizerMode) + 1) % modes.length;
    setVisualizerMode(modes[nextIdx]);
  };

  const handleToggleMiniPlayer = () => {
    const nextMini = !isMiniPlayer;
    if (window.electronAPI) {
      window.electronAPI.toggleMiniPlayer(nextMini);
    }
    setIsMiniPlayer(nextMini);
  };

  // --- DSP STATES ---
  const [eqGains, setEqGains] = useState([0,0,0,0,0,0,0,0,0,0]);
  const [bassProfile, setBassProfile] = useState('Home Theater');
  const [subwooferLevel, setSubwooferLevel] = useState(50);
  const [clarityLevel, setClarityLevel] = useState(50);
  const [volumeBoost, setVolumeBoost] = useState(1.0);

  // --- AUDIO CORE DOM ENDPOINTS ---
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);

  // --- DSP REFS & INIT ---
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const eqNodesRef = useRef([]);
  const subBassRef = useRef(null);
  const punchBassRef = useRef(null);
  const clarityRef = useRef(null);
  const vocalProtectRef = useRef(null);
  const limiterRef = useRef(null);
  const masterGainRef = useRef(null);
  const hasLoadedCloudRef = useRef(false);

  const initAudioContext = () => {
    if (!audioCtxRef.current && audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceNodeRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const nodes = freqs.map(freq => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.414;
        filter.gain.value = 0;
        return filter;
      });
      eqNodesRef.current = nodes;

      const subBass = ctx.createBiquadFilter();
      subBass.type = 'lowshelf';
      subBass.frequency.value = 40;
      subBassRef.current = subBass;

      const punchBass = ctx.createBiquadFilter();
      punchBass.type = 'peaking';
      punchBass.frequency.value = 120;
      punchBass.Q.value = 1.0;
      punchBassRef.current = punchBass;

      const vocalProtect = ctx.createBiquadFilter();
      vocalProtect.type = 'peaking';
      vocalProtect.frequency.value = 1500;
      vocalProtect.Q.value = 1.0;
      vocalProtectRef.current = vocalProtect;

      const clarity = ctx.createBiquadFilter();
      clarity.type = 'highshelf';
      clarity.frequency.value = 4000;
      clarityRef.current = clarity;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.0; // Prevent clipping
      limiter.knee.value = 0.0;
      limiter.ratio.value = 20.0;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.050;
      limiterRef.current = limiter;

      const masterGain = ctx.createGain();
      masterGain.value = 1.0;
      masterGainRef.current = masterGain;

      let curr = source;
      curr.connect(analyser);
      curr = analyser;

      nodes.forEach(n => {
        curr.connect(n);
        curr = n;
      });
      curr.connect(vocalProtect);
      vocalProtect.connect(clarity);
      clarity.connect(subBass);
      subBass.connect(punchBass);
      punchBass.connect(limiter);
      limiter.connect(masterGain);
      masterGain.connect(ctx.destination);
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const BASS_PROFILE_MAP = {
    'Studio Bass': { sub: 6, punch: 4 },
    'Home Theater': { sub: 16, punch: 10 },
    'Car Bass': { sub: 20, punch: 14 },
    'DJ Bass': { sub: 14, punch: 16 },
    'Cinema Bass': { sub: 18, punch: 12 },
    'Punjabi Bass': { sub: 18, punch: 16 },
    'Workout Bass': { sub: 16, punch: 18 }
  };

  useEffect(() => {
    const profile = BASS_PROFILE_MAP[bassProfile] || BASS_PROFILE_MAP['Home Theater'];
    const multiplier = subwooferLevel / 30.0;
    
    if (subBassRef.current) subBassRef.current.gain.value = profile.sub * multiplier;
    if (punchBassRef.current) punchBassRef.current.gain.value = profile.punch * multiplier;
    
    if (clarityRef.current) {
        clarityRef.current.gain.value = (clarityLevel / 100.0) * 12.0; 
    }
    
    if (vocalProtectRef.current) {
        vocalProtectRef.current.gain.value = (profile.sub * multiplier > 6) ? 2.0 : 0.0;
    }
    
    if (masterGainRef.current) {
        masterGainRef.current.gain.value = volumeBoost;
    }
  }, [bassProfile, subwooferLevel, clarityLevel, volumeBoost]);

  const handleEqChange = (idx, val) => {
    const newGains = [...eqGains];
    newGains[idx] = val;
    setEqGains(newGains);
    if (eqNodesRef.current[idx]) {
      eqNodesRef.current[idx].gain.value = val;
    }
  };

  const handleResetEq = () => {
    setEqGains([0,0,0,0,0,0,0,0,0,0]);
    eqNodesRef.current.forEach(n => n.gain.value = 0);
  };

  const loadLocalData = async () => {
    try {
      const localSongs = await getAllSongs();
      const localPlaylists = await getAllPlaylists();
      setSongs(localSongs);
      setPlaylists(localPlaylists);

      try {
        const localBgs = await getAllBackgrounds();
        setCustomBackgrounds(localBgs || []);
      } catch (e) {
        console.error('Failed to load custom backgrounds:', e);
      }

      // Extract folders dynamically from local songs
      const folderMap = {};
      localSongs.forEach((song) => {
        const folder = song.album || 'Music Folder';
        if (!folderMap[folder]) {
          folderMap[folder] = { name: folder, count: 0 };
        }
        folderMap[folder].count++;
      });
      setCategories(Object.values(folderMap));

      // Restore recently played
      const savedRecentSongs = localStorage.getItem('spoty_recent_songs');
      if (savedRecentSongs) {
        try {
          const parsed = JSON.parse(savedRecentSongs);
          setRecentlyPlayed(parsed);
        } catch (e) {
          console.error(e);
        }
      } else {
        // Fallback to legacy spoty_recent_ids
        const savedRecentIds = localStorage.getItem('spoty_recent_ids');
        if (savedRecentIds) {
          try {
            const ids = JSON.parse(savedRecentIds);
            const matched = ids.map(id => localSongs.find(s => s.id === id)).filter(Boolean);
            setRecentlyPlayed(matched);
          } catch (e) {
            console.error(e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load local DB:', err);
    }
  };

  // --- BOOTSTRAP INITIAL DATA ---
  useEffect(() => {
    async function setupApp() {
      await seedInitialSongsIfEmpty();
      await loadLocalData();

      // Customize Profile Username on first load
      let storedName = localStorage.getItem('spoty_username');
      if (!storedName) {
        let cleanName = 'Music Lover';
        const entered = safePrompt("Welcome to Spoty! Please enter your name to customize your profile:", "Music Lover");
        if (entered && entered.trim()) {
          cleanName = entered.trim();
        }
        localStorage.setItem('spoty_username', cleanName);
        setUserName(cleanName);
      }
    }
    setupApp();
    return () => {
      // Clear URL object caches on unmount to refresh assets and free memory
      clearCoverCaches();
    };
  }, []);

  // --- SYNCHRONIZE COLOR THEME ON HTML ROOT ---
  useEffect(() => {
    const rootEl = document.documentElement;
    // Remove existing themes
    rootEl.classList.remove('theme-terracotta', 'theme-black', 'theme-white', 'theme-green', 'theme-orange');
    // Add current theme
    rootEl.classList.add(`theme-${activeTheme}`);

    // Dynamically update browser's mobile navigation/header background theme color
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    const themeColors = {
      terracotta: '#150608',
      black: '#050505',
      white: '#eef1f6',
      green: '#040d0a',
      orange: '#0f0b07'
    };
    themeMeta.content = themeColors[activeTheme] || '#150608';
  }, [activeTheme]);

  // --- CLOUD ENGINE METHODS ---
  const loadCloudData = async () => {
    if (!isCloudConfigured) return;
    setIsLoadingCloud(true);
    try {
      const clSongs = await getCloudSongs();
      setCloudSongs(clSongs);
    } catch (err) {
      console.error("Error loading cloud library:", err);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const handleSyncVault = async () => {
    setIsSyncingVault(true);
    triggerNotification("Connecting to Filebase & indexing IPFS CIDs...", "info");
    try {
      const res = await syncFilebaseVault();
      triggerNotification(`Vault Synced! Updated ${res.supabaseSongsUpdated ?? res.totalFilebaseObjects} tracks with IPFS links. 🎉`);
      await loadCloudData();
    } catch (err) {
      triggerNotification(err.message || "Failed to sync vault.", "error");
    } finally {
      setIsSyncingVault(false);
    }
  };

  useEffect(() => {
    if (!isCloudConfigured) return;
    // Only load if not loaded yet, or when navigating to cloud view if empty
    if (hasLoadedCloudRef.current && activeView !== 'cloud') return;
    let isCurrent = true;
    (async () => {
      try {
        setIsLoadingCloud(true);
        const clSongs = await getCloudSongs();
        if (isCurrent) {
          setCloudSongs(clSongs);
          hasLoadedCloudRef.current = true;
        }
      } catch (err) {
        console.error("Error loading cloud library:", err);
      } finally {
        if (isCurrent) setIsLoadingCloud(false);
      }
    })();
    return () => { isCurrent = false; };
  }, [isCloudConfigured, activeView === 'cloud']);

  const handleLikeCloudSong = async (songId) => {
    try {
      await likeCloudSong(songId);
      // Update local state state to reflect like increment instantly
      setCloudSongs(prev => 
        prev.map(s => s.id === songId ? { ...s, likes: (s.likes || 0) + 1 } : s)
      );
      triggerNotification("Cloud track liked! ❤️");
    } catch (e) {
      console.error("Failed to like cloud song:", e);
    }
  };

  const handleDeleteCloudSong = async (songId, songTitle) => {
    if (!confirm(`Are you sure you want to permanently delete "${songTitle}" from the cloud library? This will also delete its files and free up your cloud storage.`)) {
      return;
    }
    try {
      await deleteCloudSong(songId);
      setCloudSongs(prev => prev.filter(s => s.id !== songId));
      triggerNotification("Cloud track deleted! 🗑️");
    } catch (e) {
      console.error("Failed to delete cloud song:", e);
      alert("Failed to delete track from cloud: " + e.message);
    }
  };

  const triggerNotification = (message, type = 'success') => {
    // Shorter professional notification message adjustments
    let cleanMsg = message;
    if (message === "Recently played list cleared.") {
      cleanMsg = "Recent History Cleared";
    } else if (message === "All liked songs removed from library.") {
      cleanMsg = "Cleared Liked Songs";
    } else if (message === "Added to Favorites!") {
      cleanMsg = "Added to Favorites ❤️";
    } else if (message === "Removed from Favorites.") {
      cleanMsg = "Removed from Favorites";
    } else if (message === "Playing all songs in random shuffle!") {
      cleanMsg = "Shuffle Enabled 🎵";
    } else if (message.includes("created!")) {
      cleanMsg = "Playlist Created ➕";
    } else if (message === "Removed from playlist.") {
      cleanMsg = "Removed from Playlist";
    } else if (message === "Added to playlist.") {
      cleanMsg = "Added to Playlist ➕";
    } else if (message === "Playlist deleted.") {
      cleanMsg = "Playlist Deleted 🗑";
    }

    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message: cleanMsg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 2200);
  };

  // --- PLAYBACK CONTROLLER ---
  const handlePlaySong = (track, newQueue = []) => {
    if (!track) return;
    if (track?.isCloud && typeof navigator !== 'undefined' && !navigator.onLine) {
      triggerNotification("Offline: Cloud streaming unavailable. Play local tracks!", "error");
      return;
    }

    // 1. Instant Synchronous Audio Start (Immediate Hardware Execution in Touch Context)
    const audioUrl = getTrackAudioUrl(track);
    if (audioRef.current && audioUrl) {
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
      }
      initAudioContext();
      audioRef.current.play().catch(e => console.log('Instant play error:', e));
    }

    setCurrentTrack(track);
    setIsPlaying(true);

    // 2. Offload localStorage I/O from the 16ms animation frame
    setTimeout(() => {
      setRecentlyPlayed(prev => {
        const filtered = prev.filter(s => s.id !== track.id);
        const updated = [track, ...filtered].slice(0, 10);
        try {
          localStorage.setItem('spoty_recent_ids', JSON.stringify(updated.map(s => s.id)));
          const cleanUpdated = updated.map(s => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            album: s.album,
            genre: s.genre,
            duration: s.duration,
            coverUrl: s.coverUrl,
            url: s.url,
            isCloud: s.isCloud,
            isFavorite: s.isFavorite,
            likes: s.likes,
            addedAt: s.addedAt
          }));
          localStorage.setItem('spoty_recent_songs', JSON.stringify(cleanUpdated));
        } catch (e) {
          console.warn("Storage sync failed:", e);
        }
        return updated;
      });
    }, 60);

    if (newQueue.length > 0) {
      setPlayQueue(newQueue);
      const index = newQueue.findIndex(s => s.id === track.id);
      setQueueIndex(index >= 0 ? index : 0);
    } else {
      setPlayQueue([track]);
      setQueueIndex(0);
    }
  };

  // Sync actual HTML5 Audio tag sources using unified state synchronizer
  useEffect(() => {
    if (!audioRef.current) return;
    const syncAudioPlayback = async () => {
      if (mergedCurrentTrack) {
        const url = getTrackAudioUrl(mergedCurrentTrack);
        if (url) {
          if (audioRef.current.src !== url) {
            audioRef.current.src = url;
          }
          if (isPlaying) {
            initAudioContext();
            try {
              if (audioRef.current.paused) {
                await audioRef.current.play();
              }
            } catch (e) {
              console.log('Playback sync error:', e);
            }
          } else {
            audioRef.current.pause();
          }
        }
      } else {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
    syncAudioPlayback();
  }, [mergedCurrentTrack, isPlaying]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Audio Events
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleAudioError = (e) => {
    const currentSrc = audioRef.current?.src || '';
    if (currentSrc.includes('/ipfs/')) {
      const match = currentSrc.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        const cid = match[1];
        if (currentSrc.includes('ipfs.filebase.io')) {
          console.warn("ipfs.filebase.io delay, switching to pinata gateway...");
          audioRef.current.src = `https://gateway.pinata.cloud/ipfs/${cid}`;
          audioRef.current.play().catch(() => {});
          return;
        } else if (currentSrc.includes('pinata')) {
          console.warn("pinata delay, switching to ipfs.io gateway...");
          audioRef.current.src = `https://ipfs.io/ipfs/${cid}`;
          audioRef.current.play().catch(() => {});
          return;
        }
      }
    }
    if (currentTrack?.isCloud) {
      triggerNotification(`Playback error on "${currentTrack.title}". Click "Sync Filebase Vault" to update!`, "error");
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleNext = () => {
    if (playQueue.length === 0) return;
    let nextIdx = queueIndex + 1;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * playQueue.length);
    } else if (nextIdx >= playQueue.length) {
      nextIdx = 0;
    }
    const nextTrack = playQueue[nextIdx];
    if (nextTrack) {
      const audioUrl = getTrackAudioUrl(nextTrack);
      if (audioRef.current && audioUrl) {
        if (audioRef.current.src !== audioUrl) audioRef.current.src = audioUrl;
        initAudioContext();
        audioRef.current.play().catch(e => console.log('Instant next play:', e));
      }
    }
    setQueueIndex(nextIdx);
    setCurrentTrack(nextTrack);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    if (playQueue.length === 0) return;
    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = playQueue.length - 1;
    }
    const prevTrack = playQueue[prevIdx];
    if (prevTrack) {
      const audioUrl = getTrackAudioUrl(prevTrack);
      if (audioRef.current && audioUrl) {
        if (audioRef.current.src !== audioUrl) audioRef.current.src = audioUrl;
        initAudioContext();
        audioRef.current.play().catch(e => console.log('Instant prev play:', e));
      }
    }
    setQueueIndex(prevIdx);
    setCurrentTrack(prevTrack);
    setIsPlaying(true);
  };

  const handleEnded = () => {
    if (isLooping) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log(e));
    } else {
      handleNext();
    }
  };

  // --- NATIVE MOBILE & DESKTOP MEDIA SESSION (LOCK SCREEN & BLUETOOTH CONTROLS) ---
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (mergedCurrentTrack) {
      const coverUrl = getCoverUrl(mergedCurrentTrack) || `${window.location.origin}/logo512.png`;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: mergedCurrentTrack.title || 'Untitled Track',
          artist: mergedCurrentTrack.artist || 'Spoty Artist',
          album: mergedCurrentTrack.album || 'Spoty Music',
          artwork: [
            { src: coverUrl, sizes: '96x96', type: 'image/png' },
            { src: coverUrl, sizes: '128x128', type: 'image/png' },
            { src: coverUrl, sizes: '192x192', type: 'image/png' },
            { src: coverUrl, sizes: '512x512', type: 'image/png' },
          ]
        });
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      } catch (e) {
        console.warn('MediaSession metadata error:', e);
      }
    } else {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  }, [mergedCurrentTrack, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const actionHandlers = [
      ['play', () => setIsPlaying(true)],
      ['pause', () => setIsPlaying(false)],
      ['previoustrack', () => handlePrev()],
      ['nexttrack', () => handleNext()],
      ['seekto', (details) => {
        if (details.seekTime !== undefined && audioRef.current) {
          audioRef.current.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      }],
      ['stop', () => {
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.currentTime = 0;
      }]
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
          /* ignore */
        }
    }

    return () => {
      for (const [action] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [playQueue, queueIndex, isShuffle]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration) return;
    try {
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: 1,
          position: Math.min(currentTime, duration)
        });
      }
    } catch {
          /* ignore */
        }
  }, [currentTime, duration]);

  // --- VISUALIZER ENGINE ---
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (activeView !== 'equalizer' || !analyserRef.current || !canvasRef.current || !isDocumentVisible) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationId;
    
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      ctx.fillStyle = '#150608'; // deep burgundy background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2.0; // scale down slightly for the 60px height
        const r = barHeight + (25 * (i/bufferLength)) + 140;
        const g = 46;
        const b = 62;
        
        ctx.fillStyle = `rgb(${r},${g},${b})`; // match terracotta theme
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [activeView, isPlaying]);

  // Save/Upload Folder callback (supports single song or batch songs array)
  const handleUploadTrack = async (songData) => {
    if (Array.isArray(songData)) {
      await saveSongs(songData);
    } else {
      await saveSong(songData);
    }
    await loadLocalData();
  };

  // --- PLAYLIST ACTIONS ---
  const handleCreatePlaylist = async (name) => {
    const pl = {
      id: 'pl-' + Date.now(),
      name: name,
      songIds: [],
      addedAt: Date.now()
    };
    await savePlaylist(pl);
    await loadLocalData();
    triggerNotification(`Playlist "${name}" created!`);
  };

  const handleAddSongToPlaylist = async (songId, plId) => {
    const pl = playlists.find(p => p.id === plId);
    if (!pl) return;
    let updatedIds;
    const currentSongIds = pl.songIds || [];
    if (currentSongIds.includes(songId)) {
      updatedIds = currentSongIds.filter(id => id !== songId);
      triggerNotification('Removed from playlist.');
    } else {
      updatedIds = [...currentSongIds, songId];
      triggerNotification('Added to playlist.');
    }
    await savePlaylist({ ...pl, songIds: updatedIds });
    await loadLocalData();
  };

  const handleToggleFavorite = async (song) => {
    try {
      const isNowFavorite = !song.isFavorite;
      const updatedSong = { ...song, isFavorite: isNowFavorite };
      await saveSong(updatedSong);
      if (currentTrack && currentTrack.id === song.id) {
        setCurrentTrack(updatedSong);
      }
      
      await loadLocalData();
      triggerNotification(isNowFavorite ? 'Added to Favorites!' : 'Removed from Favorites.');
    } catch (err) {
      console.error("Error toggling favorite:", err);
      triggerNotification("Favorites updated successfully!");
    }
  };

  const handleClearRecentlyPlayed = () => {
    if (confirm("Clear your recently played list?")) {
      setRecentlyPlayed([]);
      localStorage.removeItem('spoty_recent_ids');
      localStorage.removeItem('spoty_recent_songs');
      triggerNotification("Recently played list cleared.");
    }
  };

  const handleClearAllLikes = async () => {
    if (confirm("Are you sure you want to unlike all songs in your library?")) {
      const likedSongs = songs.filter(s => s.isFavorite);
      for (const song of likedSongs) {
        await saveSong({ ...song, isFavorite: false });
      }
      await loadLocalData();
      triggerNotification("All liked songs removed from library.");
    }
  };

  const handleAddSongToPlaylistCustom = (song) => {
    const activePlaylists = playlists || [];
    if (activePlaylists.length === 0) {
      const plName = safePrompt("You don't have any playlists yet.\nEnter new Playlist name to create one:");
      if (plName && plName.trim()) {
        handleCreatePlaylist(plName.trim());
      }
    } else {
      setPlaylistModal({ isOpen: true, song, mode: 'add' });
    }
  };

  const handlePlayRandom = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    handlePlaySong(shuffled[0], shuffled);
    setIsShuffle(true);
    triggerNotification("Playing all songs in random shuffle!");
  };

  // --- BULK LIBRARY SELECTION & DELETION HANDLERS ---
  const handleToggleFolderSelect = (folderName) => {
    setSelectedFolderNames(prev => 
      prev.includes(folderName) 
        ? prev.filter(f => f !== folderName) 
        : [...prev, folderName]
    );
  };

  const handleSelectAllFolders = (e) => {
    if (e.target.checked) {
      setSelectedFolderNames(categories.map(c => c.name));
    } else {
      setSelectedFolderNames([]);
    }
  };

  const handleDeleteSelectedFolders = async () => {
    if (selectedFolderNames.length === 0) return;
    if (confirm(`Are you sure you want to delete the ${selectedFolderNames.length} selected folders and all their songs permanently?`)) {
      const songsToDelete = songs.filter(s => selectedFolderNames.includes(s.album || 'Music Folder'));
      if (currentTrack && songsToDelete.some(s => s.id === currentTrack.id)) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      for (const song of songsToDelete) {
        revokeTrackUrls(song.id);
        await deleteSong(song.id);
      }
      setSelectedFolderNames([]);
      await loadLocalData();
      triggerNotification("Selected folders and songs deleted permanently.");
    }
  };

  const handleDeleteSingleFolder = async (folderName) => {
    if (confirm(`Are you sure you want to delete folder "${folderName}" and all its songs permanently?`)) {
      const songsToDelete = songs.filter(s => (s.album || 'Music Folder') === folderName);
      if (currentTrack && songsToDelete.some(s => s.id === currentTrack.id)) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      for (const song of songsToDelete) {
        revokeTrackUrls(song.id);
        await deleteSong(song.id);
      }
      setSelectedFolderNames(prev => prev.filter(f => f !== folderName));
      await loadLocalData();
      triggerNotification(`Folder "${folderName}" and its songs deleted permanently.`);
    }
  };

  const handleDeleteAllFolders = async () => {
    if (confirm("Are you sure you want to delete ALL folders and ALL songs permanently?")) {
      if (currentTrack && !currentTrack.isCloud) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      for (const song of songs) {
        revokeTrackUrls(song.id);
      }
      clearCoverCaches();
      await clearAllSongs();
      setSelectedFolderNames([]);
      setSelectedSongIds([]);
      await loadLocalData();
      triggerNotification("All folders and songs deleted successfully.");
    }
  };

  const handleDeleteAllSongs = async () => {
    if (confirm("Are you sure you want to delete ALL songs from your local library?")) {
      if (currentTrack && !currentTrack.isCloud) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      for (const song of songs) {
        revokeTrackUrls(song.id);
      }
      clearCoverCaches();
      await clearAllSongs();
      setSelectedSongIds([]);
      setSelectedFolderNames([]);
      await loadLocalData();
      triggerNotification("All local songs deleted successfully.");
    }
  };

  const handleToggleSongSelect = (songId) => {
    setSelectedSongIds(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId) 
        : [...prev, songId]
    );
  };

  const handleSelectAllSongs = (e) => {
    if (e.target.checked) {
      setSelectedSongIds(songs.map(s => s.id));
    } else {
      setSelectedSongIds([]);
    }
  };

  const handleDeleteSelectedSongs = async () => {
    if (selectedSongIds.length === 0) return;
    if (confirm(`Are you sure you want to delete the ${selectedSongIds.length} selected songs permanently?`)) {
      if (currentTrack && selectedSongIds.includes(currentTrack.id)) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      for (const id of selectedSongIds) {
        revokeTrackUrls(id);
        await deleteSong(id);
      }
      setSelectedSongIds([]);
      await loadLocalData();
      triggerNotification("Selected songs deleted permanently.");
    }
  };

  const handleDeleteSingleSong = async (songId, songTitle) => {
    if (confirm(`Are you sure you want to delete song "${songTitle}" permanently?`)) {
      if (currentTrack && currentTrack.id === songId) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      revokeTrackUrls(songId);
      await deleteSong(songId);
      setSelectedSongIds(prev => prev.filter(id => id !== songId));
      await loadLocalData();
      triggerNotification(`Song "${songTitle}" deleted permanently.`);
    }
  };

  // --- QUERY FILTERED LISTS ---
  const getSortedSongs = (songsList) => {
    const listCopy = [...songsList];
    if (currentSort === 'Date Added' || currentSort === 'Recently Added') {
      return listCopy.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
    if (currentSort === 'Title') {
      return listCopy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    if (currentSort === 'Favorites') {
      return listCopy.filter(s => s.isFavorite);
    }
    if (currentSort === 'Artists') {
      return listCopy.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    }
    if (currentSort === 'Albums') {
      return listCopy.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
    }
    return listCopy;
  };

  // Filters by search query, mood badges, and active filters
  const filteredSongs = useMemo(() => {
    return allSongs.filter((s) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query) || (s.genre && s.genre.toLowerCase().includes(query));
      if (!matchesSearch) return false;

      // Mood filtering from AMPLIFY Mood Selector
      if (selectedMood !== 'All') {
        const moodConfig = MOOD_PRESETS.find(m => m.id === selectedMood);
        if (moodConfig) {
          const textCorpus = `${s.title} ${s.artist} ${s.genre || ''} ${s.album || ''}`.toLowerCase();
          const matchesMood = moodConfig.keywords.some(k => textCorpus.includes(k));
          if (!matchesMood && allSongs.length > 5) return false;
        }
      }

      // Genre dropdown filtering
      if (selectedGenreDropdown !== 'All') {
        const g = (s.genre || '').toLowerCase();
        if (!g.includes(selectedGenreDropdown.toLowerCase())) return false;
      }

      return true;
    });
  }, [allSongs, searchQuery, selectedMood, selectedGenreDropdown]);

  const displaySongs = useMemo(() => {
    return getSortedSongs(filteredSongs);
  }, [filteredSongs, currentSort]);

  const totalPlaylistDuration = useMemo(() => {
    return displaySongs.reduce((acc, s) => acc + (s.duration || 0), 0);
  }, [displaySongs]);

  const likedSongsList = useMemo(() => {
    return allSongs.filter(s => s.isFavorite);
  }, [allSongs]);

  const librarySongs = useMemo(() => {
    return displaySongs.filter(s => s.isFavorite);
  }, [displaySongs]);

  // Sidebar navigations helper
  const navigateToView = useCallback((viewName) => {
    setActiveView(prev => {
      if (prev === viewName) return prev;
      return viewName;
    });
    setSelectedCategory(null);
    setActivePlaylistId(null);
  }, []);

  return (
    <>
      {getActiveBackgroundSrc() && (
        isActiveBackgroundAnImage() ? (
          <img 
            key={`${bgMode}-${activeBgId}-${bgMode === 'rotate' ? bgVideoIndex : ''}`}
            src={getActiveBackgroundSrc()} 
            className="background-image-layer" 
            alt="background"
            style={{ display: isDocumentVisible ? 'block' : 'none' }}
          />
        ) : (
          <video 
            key={`${bgMode}-${activeBgId}-${bgMode === 'rotate' ? bgVideoIndex : ''}`}
            autoPlay 
            loop 
            muted 
            playsInline
            className="background-video-layer"
            style={{ display: isDocumentVisible ? 'block' : 'none' }}
          >
            <source src={getActiveBackgroundSrc()} type="video/mp4" />
          </video>
        )
      )}

      {/* Real-time HTML5 Frequency Visualizer Canvas */}
      <AudioVisualizer 
        analyser={analyserRef} 
        mode={visualizerMode} 
        isDocumentVisible={isDocumentVisible}
        isMobile={isMobile}
      />

      <audio 
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleAudioError}
      />
      {/* Toast Stack (Fixed bottom-right above the player bar) */}
      <div className="toast-stack-container">
        {notifications.map((notif) => {
          let Icon = CheckCircle;
          let iconColor = 'var(--secondary)';
          
          if (notif.type === 'error') {
            Icon = X;
            iconColor = '#ef4444';
          } else if (notif.type === 'info') {
            Icon = Bell;
            iconColor = '#60a5fa';
          } else if (notif.message.includes('Favorites') || notif.message.includes('Favorite') || notif.message.includes('liked') || notif.message.includes('like')) {
            Icon = Heart;
            iconColor = 'var(--secondary)';
          } else if (notif.message.includes('Playlist') || notif.message.includes('playlist')) {
            Icon = Plus;
            iconColor = '#fbbf24';
          } else if (notif.message.includes('Shuffle') || notif.message.includes('shuffle') || notif.message.includes('random')) {
            Icon = Shuffle;
            iconColor = 'var(--accent)';
          } else if (notif.message.includes('Delete') || notif.message.includes('deleted') || notif.message.includes('wiped') || notif.message.includes('removed') || notif.message.includes('clear') || notif.message.includes('Clear')) {
            Icon = Trash2;
            iconColor = '#ef4444';
          }

          return (
            <div key={notif.id} className="premium-toast">
              <div className="toast-icon-wrapper" style={{ color: iconColor }}>
                <Icon size={14} fill={Icon === Heart ? iconColor : 'none'} />
              </div>
              <div className="toast-message">{notif.message}</div>
              <button 
                type="button"
                className="toast-close-btn" 
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className={`app-container ${isSidebarVisible ? '' : 'sidebar-collapsed'} ${isMiniPlayer ? 'mini-player-active' : ''}`}>

      {/* ==========================================================================
         AMPLIFY SIDEBAR: Liquid glass navigation, Mood selector, Genre filters
         ========================================================================== */}
      <aside className={`left-sidebar amplify-sidebar bento-panel ${isSidebarVisible ? '' : 'collapsed'}`}>
        {/* Brand Header */}
        <div className="amplify-brand-row">
          <div className="amplify-brand-left">
            <img src="/logo192.png" alt="AMPLIFY Logo" className="amplify-brand-logo-img" />
            <span className="amplify-brand-logo">AMPLIFY</span>
          </div>
          <button 
            type="button"
            className="amplify-search-btn" 
            onClick={() => {
              const el = document.getElementById('amplify-global-search');
              if (el) el.focus();
            }}
            title="Search Music"
          >
            <Search size={15} />
          </button>
        </div>

        {/* Primary Navigation Menu */}
        <nav className="amplify-nav-group">
          <button 
            className={`amplify-nav-item ${activeView === 'library' || activeView === 'favorites' ? 'active' : ''}`}
            onClick={() => navigateToView('library')}
          >
            <Library size={16} />
            <span>My Library</span>
          </button>
          <button 
            className={`amplify-nav-item ${activeView === 'home' ? 'active' : ''}`}
            onClick={() => navigateToView('home')}
          >
            <Compass size={16} />
            <span>Discover</span>
          </button>
          <button 
            className={`amplify-nav-item ${activeView === 'cloud' ? 'active' : ''}`}
            onClick={() => navigateToView('cloud')}
          >
            <Globe size={16} />
            <span>Curators</span>
            <span className="amplify-badge-live">CLOUD</span>
          </button>
          <button 
            className={`amplify-nav-item ${activeView === 'equalizer' ? 'active' : ''}`}
            onClick={() => navigateToView('equalizer')}
          >
            <Sliders size={16} />
            <span>Genres & DSP</span>
          </button>
          <button 
            className={`amplify-nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => navigateToView('settings')}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </nav>

        {/* MOOD SELECTOR (6 Circular Badges in 2-column Grid) */}
        <div className="amplify-sidebar-section">
          <div className="amplify-section-label">MOOD SELECTOR</div>
          <div className="amplify-mood-grid">
            {MOOD_PRESETS.map((m) => {
              const Icon = m.icon;
              const isSelected = selectedMood === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`amplify-mood-item ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedMood(prev => prev === m.id ? 'All' : m.id)}
                  title={`Filter by ${m.label} mood`}
                >
                  <div className="amplify-mood-badge">
                    <Icon size={17} />
                  </div>
                  <span className="amplify-mood-label">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* GENRE FILTERS (Pill Dropdown List) */}
        <div className="amplify-sidebar-section">
          <div className="amplify-section-label">GENRE FILTERS</div>
          <div className="amplify-genre-list">
            {['Ambient', 'Indie', 'Electronic', 'Lo-Fi', 'Neo-Soul', 'Pop'].map((genre) => {
              const isSelected = selectedGenreDropdown === genre;
              return (
                <button
                  key={genre}
                  type="button"
                  className={`amplify-genre-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedGenreDropdown(prev => prev === genre ? 'All' : genre)}
                >
                  <span>{genre}</span>
                  <ChevronDown size={14} className={`amplify-chevron ${isSelected ? 'rotated' : ''}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM-LEFT MINI ALBUM PREVIEW CARD */}
        <div 
          className="amplify-mini-album-card"
          onClick={() => {
            if (mergedCurrentTrack) handlePlaySong(mergedCurrentTrack, displaySongs);
          }}
          title={mergedCurrentTrack ? `Now Playing: ${mergedCurrentTrack.title}` : 'AMPLIFY Player'}
        >
          <div className="amplify-mini-cover">
            {mergedCurrentTrack ? (
              <TrackCover track={mergedCurrentTrack} className="folder-collage-full" />
            ) : (
              <div className="amplify-metallic-wave">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="fluid-wave-svg">
                  <path d="M0 60 Q 30 20, 60 70 T 100 40 L 100 100 L 0 100 Z" fill="url(#metallicGrad)" />
                  <defs>
                    <linearGradient id="metallicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#64748b" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#1e293b" stopOpacity="0.9" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            )}
          </div>
          <div className="amplify-mini-meta">
            <span className="amplify-mini-title truncate">
              {mergedCurrentTrack ? mergedCurrentTrack.title : 'Midnight Sun'}
            </span>
            <span className="amplify-mini-artist truncate">
              {mergedCurrentTrack ? mergedCurrentTrack.artist : 'Alina Baraz'}
            </span>
          </div>
        </div>
      </aside>

      {/* ==========================================================================
         MAIN CORE PANEL VIEWPORT
         ========================================================================== */}
      <main className="main-viewport">
        {/* Header containing search & settings */}
        <header className="bento-header">
          <div className="header-brand-group">
            <button 
              className="header-icon-btn toggle-sidebar-btn" 
              onClick={() => setIsSidebarVisible(!isSidebarVisible)}
              title={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
            >
              <Menu size={16} />
            </button>
            <img src="/logo192.png" alt="AMPLIFY Logo" className="header-brand-logo-img" />
            <h2 
              style={{ margin: 0, cursor: 'pointer' }}
              onClick={() => {
                const newName = safePrompt("Enter your profile name:", userName);
                if (newName && newName.trim()) {
                  const clean = newName.trim();
                  setUserName(clean);
                  localStorage.setItem('spoty_username', clean);
                  triggerNotification("Profile name updated!");
                }
              }}
              title="Click to edit profile name"
            >
              Good evening, {userName || 'User'}
            </h2>
          </div>
          
          <div className="bento-search-box">
            <Search className="search-icon text-muted" size={14} />
            <input 
              id="amplify-global-search"
              type="text" 
              placeholder="Search by title, artist, genre..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="header-action-row">
            {typeof window !== 'undefined' && window.electronAPI && (
              <button 
                className={`header-icon-btn ${isMiniPlayer ? 'active' : ''}`}
                onClick={handleToggleMiniPlayer}
                title={isMiniPlayer ? "Expand Window" : "Mini Player"}
              >
                <Sliders size={16} />
              </button>
            )}
            <button className="header-icon-btn"><Bell size={16} /></button>
            <button 
              className={`header-icon-btn ${activeView === 'settings' ? 'active' : ''}`}
              onClick={() => navigateToView('settings')}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Mood Tray */}
        {isMobile && (
          <div className="amplify-mobile-filter-tray">
            <div className="amplify-mobile-mood-scroll">
              {MOOD_PRESETS.map((m) => {
                const Icon = m.icon;
                const isSelected = selectedMood === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`amplify-mobile-mood-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedMood(prev => prev === m.id ? 'All' : m.id)}
                  >
                    <Icon size={12} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable contents grid depending on Active View */}
        {selectedCategory ? (
          /* ==========================================================
             FOLDER DETAIL SUB-SCREEN VIEW
             ========================================================== */
          <section className="folder-detail-view animate-fade-in bento-panel">
            <div className="folder-detail-header">
              <div className="folder-meta-left">
                <span className="folder-lbl">FOLDER CATEGORY</span>
                <h2>{selectedCategory}</h2>
                <p>{songs.filter(s => s.album === selectedCategory).length} tracks offline</p>
              </div>
              
              <div className="folder-meta-right">
                <button className="btn-secondary" onClick={() => setSelectedCategory(null)}>
                  Go Back
                </button>
                <button className="btn-primary" onClick={() => {
                  const folderSongs = songs.filter(s => s.album === selectedCategory);
                  if (folderSongs.length > 0) handlePlaySong(folderSongs[0], folderSongs);
                }}>
                  <Play size={14} fill="currentColor" />
                  <span>Play All</span>
                </button>
                <button className="btn-secondary btn-delete-all" onClick={async () => {
                  if (confirm(`Delete folder "${selectedCategory}" and all its songs permanently?`)) {
                    const folderSongs = songs.filter(s => s.album === selectedCategory);
                    for (const s of folderSongs) {
                      await deleteSong(s.id);
                    }
                    await loadLocalData();
                    setSelectedCategory(null);
                    triggerNotification(`Folder "${selectedCategory}" deleted permanently.`);
                  }
                }}>
                  Delete Folder
                </button>
              </div>
            </div>

            <div className="folder-songs-list">
              {songs.filter(s => s.album === selectedCategory).map((song, idx) => (
                <div 
                  key={song.id} 
                  className={`folder-song-row ${currentTrack && currentTrack.id === song.id ? 'active' : ''}`}
                  onClick={() => handlePlaySong(song, songs.filter(s => s.album === selectedCategory))}
                >
                  <span className="song-idx">{idx + 1}</span>
                  <div className="song-row-info">
                    <span className="song-row-title truncate">{song.title}</span>
                    <span className="song-row-artist truncate">{song.artist}</span>
                  </div>
                  <span className="song-row-duration">{formatTime(song.duration)}</span>
                  <button 
                    className="song-row-del-btn" 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Delete song "${song.title}" from library?`)) {
                        await deleteSong(song.id);
                        await loadLocalData();
                        
                        const remaining = songs.filter(s => s.album === selectedCategory && s.id !== song.id);
                        if (remaining.length === 0) {
                          setSelectedCategory(null);
                        }
                        triggerNotification(`Song deleted.`);
                      }
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : activeView === 'equalizer' ? (
          /* ==========================================================
             EQUALIZER DSP VIEW PANEL
             ========================================================== */
          <section className="equalizer-view animate-fade-in bento-panel" style={{ padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <span className="folder-lbl" style={{ color: 'var(--secondary)' }}>PREMIUM DSP ENGINE</span>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '4px', marginTop: '4px' }}>Cinematic Audio Processor</h2>
                <p style={{ color: 'var(--text-dark)', fontSize: '0.8rem' }}>Home theater quality bass, protected vocals, and distortion-free volume.</p>
              </div>
              <div style={{ width: '200px', height: '50px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#150608' }}>
                <canvas ref={canvasRef} width={200} height={50} style={{ width: '100%', height: '100%' }} />
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* BASS ENGINE */}
              <div className="bento-panel" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ marginBottom: '4px' }}>Subwoofer & Bass Engine</h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dark)', marginBottom: '12px' }}>Dynamic low-shelf & harmonic punch generator</p>
                
                <div style={{ marginBottom: '12px' }}>
                  <select 
                    value={bassProfile} 
                    onChange={(e) => setBassProfile(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', outline: 'none', fontSize: '0.8rem' }}
                  >
                    {['Studio Bass', 'Home Theater', 'Car Bass', 'DJ Bass', 'Cinema Bass', 'Punjabi Bass', 'Workout Bass'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.75rem', width: '50px', color: 'var(--text-dark)' }}>Intensity</span>
                  <input type="range" min="0" max="100" value={subwooferLevel} onChange={(e) => setSubwooferLevel(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.8rem', width: '30px' }}>{subwooferLevel}%</span>
                </div>
              </div>

              {/* VOLUME BOOST */}
              <div className="bento-panel" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ marginBottom: '4px' }}>Volume & Clarity Engine</h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dark)', marginBottom: '12px' }}>Limiter-protected boost & high-end presence</p>
                
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                  {[1.0, 1.25, 1.5, 1.75, 2.0].map(vol => (
                    <button 
                      key={vol} 
                      className={volumeBoost === vol ? 'btn-primary' : 'btn-secondary'} 
                      onClick={() => setVolumeBoost(vol)} 
                      style={{ flex: 1, padding: '6px 0', fontSize: '0.7rem', borderRadius: '8px', justifyContent: 'center' }}
                    >
                      {vol * 100}%
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.75rem', width: '50px', color: 'var(--text-dark)' }}>Clarity</span>
                  <input type="range" min="0" max="100" value={clarityLevel} onChange={(e) => setClarityLevel(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--secondary)' }} />
                  <span style={{ fontWeight: 'bold', color: 'var(--secondary)', fontSize: '0.8rem', width: '30px' }}>{clarityLevel}%</span>
                </div>
              </div>
            </div>

            <div className="bento-panel" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '1rem', margin: 0 }}>10-Band EQ Tuning</h4>
                <button className="btn-secondary" onClick={handleResetEq} style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '8px' }}>Reset Flat</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', height: '140px', alignItems: 'flex-end', paddingBottom: '12px' }}>
                {['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'].map((band, idx) => (
                  <div key={band} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10%' }}>
                    <span style={{ fontSize: '0.65rem', color: eqGains[idx] !== 0 ? 'var(--primary)' : 'var(--text-dark)', marginBottom: '4px', fontWeight: 'bold' }}>
                      {eqGains[idx] > 0 ? '+' : ''}{eqGains[idx].toFixed(1)}
                    </span>
                    <input 
                      type="range" 
                      min="-12" max="12" step="0.1" 
                      value={eqGains[idx]}
                      onChange={(e) => handleEqChange(idx, parseFloat(e.target.value))}
                      style={{ 
                        writingMode: 'vertical-lr', direction: 'rtl', width: '6px', height: '80px',
                        accentColor: eqGains[idx] !== 0 ? 'var(--primary)' : 'var(--text-dark)'
                      }} 
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dark)', marginTop: '8px', fontWeight: 'bold' }}>{band}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : activeView === 'cloud' ? (
          /* ==========================================================
             GLOBAL CLOUD PLAYLIST VIEW
             ========================================================== */
          <section className="home-viewport-scroll animate-fade-in">
            {!isCloudConfigured ? (
              // --- FORM: CONFIGURE SUPABASE ONLINE MODE ---
              <div className="bento-panel animate-slide-in" style={{ padding: '30px', maxWidth: '650px', margin: '20px auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--secondary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', color: 'white' }}>
                    <Globe size={28} />
                  </div>
                  <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '6px' }}>Configure Global Online Mode</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    Spoty is 100% serverless! You can configure your own private Supabase cloud project to upload and stream songs globally with friends. Enter your details below to activate.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Supabase Project URL</label>
                    <input 
                      type="text" 
                      value={sbUrl} 
                      onChange={(e) => setSbUrl(e.target.value.trim())}
                      placeholder="https://your-project.supabase.co"
                      style={{ padding: '10px 14px', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.8rem', outline: 'none' }}
                    />
                  </div>

                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Supabase Anonymous Key (Anon API Key)</label>
                    <input 
                      type="password" 
                      value={sbAnonKey} 
                      onChange={(e) => setSbAnonKey(e.target.value.trim())}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      style={{ padding: '10px 14px', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.8rem', outline: 'none' }}
                    />
                  </div>
                </div>

                <button 
                  className="btn-primary"
                  onClick={() => {
                    if (!sbUrl || !sbAnonKey) {
                      alert("Please fill in both the Supabase URL and Anonymous Key to connect!");
                      return;
                    }
                    localStorage.removeItem('spoty_supabase_disconnected');
                    localStorage.setItem('spoty_supabase_url', sbUrl);
                    localStorage.setItem('spoty_supabase_anon_key', sbAnonKey);
                    
                    setIsCloudConfigured(true);
                    triggerNotification("Supabase Online Mode connected! 🎉");
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <Globe size={18} />
                  <span>Connect & Activate Online Cloud</span>
                </button>
              </div>
            ) : (
              // --- LIVE ONLINE CLOUD DASHBOARD ---
              <div className="home-section-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <span className="home-sec-title">Global Cloud Library</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                      Streaming dynamically shared audio files uploaded by users globally via Supabase.
                    </p>
                  </div>
                </div>

                {/* DYNAMIC STORAGE CAPACITY BAR */}
                <div className="bento-panel animate-fade-in" style={{ 
                  padding: '14px 20px', 
                  marginBottom: '16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  gap: '20px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>☁️ Cloud Storage Capacity (4 GB Safe Vault)</span>
                      {cloudSongs.length >= 950 && (
                        <span style={{ 
                          fontSize: '0.65rem', 
                          padding: '2px 8px', 
                          background: cloudSongs.length >= 1000 ? 'rgba(255, 75, 75, 0.1)' : 'rgba(255, 165, 0, 0.1)', 
                          color: cloudSongs.length >= 1000 ? '#ff4b4b' : '#ffa500', 
                          borderRadius: '20px', 
                          fontWeight: 700 
                        }}>
                          {cloudSongs.length >= 1000 ? '🚨 FULL (4 GB CAP)' : '⚠️ ALMOST FULL'}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Using {cloudSongs.length} of 1,000 slots • <strong>{Math.max(0, 1000 - cloudSongs.length)} slots left</strong>
                    </span>
                  </div>

                  <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                      <div style={{ 
                        width: `${Math.min(100, (cloudSongs.length / 1000) * 100)}%`, 
                        height: '100%', 
                        background: cloudSongs.length >= 1000 ? 'linear-gradient(90deg, #ff4b4b, #ff7b7b)' : 'linear-gradient(90deg, var(--secondary), var(--accent))',
                        borderRadius: '10px',
                        transition: 'width 0.5s ease-in-out'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      <span>{Math.round(cloudSongs.length * 4)} MB Est. Used</span>
                      <span><strong>{Math.max(0, 4000 - Math.round(cloudSongs.length * 4))} MB Remaining</strong> (of 4,000MB / 4GB limit)</span>
                    </div>
                  </div>

                  <button
                    className="btn-secondary"
                    onClick={handleSyncVault}
                    disabled={isSyncingVault}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: isSyncingVault ? 'not-allowed' : 'pointer',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--text-main)',
                      transition: 'all 0.2s ease'
                    }}
                    title="Scan Filebase storage and link IPFS streaming URLs to all tracks"
                  >
                    <RefreshCw size={13} style={{ animation: isSyncingVault ? 'spin 1s linear infinite' : 'none' }} />
                    <span>{isSyncingVault ? 'Syncing IPFS...' : 'Sync Filebase Vault'}</span>
                  </button>
                </div>

                {isLoadingCloud ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>Syncing with Supabase...</span>
                  </div>
                ) : cloudSongs.length > 0 ? (
                  <div className="bento-panel" style={{ padding: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-dark)', height: '36px' }}>
                          <th style={{ paddingLeft: '12px' }}># Title</th>
                          <th>Album</th>
                          <th>Genre</th>
                          <th>Uploader</th>
                          <th style={{ textAlign: 'right', paddingRight: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cloudSongs.map((song) => {
                          const isCurrent = currentTrack && currentTrack.id === song.id;
                          const grad = generateCoverGradient(song.title);
                          return (
                            <tr 
                              key={song.id} 
                              className={`song-table-row ${isCurrent ? 'active' : ''}`}
                              style={{ 
                                height: '56px', 
                                borderBottom: '1px solid rgba(255,255,255,0.01)',
                                transition: 'var(--transition-smooth)',
                                borderRadius: '12px'
                              }}
                            >
                              <td style={{ paddingLeft: '12px', display: 'flex', alignItems: 'center', gap: '10px', height: '56px' }}>
                                <div style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                                  {song.coverUrl ? (
                                    <img src={song.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: '100%', height: '100%', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.75rem' }}>
                                      {song.title.substring(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <button 
                                    onClick={() => handlePlaySong(song, cloudSongs)}
                                    style={{ 
                                      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                                      background: 'rgba(0,0,0,0.6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                      opacity: isCurrent ? 1 : 0, transition: 'var(--transition-smooth)', cursor: 'pointer' 
                                    }}
                                    className="cloud-play-hover-btn"
                                  >
                                    {isCurrent && isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }} className="truncate">{song.title}</span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} className="truncate">{song.artist}</span>
                                </div>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }} className="truncate">{song.album}</td>
                              <td>
                                <span style={{ padding: '2px 8px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.65rem', color: 'var(--secondary)' }}>
                                  {song.genre}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>👤 {song.uploader}</td>
                              <td style={{ textAlign: 'right', paddingRight: '12px' }}>
                                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button 
                                      onClick={() => handleLikeCloudSong(song.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                      title="Like globally"
                                    >
                                      <Heart size={14} fill={song.likes > 0 ? "currentColor" : "none"} />
                                      <span>{song.likes || 0}</span>
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteCloudSong(song.id, song.title)}
                                      style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.8)', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                      title="Delete from Cloud"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bento-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Globe size={36} style={{ marginBottom: '8px', color: 'var(--text-dark)' }} />
                    <h4>Cloud Library is Empty</h4>
                    <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Click the "Upload MP3" button in sidebar and check the "Share with the world" toggle to upload the first track!</p>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : activeView === 'folders' ? (
          /* ==========================================================
             FOLDERS COLLAGE GRID VIEW
             ========================================================== */
          <section className="home-viewport-scroll animate-fade-in">
            <div className="home-section-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="home-sec-title">Smart Folder Categories</span>
                <button className="btn-primary" onClick={() => setIsUploadOpen(true)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  <FolderPlus size={14} /> Import Folder
                </button>
              </div>
              <div className="folders-collage-grid">
                {categories.map((cat) => (
                  <div 
                    key={cat.name} 
                    className="folder-collage-card"
                    onClick={() => setSelectedCategory(cat.name)}
                  >
                    <FolderCollage folderName={cat.name} songs={songs} />
                    <div className="folder-card-meta">
                      <h4 className="truncate">{cat.name}</h4>
                      <p>{cat.count} offline tracks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : activeView === 'playlists' ? (
          /* ==========================================================
             PLAYLISTS GRID VIEW
             ========================================================== */
          <section className="home-viewport-scroll animate-fade-in">
            <div className="home-section-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="home-sec-title">Custom Playlists</span>
                <button 
                  className="btn-primary" 
                  onClick={() => {
                    const name = safePrompt("Enter new Playlist name:");
                    if (name && name.trim()) handleCreatePlaylist(name.trim());
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  <Plus size={14} /> Create Playlist
                </button>
              </div>

              {activePlaylistId && playlists.find(p => p.id === activePlaylistId) ? (
                // Detailed view of selected playlist
                (() => {
                  const pl = playlists.find(p => p.id === activePlaylistId);
                  const plSongs = (pl.songIds || []).map(id => allSongs.find(s => s.id === id)).filter(Boolean);
                  
                  return (
                    <div className="bento-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ fontSize: '1.25rem' }}>{pl.name}</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{plSongs.length} songs saved</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-secondary" onClick={() => setActivePlaylistId(null)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                            Go Back
                          </button>
                          <button className="btn-primary" onClick={() => {
                            if (plSongs.length > 0) handlePlaySong(plSongs[0], plSongs);
                          }} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                            <Play size={14} fill="currentColor" /> Play Queue
                          </button>
                          <button className="btn-secondary" onClick={async () => {
                            if (confirm(`Delete playlist "${pl.name}" permanently?`)) {
                              await deletePlaylist(pl.id);
                              setActivePlaylistId(null);
                              await loadLocalData();
                              triggerNotification('Playlist deleted.');
                            }
                          }} style={{ color: '#ef4444' }}>
                            Delete Playlist
                          </button>
                        </div>
                      </div>

                      <div className="folder-songs-list">
                        {plSongs.map((song, i) => (
                          <div 
                            key={song.id}
                            className="folder-song-row"
                            onClick={() => handlePlaySong(song, plSongs)}
                          >
                            <span className="song-idx">{i + 1}</span>
                            <div className="song-row-info">
                              <span className="song-row-title truncate">{song.title}</span>
                              <span className="song-row-artist truncate">{song.artist}</span>
                            </div>
                            <button 
                              className="song-row-del-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddSongToPlaylist(song.id, pl.id);
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="folders-collage-grid">
                  {playlists.map((pl) => {
                    const plSongs = (pl.songIds || []).map(id => songs.find(s => s.id === id)).filter(Boolean);
                    const grad = generateCoverGradient(pl.name);
                    
                    return (
                      <div 
                        key={pl.id} 
                        className="folder-collage-card"
                        onClick={() => setActivePlaylistId(pl.id)}
                      >
                        <div className="folder-collage" style={{ background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ListMusic size={32} className="text-white" />
                        </div>
                        <div className="folder-card-meta">
                          <h4 className="truncate">{pl.name}</h4>
                          <p>{plSongs.length} tracks</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : activeView === 'settings' ? (
          /* ==========================================================
             SETTINGS PANEL VIEW
             ========================================================== */
          <section className="equalizer-view animate-fade-in bento-panel" style={{ padding: '24px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Application Configuration</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '20px' }}>Spoty is a 100% offline-first, local cached bento music player.</p>

            {/* Profile Settings */}
            <div className="bento-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Profile Configuration</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <input 
                  type="text" 
                  value={userName} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserName(val);
                    localStorage.setItem('spoty_username', val);
                  }}
                  placeholder="Enter your name..."
                  style={{ 
                    padding: '8px 12px', 
                    background: 'var(--bg-primary)', 
                    color: 'white', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '10px', 
                    outline: 'none',
                    fontSize: '0.85rem',
                    flex: 1
                  }}
                />
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    const newName = safePrompt("Enter your new profile name:", userName);
                    if (newName && newName.trim()) {
                      const clean = newName.trim();
                      setUserName(clean);
                      localStorage.setItem('spoty_username', clean);
                      triggerNotification("Profile name updated!");
                    }
                  }}
                  style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '10px', height: '36px' }}
                >
                  Change Name
                </button>
              </div>
            </div>

            {/* Theme Settings */}
            <div className="bento-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Accent & Color Theme</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Personalize the accent colors and dynamic ambient lighting of your interface.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {[
                  { id: 'terracotta', name: 'Terracotta Rose', color1: '#8e2e3e', color2: '#f3735d', desc: 'Warm Peach & Crimson' },
                ].map((t) => {
                  const isSelected = activeTheme === t.id;
                  return (
                    <div 
                      key={t.id}
                      onClick={() => {
                        setActiveTheme(t.id);
                        localStorage.setItem('spoty_color_theme', t.id);
                        triggerNotification(`Theme switched to ${t.name}!`);
                      }}
                      className={`compact-song-card ${isSelected ? 'active-bg-card' : ''}`}
                      style={{ 
                        padding: '12px', 
                        cursor: 'pointer', 
                        position: 'relative',
                        border: isSelected ? '1px solid var(--secondary)' : '1px solid transparent',
                        borderRadius: '16px',
                        background: 'var(--bg-primary)',
                        transition: 'var(--transition-smooth)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ 
                        height: '42px', 
                        borderRadius: '8px', 
                        background: `linear-gradient(135deg, ${t.color1} 0%, ${t.color2} 100%)`,
                        border: '1px solid var(--glass-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        padding: '6px'
                      }}>
                        {isSelected && <span style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '6px', color: 'white', fontWeight: 600 }}>ACTIVE</span>}
                      </div>
                      <div>
                        <h5 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>{t.name}</h5>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Background Video Customizer */}
            <div className="bento-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Cinematic Background Customizer</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Select a default cinematic atmosphere, cycle them, or upload your own MP4 video background.</p>
                </div>
                
                {/* Playback Mode Toggles */}
                <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '12px', border: '1px solid var(--glass-border)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button 
                    className={`filter-btn-pill ${bgMode === 'rotate' ? 'active' : ''}`}
                    onClick={() => {
                      setBgMode('rotate');
                      localStorage.setItem('spoty_bg_mode', 'rotate');
                      triggerNotification("Auto-rotation enabled!");
                    }}
                    style={{ padding: '6px 12px', fontSize: '0.72rem', borderRadius: '8px' }}
                  >
                    🔄 Auto-Rotate ({bgRotateTime >= 60 ? `${bgRotateTime / 60}m` : `${bgRotateTime}s`})
                  </button>
                  
                  {bgMode === 'rotate' && (
                    <select
                      value={bgRotateTime}
                      onChange={(e) => {
                        const secs = parseInt(e.target.value, 10);
                        setBgRotateTime(secs);
                        localStorage.setItem('spoty_bg_rotate_time', secs.toString());
                        triggerNotification(`Interval set to ${secs >= 60 ? `${secs/60}m` : `${secs}s`}`);
                      }}
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'white',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        padding: '4px 6px',
                        fontSize: '0.72rem',
                        outline: 'none',
                        cursor: 'pointer',
                        marginRight: '2px',
                        height: '26px'
                      }}
                      title="Set rotation speed"
                    >
                      <option value="10">10s</option>
                      <option value="30">30s</option>
                      <option value="60">1m</option>
                      <option value="300">5m</option>
                      <option value="600">10m</option>
                    </select>
                  )}

                  <button 
                    className={`filter-btn-pill ${bgMode === 'static' ? 'active' : ''}`}
                    onClick={() => {
                      setBgMode('static');
                      localStorage.setItem('spoty_bg_mode', 'static');
                      triggerNotification("Locked active background!");
                    }}
                    style={{ padding: '6px 12px', fontSize: '0.72rem', borderRadius: '8px' }}
                  >
                    🔒 Static Lock
                  </button>

                  <button 
                    className={`filter-btn-pill ${bgMode === 'disabled' ? 'active' : ''}`}
                    onClick={() => {
                      setBgMode('disabled');
                      localStorage.setItem('spoty_bg_mode', 'disabled');
                      triggerNotification("Video background disabled.");
                    }}
                    style={{ padding: '6px 12px', fontSize: '0.72rem', borderRadius: '8px' }}
                  >
                    🚫 Disable Video
                  </button>
                </div>
              </div>

              {/* Background Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginTop: '4px' }}>
                {/* Default Background Cards */}
                {visibleDefaultBgs.map((bg) => {
                  const isActive = activeBgId === bg.id && bgMode === 'static';
                  return (
                    <div 
                      key={bg.id}
                      onClick={() => handleSelectBackground(bg.id)}
                      className={`compact-song-card ${isActive ? 'active-bg-card' : ''}`}
                      style={{ 
                        padding: '10px', 
                        cursor: 'pointer', 
                        position: 'relative',
                        border: isActive ? '1px solid var(--secondary)' : '1px solid transparent',
                        borderRadius: '16px',
                        background: 'var(--bg-primary)',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      <div style={{ height: '70px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, var(--primary) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem', textAlign: 'center', padding: '6px' }}>
                        {bg.name}
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Default</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isActive && <span style={{ fontSize: '0.7rem' }}>✅</span>}
                          <button 
                            onClick={(e) => handleDeleteDefaultBackground(bg.id, e)}
                            style={{ background: 'none', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '2px' }}
                            title="Remove this default background"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Restore All Defaults Button (shown only when some are hidden) */}
                {hiddenDefaultBgs.length > 0 && (
                  <div 
                    onClick={handleRestoreAllDefaultBackgrounds}
                    className="compact-song-card"
                    style={{ 
                      padding: '10px', 
                      cursor: 'pointer', 
                      position: 'relative',
                      border: '1px dashed var(--secondary)',
                      borderRadius: '16px',
                      background: 'rgba(255,255,255,0.02)',
                      transition: 'var(--transition-smooth)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>🔄</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--secondary)', fontWeight: 600, textAlign: 'center' }}>Restore {hiddenDefaultBgs.length} Hidden</span>
                  </div>
                )}

                {/* Custom Background Cards */}
                {customBackgrounds.map((bg) => {
                  const isActive = activeBgId === bg.id && bgMode === 'static';
                  return (
                    <div 
                      key={bg.id}
                      onClick={() => handleSelectBackground(bg.id)}
                      className={`compact-song-card ${isActive ? 'active-bg-card' : ''}`}
                      style={{ 
                        padding: '10px', 
                        cursor: 'pointer', 
                        position: 'relative',
                        border: isActive ? '1px solid var(--secondary)' : '1px solid transparent',
                        borderRadius: '16px',
                        background: 'var(--bg-primary)',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      <div style={{ height: '70px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--secondary-glow) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem', textAlign: 'center', padding: '6px' }}>
                        {bg.name}
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--secondary)' }}>Custom</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isActive && <span style={{ fontSize: '0.7rem' }}>✅</span>}
                          <button 
                            onClick={(e) => handleDeleteBackground(bg.id, e)}
                            style={{ background: 'none', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '2px' }}
                            title="Delete custom background"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Upload Button Card */}
                <label 
                  style={{ 
                    height: '110px', 
                    borderRadius: '16px', 
                    border: '1px dashed var(--text-dark)', 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    cursor: 'pointer',
                    gap: '8px',
                    transition: 'var(--transition-smooth)',
                    background: 'rgba(255,255,255,0.02)'
                  }}
                  className="upload-bg-card-label"
                >
                  <Plus size={20} className="text-muted" />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Upload Image or MP4</span>
                  <input 
                    type="file" 
                    accept="image/*,video/mp4" 
                    onChange={handleUploadBackground} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>
            </div>

            <div className="bento-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Local Library Statistics</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', marginTop: '4px' }}>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>CRAWLED TRACKS</span>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--secondary)', marginTop: '4px' }}>{songs.length}</h3>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>FOLDERS SCANNED</span>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--accent)', marginTop: '4px' }}>{categories.length}</h3>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>LISTENING HOURS</span>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--primary)', marginTop: '4px' }}>{listeningHours}h</h3>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>RECENT HISTORY</span>
                  <h3 style={{ fontSize: '1.25rem', color: '#38bdf8', marginTop: '4px' }}>{recentlyPlayed.length}</h3>
                </div>
              </div>
            </div>

            {/* DUAL COLUMN INTERACTIVE LIBRARY MANAGER */}
            <div className="settings-manager-grid">
              {/* LEFT PANEL: FOLDER MANAGEMENT */}
              <div className="settings-manager-panel bento-panel">
                <div className="settings-manager-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      className="settings-checkbox"
                      checked={categories.length > 0 && selectedFolderNames.length === categories.length}
                      onChange={handleSelectAllFolders}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Folders ({categories.length})</span>
                  </div>
                  {selectedFolderNames.length > 0 && (
                    <button 
                      className="btn-delete-selected"
                      onClick={handleDeleteSelectedFolders}
                    >
                      Delete Selected ({selectedFolderNames.length})
                    </button>
                  )}
                </div>

                <div className="settings-list-scroll">
                  {categories.length > 0 ? (
                    categories.map((cat) => {
                      const isFolderSelected = selectedFolderNames.includes(cat.name);
                      return (
                        <div 
                          key={cat.name} 
                          className={`settings-list-item ${isFolderSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleFolderSelect(cat.name)}
                        >
                          <input 
                            type="checkbox" 
                            className="settings-checkbox"
                            checked={isFolderSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleFolderSelect(cat.name);
                            }}
                          />
                          <div className="settings-item-info">
                            <span className="settings-item-title truncate">{cat.name}</span>
                            <span className="settings-item-sub">{cat.count} tracks</span>
                          </div>
                          <button 
                            className="settings-item-del-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSingleFolder(cat.name);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dark)', fontSize: '0.75rem' }}>
                      No folders scanned.
                    </div>
                  )}
                </div>

                <div className="settings-manager-footer">
                  <button 
                    className="btn-danger-outline" 
                    onClick={handleDeleteAllFolders}
                    disabled={categories.length === 0}
                  >
                    Delete All Folders
                  </button>
                </div>
              </div>

              {/* RIGHT PANEL: SONG MANAGEMENT */}
              <div className="settings-manager-panel bento-panel">
                <div className="settings-manager-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      className="settings-checkbox"
                      checked={songs.length > 0 && selectedSongIds.length === songs.length}
                      onChange={handleSelectAllSongs}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Songs ({songs.length})</span>
                  </div>
                  {selectedSongIds.length > 0 && (
                    <button 
                      className="btn-delete-selected"
                      onClick={handleDeleteSelectedSongs}
                    >
                      Delete Selected ({selectedSongIds.length})
                    </button>
                  )}
                </div>

                {/* Search input for large library optimization */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)' }}>
                  <input 
                    type="text"
                    value={songManagerSearch}
                    onChange={(e) => {
                      setSongManagerSearch(e.target.value);
                      setSongManagerLimit(50); // Reset limit when searching
                    }}
                    placeholder="Search songs to manage..."
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '0.75rem'
                    }}
                  />
                </div>

                <div className="settings-list-scroll">
                  {displayedManagerSongs.length > 0 ? (
                    displayedManagerSongs.map((song) => {
                      const isSongSelected = selectedSongIds.includes(song.id);
                      return (
                        <div 
                          key={song.id} 
                          className={`settings-list-item ${isSongSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleSongSelect(song.id)}
                        >
                          <input 
                            type="checkbox" 
                            className="settings-checkbox"
                            checked={isSongSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSongSelect(song.id);
                            }}
                          />
                          <div className="settings-item-info">
                            <span className="settings-item-title truncate">{song.title}</span>
                            <span className="settings-item-sub truncate">{song.artist} | {song.album || 'Music Folder'}</span>
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginRight: '6px', whiteSpace: 'nowrap' }}>
                            {formatTime(song.duration)}
                          </span>
                          <button 
                            className="settings-item-del-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSingleSong(song.id, song.title);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dark)', fontSize: '0.75rem' }}>
                      {songs.length > 0 ? "No matching songs found." : "No songs in library."}
                    </div>
                  )}

                  {filteredManagerSongs.length > songManagerLimit && (
                    <div 
                      onClick={() => setSongManagerLimit(prev => prev + 100)}
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: 'var(--secondary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.02)',
                        borderTop: '1px solid var(--glass-border)',
                        transition: 'var(--transition-smooth)',
                        userSelect: 'none'
                      }}
                      className="load-more-songs-row"
                    >
                      Show More Songs (+{filteredManagerSongs.length - songManagerLimit})
                    </div>
                  )}
                </div>

                <div className="settings-manager-footer">
                  <button 
                    className="btn-danger-outline" 
                    onClick={handleDeleteAllSongs}
                    disabled={songs.length === 0}
                  >
                    Delete All Songs
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button className="btn-primary" onClick={() => setIsUploadOpen(true)}>
                <FolderPlus size={16} /> Import New Music Folder
              </button>
              <button 
                className="btn-secondary" 
                onClick={handleClearRecentlyPlayed}
                style={{ fontSize: '0.8rem' }}
              >
                Clear Recent History
              </button>
              <button 
                className="btn-secondary" 
                onClick={async () => {
                  if (confirm("Reset local database and clear all songs/playlists?")) {
                    clearCoverCaches();
                    await clearAllLocalData();
                    localStorage.clear();
                    await loadLocalData();
                    triggerNotification("Database successfully wiped.");
                  }
                }}
                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
              >
                Clear Database cache
              </button>
            </div>
          </section>
        ) : activeView === 'library' ? (
          /* ==========================================================
             LIKED SONGS VIEW: Focused Grid of Liked Songs
             ========================================================== */
          <section className="home-viewport-scroll animate-fade-in">
            <div className="home-section-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="home-sec-title" style={{ margin: 0 }}>Liked Songs</span>
                  <button 
                    className="btn-primary" 
                    onClick={() => {
                      if (librarySongs.length > 0) {
                        const shuffled = [...librarySongs].sort(() => Math.random() - 0.5);
                        handlePlaySong(shuffled[0], shuffled);
                        setIsShuffle(true);
                        triggerNotification("Playing liked songs in random shuffle!");
                      } else {
                        triggerNotification("No liked songs to play!", "error");
                      }
                    }} 
                    style={{ padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
                    title="Shuffle Play Liked Songs"
                  >
                    <Shuffle size={12} />
                    <span>Shuffle Play</span>
                  </button>
                  {librarySongs.length > 0 && (
                    <button 
                      className="btn-secondary" 
                      onClick={handleClearAllLikes}
                      style={{ padding: '4px 10px', fontSize: '0.7rem', borderRadius: '8px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                    >
                      Clear All Likes
                    </button>
                  )}
                </div>
                
                {/* Quick Sort Options */}
                <div className="header-action-row">
                  {['Recently Added', 'Artists', 'Albums'].map((sortType) => (
                    <button 
                      key={sortType}
                      className={`filter-btn-pill ${currentSort === sortType ? 'active' : ''}`}
                      onClick={() => setCurrentSort(sortType)}
                    >
                      {sortType}
                    </button>
                  ))}
                </div>
              </div>

              {librarySongs.length > 0 ? (
                <div className="songs-compact-grid">
                  {librarySongs.map((song) => (
                    <div 
                      key={song.id} 
                      className="compact-song-card"
                      onClick={() => handlePlaySong(song, librarySongs)}
                    >
                      <div className="card-artwork-box">
                        <TrackCover track={song} className="folder-collage-full" />
                        
                        <div className="card-hover-overlay">
                          <button 
                            className="card-overlay-btn play"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlaySong(song, librarySongs);
                            }}
                            title="Play Song"
                          >
                            <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />
                          </button>
                        </div>

                        <button 
                          className="card-delete-badge"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (song.isCloud) {
                              handleDeleteCloudSong(song.id, song.title);
                            } else {
                              handleDeleteSingleSong(song.id, song.title);
                            }
                          }}
                          title="Delete Song"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="card-details-box">
                        <span className="card-title truncate" title={song.title}>{song.title}</span>
                        <span className="card-artist truncate">{song.artist}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bento-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dark)' }}>
                  No liked songs in your library yet. Click the heart icon on any song on the Home page to add them here!
                </div>
              )}
            </div>
          </section>
        ) : activeView === 'favorites' ? (
          /* ==========================================================
             LIKED SONGS VIEW: Dedicated premium playlist view
             ========================================================== */
          <section className="folder-detail-view animate-fade-in bento-panel">
            <div className="folder-detail-header" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--bg-secondary) 100%)', padding: '24px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="folder-meta-left">
                <span className="folder-lbl" style={{ color: 'var(--secondary)' }}>OFFLINE COLLECTION</span>
                <h2 style={{ fontSize: '1.75rem', marginTop: '4px', marginBottom: '4px' }}>Liked Songs</h2>
                <p>{likedSongsList.length} favorite tracks</p>
              </div>
              
              <div className="folder-meta-right" style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-primary" onClick={() => {
                  if (likedSongsList.length > 0) handlePlaySong(likedSongsList[0], likedSongsList);
                }} disabled={likedSongsList.length === 0}>
                  <Play size={14} fill="currentColor" />
                  <span>Play Favorites</span>
                </button>
                <button className="btn-secondary" onClick={() => {
                  if (likedSongsList.length > 0) {
                    const shuffled = [...likedSongsList].sort(() => Math.random() - 0.5);
                    handlePlaySong(shuffled[0], shuffled);
                    setIsShuffle(true);
                  }
                }} disabled={likedSongsList.length === 0}>
                  <Shuffle size={14} />
                  <span>Shuffle</span>
                </button>
              </div>
            </div>

            <div className="folder-songs-list" style={{ marginTop: '20px' }}>
              {likedSongsList.length > 0 ? (
                likedSongsList.map((song, idx) => (
                  <div 
                    key={'liked-row-' + song.id} 
                    className="folder-song-row"
                    onClick={() => handlePlaySong(song, likedSongsList)}
                  >
                    <span className="song-idx">{idx + 1}</span>
                    <div className="song-row-info">
                      <span className="song-row-title truncate">{song.title}</span>
                      <span className="song-row-artist truncate">{song.artist} | {song.album || 'Single'}</span>
                    </div>
                    <span className="song-row-duration">{formatTime(song.duration)}</span>
                    <button 
                      className="song-row-del-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(song);
                      }}
                      title="Remove from Liked Songs"
                      style={{ color: 'var(--secondary)', opacity: 1 }}
                    >
                      <Heart size={12} fill="var(--secondary)" color="var(--secondary)" />
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dark)' }}>
                  You haven't liked any songs yet. Click the heart icon on any track to add it here!
                </div>
              )}
            </div>
          </section>
        ) : (
          /* ==========================================================================
             AMPLIFY DASHBOARD VIEW: Active Playlist Banner, Controls, Frosted Track Rows
             ========================================================================== */
          <section className="amplify-home-view animate-fade-in">
            {/* 1. ACTIVE PLAYLIST HERO BANNER */}
            <div className="amplify-playlist-banner">
              <div className="amplify-banner-meta">
                <span className="amplify-banner-tag">
                  {activePlaylistId ? 'PLAYLIST' : selectedCategory ? 'CATEGORY' : 'DISCOVER'}
                </span>
                <span className="amplify-banner-stats">
                  {activePlaylistId 
                    ? playlists.find(p => p.id === activePlaylistId)?.name || 'Playlist' 
                    : selectedCategory 
                      ? selectedCategory 
                      : 'All Tracks'} • {displaySongs.length} Tracks • {formatTime(totalPlaylistDuration)}
                </span>
                <h1 className="amplify-banner-title">
                  {activePlaylistId 
                    ? playlists.find(p => p.id === activePlaylistId)?.name 
                    : selectedCategory 
                      ? selectedCategory 
                      : 'Discover & Featured'}
                </h1>
                <p className="amplify-banner-subtitle">
                  {selectedMood !== 'All' ? `${selectedMood} Vibes • ` : ''}
                  {selectedGenreDropdown !== 'All' ? `${selectedGenreDropdown} • ` : ''}
                  Curated High-Fidelity Audio • Offline & Cloud
                </p>
                <div className="amplify-banner-actions">
                  <button 
                    type="button"
                    className="amplify-add-tracks-btn" 
                    onClick={() => setIsUploadOpen(true)}
                  >
                    <span>Add Tracks +</span>
                  </button>
                  {selectedMood !== 'All' && (
                    <button 
                      type="button"
                      className="amplify-clear-pill-btn" 
                      onClick={() => setSelectedMood('All')}
                    >
                      <span>Mood: {selectedMood} ✕</span>
                    </button>
                  )}
                  {selectedGenreDropdown !== 'All' && (
                    <button 
                      type="button"
                      className="amplify-clear-pill-btn" 
                      onClick={() => setSelectedGenreDropdown('All')}
                    >
                      <span>Genre: {selectedGenreDropdown} ✕</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Large Right Artwork Card */}
              <div className="amplify-banner-artwork-card">
                <div className="amplify-banner-artwork-inner">
                  {mergedCurrentTrack ? (
                    <TrackCover track={mergedCurrentTrack} className="folder-collage-full" />
                  ) : displaySongs.length > 0 ? (
                    <TrackCover track={displaySongs[0]} className="folder-collage-full" />
                  ) : (
                    <div className="amplify-metallic-hero-art">
                      <span className="amplify-hero-label">AMPLIFY<br/>MUSIC</span>
                      <svg viewBox="0 0 160 160" className="hero-wave-svg" preserveAspectRatio="none">
                        <path d="M0 110 C 40 60, 90 140, 160 80 L 160 160 L 0 160 Z" fill="url(#heroWaveGrad1)" />
                        <path d="M0 130 C 50 80, 100 150, 160 105 L 160 160 L 0 160 Z" fill="url(#heroWaveGrad2)" opacity="0.6" />
                        <defs>
                          <linearGradient id="heroWaveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.9" />
                            <stop offset="60%" stopColor="#64748b" stopOpacity="0.7" />
                            <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.95" />
                          </linearGradient>
                          <linearGradient id="heroWaveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.4" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  className="amplify-edit-cover-btn"
                  onClick={() => {
                    navigateToView('settings');
                    triggerNotification("Customize theme or background in Settings!");
                  }}
                >
                  Edit Cover
                </button>
              </div>
            </div>

            {/* 2. CONTROLS BAR */}
            <div className="amplify-controls-bar">
              <div className="amplify-controls-left">
                <button 
                  type="button"
                  className={`amplify-pill-btn ${isShuffle ? 'active' : ''}`}
                  onClick={handlePlayRandom}
                  title="Shuffle Play All Tracks"
                >
                  <Shuffle size={14} />
                  <span>Shuffle</span>
                </button>
                <button 
                  type="button"
                  className="amplify-pill-btn"
                  onClick={() => {
                    const newTitle = safePrompt("Enter custom playlist title:", (userName || 'My') + " Mix");
                    if (newTitle && newTitle.trim()) {
                      handleCreatePlaylist(newTitle.trim());
                    }
                  }}
                  title="Edit Playlist / Create New"
                >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>
              </div>

              <div className="amplify-controls-right">
                <div className="amplify-dropdown-wrapper">
                  <button 
                    type="button"
                    className="amplify-pill-btn dropdown"
                    onClick={() => {
                      const nextSort = currentSort === 'Recently Added' ? 'Title' : currentSort === 'Title' ? 'Artists' : 'Recently Added';
                      setCurrentSort(nextSort);
                    }}
                  >
                    <span>Custom</span>
                    <ChevronDown size={13} />
                  </button>
                </div>
                <button 
                  type="button"
                  className={`amplify-pill-btn ${currentSort === 'Date Added' || currentSort === 'Recently Added' ? 'active' : ''}`}
                  onClick={() => setCurrentSort('Recently Added')}
                  title="Sort by Date Added"
                >
                  <span>Date Added</span>
                  <span className="amplify-sort-arrows">⇅</span>
                </button>
                <button 
                  type="button"
                  className={`amplify-pill-btn ${currentSort === 'Title' ? 'active' : ''}`}
                  onClick={() => setCurrentSort('Title')}
                  title="Sort Alphabetically by Title"
                >
                  <span>Title</span>
                  <span className="amplify-sort-arrows">⇅</span>
                </button>
              </div>
            </div>

            {/* 3. FROSTED TRACK ROWS */}
            <div className="amplify-track-list">
              {displaySongs.length > 0 ? (
                displaySongs.map((song, idx) => (
                  <TrackRow 
                    key={song.id}
                    song={song}
                    idx={idx}
                    isCurrent={currentTrack && currentTrack.id === song.id}
                    isPlaying={isPlaying && currentTrack && currentTrack.id === song.id}
                    isMenuOpen={activeTrackMenuId === song.id}
                    openUpward={idx >= displaySongs.length - 3 && idx > 2}
                    onPlay={() => {
                      handlePlaySong(song, displaySongs);
                      setActiveTrackMenuId(null);
                    }}
                    onToggleMenu={(e) => {
                      e.stopPropagation();
                      setActiveTrackMenuId(prev => prev === song.id ? null : song.id);
                    }}
                    onToggleFavorite={() => {
                      handleToggleFavorite(song);
                      setActiveTrackMenuId(null);
                    }}
                    onAddToPlaylist={() => {
                      handleAddSongToPlaylistCustom(song);
                      setActiveTrackMenuId(null);
                    }}
                    onOpenDsp={() => {
                      navigateToView('equalizer');
                      setActiveTrackMenuId(null);
                    }}
                    onDelete={() => {
                      setActiveTrackMenuId(null);
                      if (song.isCloud) {
                        handleDeleteCloudSong(song.id, song.title);
                      } else {
                        handleDeleteSingleSong(song.id, song.title);
                      }
                    }}
                  />
                ))
              ) : (
                <div className="amplify-empty-state">
                  <Music size={38} className="empty-icon" />
                  <h3>No Tracks in this view</h3>
                  <p>Click "Add Tracks +" above or import a music folder to fill your library.</p>
                  <button type="button" className="amplify-add-tracks-btn" onClick={() => setIsUploadOpen(true)} style={{ marginTop: '12px' }}>
                    <span>Import Tracks Now</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==========================================================================
           AMPLIFY AUDIO TIMELINE: Liquid glass dock with real-time symmetric waveform
           ========================================================================== */}
        {mergedCurrentTrack && (
          <footer className="amplify-audio-dock animate-slide-in">
            {/* Timeline Header Row */}
            <div className="amplify-timeline-header">
              <div className="amplify-timeline-label">
                <span>AUDIO TIMELINE</span>
                <span className="amplify-timeline-now-playing truncate">
                  — {mergedCurrentTrack.title} • {mergedCurrentTrack.artist}
                </span>
              </div>
              <div className="amplify-timeline-icons">
                <button 
                  type="button"
                  className={`amplify-dock-icon-btn ${visualizerMode !== 'none' ? 'active' : ''}`}
                  onClick={handleToggleVisualizer}
                  title="Toggle Frequency Audio Visualizer"
                >
                  <Activity size={14} />
                </button>
                <button 
                  type="button"
                  className={`amplify-dock-icon-btn ${activeView === 'equalizer' ? 'active' : ''}`}
                  onClick={() => navigateToView('equalizer')}
                  title="Studio DSP Equalizer"
                >
                  <Sliders size={14} />
                </button>
                <button 
                  type="button"
                  className={`amplify-dock-icon-btn ${activeView === 'playlists' ? 'active' : ''}`}
                  onClick={() => navigateToView('playlists')}
                  title="Playlists & Queue"
                >
                  <ListMusic size={14} />
                </button>
              </div>
            </div>

            {/* Real-time Symmetric Waveform Scrubber */}
            <WaveformTimeline 
              analyser={analyserRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              isDocumentVisible={isDocumentVisible}
            />

            {/* Player Controls Row */}
            <div className="amplify-timeline-controls">
              {/* Left: Time display */}
              <div className="amplify-dock-time">
                <span className="curr">{formatTime(currentTime)}</span>
                <span className="sep">&nbsp;&nbsp;</span>
                <span className="total">{formatTime(duration)}</span>
              </div>

              {/* Center: Main Media Buttons */}
              <div className="amplify-dock-media-btns">
                <button 
                  type="button"
                  className={`amplify-media-btn ${isShuffle ? 'active' : ''}`}
                  onClick={() => {
                    const nextShuffle = !isShuffle;
                    setIsShuffle(nextShuffle);
                    triggerNotification(nextShuffle ? "Shuffle enabled" : "Shuffle disabled");
                  }}
                  title={isShuffle ? "Disable Shuffle" : "Enable Shuffle"}
                >
                  <Shuffle size={15} />
                </button>
                <button 
                  type="button"
                  className="amplify-media-btn" 
                  onClick={handlePrev}
                  title="Previous Track"
                >
                  <SkipBack size={17} fill="currentColor" />
                </button>
                <button 
                  type="button"
                  className="amplify-media-play-circle" 
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" style={{ marginLeft: '2px' }} />
                  )}
                </button>
                <button 
                  type="button"
                  className="amplify-media-btn" 
                  onClick={handleNext}
                  title="Next Track"
                >
                  <SkipForward size={17} fill="currentColor" />
                </button>
                <button 
                  type="button"
                  className={`amplify-media-btn ${isLooping ? 'active' : ''}`}
                  onClick={() => {
                    const nextLoop = !isLooping;
                    setIsLooping(nextLoop);
                    triggerNotification(nextLoop ? "Repeat enabled" : "Repeat disabled");
                  }}
                  title={isLooping ? "Disable Repeat" : "Enable Repeat"}
                >
                  <Repeat size={15} />
                </button>
              </div>

              {/* Right: Volume Slider */}
              <div className="amplify-dock-volume">
                <button 
                  type="button"
                  className="amplify-dock-vol-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? <VolumeX size={15} /> : volume < 0.3 ? <Volume1 size={15} /> : <Volume2 size={15} />}
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="amplify-volume-slider"
                />
              </div>
            </div>
          </footer>
        )}
      </main>

      {/* ==========================================================================
         MOBILE BOTTOM NAVIGATION BAR (Native Spotify / Apple Music PWA style)
         ========================================================================== */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button 
          className={`mobile-nav-item ${activeView === 'home' ? 'active' : ''}`}
          onClick={() => navigateToView('home')}
          aria-label="Home"
        >
          <Home size={19} />
          <span>Home</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeView === 'cloud' ? 'active' : ''}`}
          onClick={() => navigateToView('cloud')}
          aria-label="Cloud"
        >
          <Globe size={19} />
          <span>Cloud</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeView === 'library' ? 'active' : ''}`}
          onClick={() => navigateToView('library')}
          aria-label="Liked Songs"
        >
          <Heart size={19} />
          <span>Liked</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeView === 'folders' || activeView === 'playlists' ? 'active' : ''}`}
          onClick={() => navigateToView('folders')}
          aria-label="Folders"
        >
          <Folder size={19} />
          <span>Library</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeView === 'equalizer' ? 'active' : ''}`}
          onClick={() => navigateToView('equalizer')}
          aria-label="Equalizer"
        >
          <Sliders size={19} />
          <span>DSP</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => navigateToView('settings')}
          aria-label="Settings"
        >
          <Settings size={19} />
          <span>Settings</span>
        </button>
      </nav>
    </div>

      {/* --- ADD DIRECTORIES BULK MODAL --- */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadTrack}
        isCloudConfigured={isCloudConfigured}
        uploaderName={userName}
      />

      {/* --- PREMIUM PLAYLIST SELECTOR MODAL --- */}
      {playlistModal.isOpen && playlistModal.song && (
        <div 
          className="modal-backdrop animate-fade-in" 
          onClick={() => setPlaylistModal({ isOpen: false, song: null, mode: 'add' })}
        >
          <div 
            className="modal-content glass-panel animate-slide-in" 
            style={{ maxWidth: '440px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ListMusic size={22} color="var(--secondary)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Add to Playlist</h3>
              </div>
              <button 
                className="close-btn" 
                onClick={() => setPlaylistModal({ isOpen: false, song: null, mode: 'add' })}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Song Info Card */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '10px 12px', 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: '12px', 
              border: '1px solid var(--glass-border)',
              marginBottom: '18px'
            }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                <TrackCover track={playlistModal.song} className="folder-collage-full" />
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <h4 className="truncate" style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>{playlistModal.song.title}</h4>
                <p className="truncate" style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{playlistModal.song.artist}</p>
              </div>
            </div>

            {/* Create New Playlist Inline Form */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="Create new playlist..." 
                id="quick-playlist-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    const name = e.target.value.trim();
                    handleCreatePlaylist(name);
                    e.target.value = '';
                  }
                }}
                style={{ 
                  flex: 1, 
                  padding: '8px 12px', 
                  borderRadius: '10px', 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--glass-border)', 
                  color: 'var(--text-main)', 
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              <button 
                className="btn-primary" 
                type="button"
                onClick={() => {
                  const input = document.getElementById('quick-playlist-input');
                  if (input && input.value.trim()) {
                    handleCreatePlaylist(input.value.trim());
                    input.value = '';
                  }
                }}
                style={{ padding: '8px 14px', fontSize: '0.78rem', borderRadius: '10px' }}
              >
                <Plus size={14} /> Create
              </button>
            </div>

            {/* Playlists List */}
            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {playlists.length > 0 ? (
                playlists.map((pl) => {
                  const isIncluded = (pl.songIds || []).includes(playlistModal.song.id);
                  return (
                    <div 
                      key={pl.id}
                      onClick={() => handleAddSongToPlaylist(playlistModal.song.id, pl.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: isIncluded ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255,255,255,0.02)',
                        border: isIncluded ? '1px solid var(--secondary)' : '1px solid var(--glass-border)',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                      className="playlist-modal-item"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ListMusic size={16} color={isIncluded ? 'var(--secondary)' : 'var(--text-muted)'} />
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{pl.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(pl.songIds || []).length} songs</div>
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        color: isIncluded ? 'var(--secondary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {isIncluded ? <><CheckCircle size={14} /> Added</> : <><Plus size={14} /> Add</>}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No playlists created yet. Use the field above to make your first playlist!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================================================
// COMPONENT: AudioVisualizer (High-performance React/Canvas Audio Visualizer)
// ==========================================================================
function AudioVisualizer({ analyser, mode, isDocumentVisible = true, isMobile = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles = [];
    const maxParticles = isMobile ? 35 : 70;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const initParticles = () => {
      particles = [];
      for (let i = 0; i < maxParticles; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: Math.random() * 3 + 1,
          speedX: Math.random() * 0.8 - 0.4,
          speedY: Math.random() * 0.8 - 0.4,
          baseAlpha: Math.random() * 0.4 + 0.15
        });
      }
    };
    initParticles();

    const draw = () => {
      if (mode === 'none' || !isDocumentVisible) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      animationRef.current = requestAnimationFrame(draw);

      const bufferLength = analyser?.current ? analyser.current.frequencyBinCount : 0;
      const dataArray = new Uint8Array(bufferLength);
      if (analyser?.current) {
        analyser.current.getByteFrequencyData(dataArray);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const style = getComputedStyle(document.documentElement);
      const colorA = style.getPropertyValue('--glow-color-a').trim() || 'hsl(270, 70%, 55%)';
      const colorB = style.getPropertyValue('--glow-color-b').trim() || 'hsl(330, 80%, 45%)';

      if (mode === 'bars') {
        const barWidth = (canvas.width / 60);
        let barHeight;
        let x = 0;

        for (let i = 0; i < 60; i++) {
          const val = dataArray[Math.floor(i * (bufferLength / 80))] || 0;
          barHeight = (val / 255) * (canvas.height * 0.32);

          const grad = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
          grad.addColorStop(0, colorB);
          grad.addColorStop(1, colorA);

          ctx.fillStyle = grad;
          ctx.shadowBlur = 10;
          ctx.shadowColor = colorB;

          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth - 4, barHeight, [8, 8, 0, 0]);
          ctx.fill();

          ctx.shadowBlur = 0;
          x += barWidth;
        }
      } else if (mode === 'circular') {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        let bassSum = 0;
        for (let i = 0; i < 8; i++) {
          bassSum += dataArray[i] || 0;
        }
        const bassAvg = bassSum / 8;
        const pulse = 1 + (bassAvg / 255) * 0.16;

        const baseRadius = Math.min(canvas.width, canvas.height) * 0.14;
        const radius = baseRadius * pulse;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = colorB;
        ctx.lineWidth = 5;
        ctx.shadowBlur = 25;
        ctx.shadowColor = colorB;
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.beginPath();
        for (let i = 0; i < 100; i++) {
          const angle = (i / 100) * Math.PI * 2;
          const val = dataArray[Math.floor(i * (bufferLength / 150))] || 0;
          const offset = (val / 255) * 40;
          const r = radius + offset;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.strokeStyle = colorA;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (mode === 'particles') {
        particles.forEach((p, idx) => {
          const freqVal = dataArray[idx % Math.min(bufferLength, maxParticles)] || 0;
          const speedBoost = 1 + (freqVal / 255) * 5;
          const sizeBoost = (freqVal / 255) * 4;

          p.x += p.speedX * speedBoost;
          p.y += p.speedY * speedBoost;

          if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
          if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + sizeBoost, 0, Math.PI * 2);
          ctx.fillStyle = idx % 2 === 0 ? colorA : colorB;
          ctx.globalAlpha = Math.min(p.baseAlpha + (freqVal / 255) * 0.4, 0.8);
          ctx.fill();
        });
        ctx.globalAlpha = 1.0;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [analyser, mode, isDocumentVisible, isMobile]);

  if (mode === 'none') return null;

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
        opacity: mode === 'particles' ? 0.38 : 0.26,
        mixBlendMode: 'screen',
      }}
    />
  );
}
