  class AudioController {
    constructor() {
      if (AudioController.instance) {
        return AudioController.instance;
      }
      AudioController.instance = this;

      // Current state
      this.currentSource = null;
      this.currentTrack = null;
      this.isPlaying = false;

      // Register players
      this.players = {};

      try {
        const savedPlaylist = JSON.parse(localStorage.getItem('currentPlaylist') || '[]');
        const savedIndex = parseInt(localStorage.getItem('currentPlaylistIndex') || '0');

        if (savedPlaylist.length > 0) {
          this.currentPlaylist = savedPlaylist;
          this.currentIndex = savedIndex;

          // Set album info from the first track if available
          const firstTrack = savedPlaylist[0];
          if (firstTrack) {
            this.currentAlbumTitle = firstTrack.albumTitle || '';
            this.currentAlbumType = firstTrack.albumType || 'album';
          }

          this.playlistNavInitialized = false;
        }
      } catch (e) {
        console.error('Error restoring playlist:', e);
      }
    }

    // Register a player
    registerPlayer(id, player) {
      this.players[id] = player;
      return this;
    }

    // Play from a specific source
    play(source, trackId, audioElement, trackInfo = {}) {
      // If a different source is playing, pause it
      if (this.currentSource && this.currentSource !== source && this.isPlaying) {
        const currentPlayer = this.players[this.currentSource];
        if (currentPlayer && currentPlayer.audioElement) {
          currentPlayer.audioElement.pause();
        }
      }

      // Update current state
      this.currentSource = source;
      this.currentTrack = trackId;
      this.isPlaying = true;

      // Notify other components
      document.dispatchEvent(new CustomEvent('music-play', {
        detail: { source, trackId }
      }));

      // Save current track to localStorage
      if (trackId) {
        localStorage.setItem('currentTrack', JSON.stringify({
          id: trackId,
          currentTime: audioElement ? audioElement.currentTime : 0,
          src: audioElement ? audioElement.src : null,
          isPlaying: true,
          title: trackInfo.title || document.querySelector('.track-info .title')?.textContent,
          artist: trackInfo.artist || document.querySelector('.track-info .artist')?.textContent,
          coverUrl: trackInfo.coverUrl,
        }));
      }
    }

    // Pause the current player
    pause(source) {
      if (source === this.currentSource) {
        this.isPlaying = false;
        document.dispatchEvent(new CustomEvent('music-pause', {
          detail: { source }
        }));

        // Move this inside the if block
        const savedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}');
        if (savedTrack.id) {
          savedTrack.isPlaying = false;
          localStorage.setItem('currentTrack', JSON.stringify(savedTrack));
        }
      }
    }


    // Load and play a playlist of tracks
    loadPlaylist(tracks, startIndex = 0) {
      console.log("loadPlaylist called with", tracks.length, "tracks, starting at", startIndex);

      if (!tracks || !tracks.length) return;

      this.currentPlaylist = tracks;
      this.currentIndex = startIndex;

      if (tracks.length > 0) {
        const firstTrack = tracks[0];
        this.currentAlbumTitle = firstTrack.album_title || '';
        this.currentAlbumType = firstTrack.album_type || 'album';

        // Save playlist context to localStorage
        const simplifiedTracks = tracks.map(track => ({
          id: track.id,
          title: track.title || track.name || 'Unknown',
          artist: track.artist || 'Unknown Artist',
          audioUrl: track.path || `/api/track/${track.id}/stream`,
          albumTitle: track.album_title || track.albumTitle || '',
          albumType: track.album_type || track.albumType || 'album',
          image: track.image || track.coverUrl || '/images/default-cover.jpg'
        }));

        localStorage.setItem('currentPlaylist', JSON.stringify(simplifiedTracks));
        localStorage.setItem('currentPlaylistIndex', startIndex.toString());

        console.log("Saved playlist to localStorage", simplifiedTracks);
        console.log("Saved index to localStorage", startIndex);
      }

      // Play the first track
      this.loadCurrentTrack();

      if (!this.playlistNavInitialized) {
        const oldNextListener = this._nextTrackHandler;
        const oldPrevListener = this._prevTrackHandler;

        if (oldNextListener) document.removeEventListener('mini-player-next', oldNextListener);
        if (oldPrevListener) document.removeEventListener('mini-player-prev', oldPrevListener);

        // Create new handler functions and store references
        this._nextTrackHandler = () => {
          console.log("🎵 Next track event received");
          this.nextTrack();
        };

        this._prevTrackHandler = () => {
          console.log("🎵 Previous track event received");
          this.prevTrack();
        };

        // Add the new listeners
        document.addEventListener('mini-player-next', this._nextTrackHandler);
        document.addEventListener('mini-player-prev', this._prevTrackHandler);

        console.log("✅ Playlist navigation event listeners initialized");
        this.playlistNavInitialized = true;
      }
    }

    // Load the current track into the mini-player
    loadCurrentTrack() {
      if (!this.currentPlaylist || this.currentIndex === undefined) return;

      const track = this.currentPlaylist[this.currentIndex];
      const miniPlayer = this.players['mini-player'];

      if (miniPlayer && miniPlayer.audioElement) {
        miniPlayer.audioElement.src = track.path;
        miniPlayer.audioElement.play().catch(e => console.warn("Couldn't auto-play:", e));

        const albumType = track.album_type || track.type || 'unknown type';
        const albumTitle = track.album_title || (track.album ? track.album.title : '') || 'unknown title';

        let coverUrl;
        if (track.image && track.image.startsWith('/images/')) {
          coverUrl = track.image;
        } else if (track.image_cover_filename) {
          coverUrl = `/images/${track.image_cover_filename}`;
        } else {
          coverUrl = track.image || '/images/default-cover.jpg';
        }

        // Save track info to localStorage
        localStorage.setItem('currentTrack', JSON.stringify({
          id: track.id,
          src: track.path,
          title: track.name,
          artist: track.artist,
          coverUrl: coverUrl,
          albumType: albumType,
          albumTitle: albumTitle,
          isPlaying: true,
          currentTime: 0,
          timestamp: Date.now()
        }));

        // Update mini-player UI
        if (window.miniPlayer && window.miniPlayer.loadTrack) {
          console.log("AUDIO CONTROLER AAAAAAAAAAAAAAAAAAAA")
          window.miniPlayer.loadTrack({
            id: track.id,
            title: track.name,
            artist: track.artist,
            coverUrl: coverUrl,
            audioUrl: track.path,
            albumType: albumType,
            albumTitle: albumTitle
          });
        }
      }
      const miniPlayerEl = document.getElementById('mini-player');
      if (miniPlayerEl) {
        miniPlayerEl.classList.remove('hidden');
        miniPlayerEl.style.display = 'flex';
      }
    }

    nextTrack() {
      console.log("nextTrack called");
      console.log("Current playlist:", this.currentPlaylist);
      console.log("Current index:", this.currentIndex);

      if (this.currentPlaylist && this.currentIndex !== undefined) {
        this.currentIndex = (this.currentIndex + 1) % this.currentPlaylist.length;
        this.loadCurrentTrack();
        return;
      }

      // If not available, try to use the saved playlist
      const savedPlaylist = JSON.parse(localStorage.getItem('currentPlaylist') || '[]');
      const savedIndex = parseInt(localStorage.getItem('currentPlaylistIndex') || '0');

      if (savedPlaylist.length > 0) {
        const nextIndex = (savedIndex + 1) % savedPlaylist.length;
        localStorage.setItem('currentPlaylistIndex', nextIndex.toString());

        this.currentPlaylist = savedPlaylist;
        this.currentIndex = nextIndex;
        this.loadCurrentTrack();
      }
    }

    prevTrack() {
      // First try to use the in-memory playlist
      if (this.currentPlaylist && this.currentIndex !== undefined) {
        this.currentIndex = (this.currentIndex - 1 + this.currentPlaylist.length) % this.currentPlaylist.length;
        this.loadCurrentTrack();
        return;
      }

      // If not available, try to use the saved playlist
      const savedPlaylist = JSON.parse(localStorage.getItem('currentPlaylist') || '[]');
      const savedIndex = parseInt(localStorage.getItem('currentPlaylistIndex') || '0');

      if (savedPlaylist.length > 0) {
        const prevIndex = (savedIndex - 1 + savedPlaylist.length) % savedPlaylist.length;
        localStorage.setItem('currentPlaylistIndex', prevIndex.toString());

        this.currentPlaylist = savedPlaylist;
        this.currentIndex = prevIndex;
        this.loadCurrentTrack();
      }
    }
  }

  // Create and export a single instance
  window.audioController = new AudioController();

// Add this code at the bottom of your audio-controller.js file
document.addEventListener('DOMContentLoaded', () => {
    console.log('Setting up track selection listeners');

    // Listen for clicks on track play buttons
    document.addEventListener('click', (e) => {
        const trackElement = e.target.closest('[data-track-id]');
        if (trackElement) {
            const trackId = trackElement.dataset.trackId;
            if (trackId) {
                console.log('Track clicked:', trackId);

                // Get all tracks on the page to build a playlist
                const trackElements = document.querySelectorAll('[data-track-id]');
                const tracks = [];
                let startIndex = 0;

                trackElements.forEach((el, index) => {
                    const id = el.dataset.trackId;
                    if (id) {
                        // Build track object from data attributes
                        const track = {
                            id: id,
                            name: el.dataset.title || 'Unknown Title',
                            artist: el.dataset.artist || 'Unknown Artist',
                            path: `/track/${id}`,
                            album_title: el.dataset.album || '',
                            album_type: el.dataset.type || 'album',
                            image: el.dataset.cover || '/images/default-cover.jpg'
                        };
                        tracks.push(track);

                        // Set starting index to the clicked track
                        if (id === trackId) {
                            startIndex = index;
                        }
                    }
                });

                if (tracks.length > 0) {
                    console.log('Loading playlist:', tracks.length, 'tracks, starting at index', startIndex);
                    window.audioController.loadPlaylist(tracks, startIndex);
                }
            }
        }
    });

    // Also listen for custom track-selected events
    document.addEventListener('track-selected', (e) => {
        console.log('Track selected event:', e.detail);
        if (e.detail && e.detail.trackId) {
            fetch(`/api/track/${e.detail.trackId}`)
                .then(response => response.json())
                .then(track => {
                    window.audioController.loadPlaylist([track], 0);
                })
                .catch(err => console.error('Error loading track from event:', err));
        }
    });
});

// Updated PlayAlbum interceptor with localStorage cleanup
// Add this to the beginning of your audio-controller.js file
(function() {
  // Only clean invalid saved state
  console.log('Checking localStorage for valid data...');
  try {
    const savedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}');
    // Only remove if missing essential properties
    if (!savedTrack.id || !savedTrack.src) {
      console.log('Removing invalid track data');
      localStorage.removeItem('currentTrack');
    } else {
      console.log('Valid track data found, preserving');
    }
  } catch (e) {
    console.log('Invalid JSON in localStorage, cleaning up');
    localStorage.removeItem('currentTrack');
  }

  if (window.miniPlayer) {
    const originalLoadTrack = window.miniPlayer.loadTrack;
    window.miniPlayer.loadTrack = function(track) {
      console.log('Enhanced loadTrack called with:', track);

      // Format audioUrl properly
      if (track.id && !track.audioUrl) {
        track.audioUrl = `/api/track/${track.id}/stream`;
      }

      // Set standard properties
      track.title = track.title || track.name || 'Unknown Track';
      track.artist = track.artist || 'Unknown Artist';
      track.albumTitle = track.albumTitle || track.album_title || 'Unknown Album';
      track.albumType = track.albumType || track.album_type || 'album';

      // Call original method with fixed track
      return originalLoadTrack.call(this, track);
    };
  }

  // Fix URL format in updateTrackInfo
  const originalUpdateTrackInfo = AudioController.prototype.loadCurrentTrack;
  AudioController.prototype.loadCurrentTrack = function() {
    if (!this.currentPlaylist || this.currentIndex === undefined) return;

    const originalTrack = this.currentPlaylist[this.currentIndex];
    const track = standardizeTrack(originalTrack);

    console.log('Loading standardized track:', track);

    const miniPlayer = this.players['mini-player'];
    if (miniPlayer && miniPlayer.audioElement) {
      miniPlayer.audioElement.src = track.audioUrl;

      // Save track info to localStorage with consistent structure
      localStorage.setItem('currentTrack', JSON.stringify({
        id: track.id,
        src: track.audioUrl,
        title: track.title,
        artist: track.artist,
        coverUrl: track.image,
        albumType: track.albumType,
        albumTitle: track.albumTitle,
        isPlaying: true,
        currentTime: 0,
        timestamp: Date.now()
      }));

      // Update mini-player UI with consistent properties - include playlist info
      if (window.miniPlayer && window.miniPlayer.loadTrack) {
        window.miniPlayer.loadTrack({
          ...track,
          trackList: this.currentPlaylist,
          currentTrackIndex: this.currentIndex
        });
        console.log("Passing to mini-player - trackList:", this.currentPlaylist, "currentTrackIndex:", this.currentIndex);
      }

      miniPlayer.audioElement.play().catch(e => console.warn("Couldn't auto-play:", e));
    }

    // Show the mini-player
    const miniPlayerEl = document.getElementById('mini-player');
    if (miniPlayerEl) {
      miniPlayerEl.classList.remove('hidden');
      miniPlayerEl.style.display = 'flex';
    }
  };

  console.log('✅ Track loading patched with proper path formats');
})();

// Add this to audio-controller.js to standardize track objects

// Standardize track object structure
function standardizeTrack(track) {
  return {
    id: track.id || track.trackId || 'unknown',
    title: track.title || track.name || 'Unknown Track',
    artist: track.artist || 'Unknown Artist',
    audioUrl: track.path || track.audioUrl || `/track/${track.id || 'unknown'}`,
    albumTitle: track.album_title || track.albumTitle || 'Unknown Album',
    albumType: track.album_type || track.albumType || 'album',
    image: track.image || track.coverUrl || '/images/default-cover.jpg'
  };
}

// Modify loadCurrentTrack to use the standardized format
AudioController.prototype.loadCurrentTrack = function() {
  if (!this.currentPlaylist || this.currentIndex === undefined) return;

  const originalTrack = this.currentPlaylist[this.currentIndex];
  const track = standardizeTrack(originalTrack);

  console.log('Loading standardized track:', track);

  const miniPlayer = this.players['mini-player'];
  if (miniPlayer && miniPlayer.audioElement) {
    miniPlayer.audioElement.src = track.audioUrl;

    // Save track info to localStorage with consistent structure
    localStorage.setItem('currentTrack', JSON.stringify({
      id: track.id,
      src: track.audioUrl,
      title: track.title,
      artist: track.artist,
      coverUrl: track.image,
      albumType: track.albumType,
      albumTitle: track.albumTitle,
      isPlaying: true,
      currentTime: 0,
      timestamp: Date.now()
    }));

    // Update mini-player UI with consistent properties
    if (window.miniPlayer && window.miniPlayer.loadTrack) {
      window.miniPlayer.loadTrack(track);
    }

    miniPlayer.audioElement.play().catch(e => console.warn("Couldn't auto-play:", e));
  }

  // Show the mini-player
  const miniPlayerEl = document.getElementById('mini-player');
  if (miniPlayerEl) {
    miniPlayerEl.classList.remove('hidden');
    miniPlayerEl.style.display = 'flex';
  }
};