document.addEventListener('DOMContentLoaded', () => {

    console.log('DOM loaded - about to initialize mini player');
    const miniPlayer = {
        container: document.getElementById('mini-player'),
        audioElement: document.getElementById('audio-player'),
        playBtn: document.getElementById('mini-playpause-track'),
        prevBtn: document.getElementById('mini-prev-track'),
        nextBtn: document.getElementById('mini-next-track'),
        trackName: document.getElementById('mini-track-name'),
        trackArtist: document.getElementById('mini-track-artist'),
        trackArt: document.getElementById('mini-track-art'),
        trackId: null,
        volumeSlider: null,
        volumeIcon: null,
        progressSlider: null,
        currentTimeElement: null,
        totalDurationElement: null,
        isDraggingProgress: false,
        isUpdatingProgress: false,
        lastUpdateTime: 0,
        updateInterval: 50,

        debug() {
            console.log('===== MINI PLAYER DEBUG =====');
            console.log('Audio element:', this.audioElement);
            console.log('Audio src:', this.audioElement.src);
            console.log('Track ID:', this.trackId);
            console.log('Audio paused:', this.audioElement.paused);
            console.log('Audio error:', this.audioElement.error);
            console.log('Audio networkState:', this.audioElement.networkState);
            console.log('Audio readyState:', this.audioElement.readyState);
            console.log('AudioController registered:', !!window.audioController);
            console.log('============================');
        },

        init() {
            console.log('1. init() called');
            if (this._initialized) {
                console.log('Player already initialized, skipping');
                return;
            }
            this._initialized = true;

            if (!this.container || !this.audioElement) {
                console.error('Mini player elements not found');
                return;
            }
            console.log('2. Mini player elements found');
            console.log('Mini player initialized');

            if (window.audioController) {
                console.log('3. audioController found, registering player');
                try {
                    window.audioController.registerPlayer('mini-player', {
                        audioElement: this.audioElement
                    });
                    console.log('4. Player registered successfully');
                } catch (err) {
                    console.error('Registration error:', err);
                }
            } else {
                console.error('5. Audio controller not found!');
                console.log('window.audioController =', window.audioController);
                return;
            }

            console.log('6. About to restore player state');
            const restored = this.restorePlayerState();
            console.log('7. Restore result:', restored);

            if (!restored) {
                this.container.style.display = 'none';
                console.log('8. Player hidden (not restored)');
            }

            // Volume slider setup
            this.volumeSlider = document.querySelector('.volume-slider');
            this.volumeIcon = document.querySelector('.volume-control i');

            const savedVolume = localStorage.getItem('playerVolume') || 1;
            this.audioElement.volume = savedVolume;
            if (this.volumeSlider) this.volumeSlider.value = savedVolume;

            if (this.volumeSlider) {
                if (this._volumeChangeHandler) {
                    this.volumeSlider.removeEventListener('input', this._volumeChangeHandler);
                }
                this._volumeChangeHandler = () => {
                    const volume = parseFloat(this.volumeSlider.value);
                    this.audioElement.volume = volume;
                    localStorage.setItem('playerVolume', volume);
                    this.updateVolumeIcon(volume);
                };
                this.volumeSlider.addEventListener('input', this._volumeChangeHandler);
            }

            // Progress slider setup with optimized handling
            this.progressSlider = document.querySelector('.progress-slider');
            this.currentTimeElement = document.querySelector('.current-time');
            this.totalDurationElement = document.querySelector('.total-duration');

            if (this.progressSlider) {
                // When user starts dragging
                this.progressSlider.addEventListener('mousedown', () => {
                    this.isDraggingProgress = true;
                }, { passive: true });

                // When user stops dragging
                document.addEventListener('mouseup', () => {
                    if (this.isDraggingProgress) {
                        this.isDraggingProgress = false;
                        // Apply the change immediately
                        const seekTime = (this.audioElement.duration * this.progressSlider.value) / 100;
                        this.audioElement.currentTime = seekTime;
                    }
                });

                // Use input event for seeking
                if (this._progressChangeHandler) {
                    this.progressSlider.removeEventListener('input', this._progressChangeHandler);
                }
                this._progressChangeHandler = () => {
                    if (this.isDraggingProgress) {
                        // Update time display while dragging
                        const seekTime = (this.audioElement.duration * this.progressSlider.value) / 100;
                        if (this.currentTimeElement) {
                            this.currentTimeElement.textContent = this.formatTime(seekTime);
                        }
                    }
                };
                this.progressSlider.addEventListener('input', this._progressChangeHandler);
            }

            // Add timeupdate event with throttling for smoother updates
            if (this._audioTimeUpdateHandler) {
                this.audioElement.removeEventListener('timeupdate', this._audioTimeUpdateHandler);
            }
            this._audioTimeUpdateHandler = () => {
                this.updateProgressBar();
            };
            this.audioElement.addEventListener('timeupdate', this._audioTimeUpdateHandler);

            if (this._audioLoadedHandler) {
                this.audioElement.removeEventListener('loadedmetadata', this._audioLoadedHandler);
            }
            this._audioLoadedHandler = () => {
                if (this.totalDurationElement) {
                    this.totalDurationElement.textContent = this.formatTime(this.audioElement.duration);
                }
            };
            this.audioElement.addEventListener('loadedmetadata', this._audioLoadedHandler);

            console.log('9. Setting up events');
            this.setupEvents();
            console.log('10. Events setup complete');

            setInterval(() => {
                if (!this.audioElement.paused) {
                    const savedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}');
                    if (savedTrack.id) {
                        const savedMeta = JSON.parse(localStorage.getItem('lastLoadedTrackMeta') || '{}');

                        const trackToSave = {
                            ...savedTrack,  // Keep all existing properties
                            currentTime: this.audioElement.currentTime,
                            albumType: savedTrack.albumType || savedMeta.albumType,
                            albumTitle: savedTrack.albumTitle || savedMeta.albumTitle
                        };

                        localStorage.setItem('currentTrack', JSON.stringify(trackToSave));
                    }
                }
            }, 500);
        },

        updateVolumeIcon(volume) {
            if (!this.volumeIcon) return;

            this.volumeIcon.className = 'fas';
            if (volume === 0) {
                this.volumeIcon.classList.add('fa-volume-mute');
            } else if (volume < 0.5) {
                this.volumeIcon.classList.add('fa-volume-down');
            } else {
                this.volumeIcon.classList.add('fa-volume-up');
            }
        },

        updateProgressBar() {
            if (!this.audioElement || !this.progressSlider || this.isDraggingProgress) return;

            if (!this.isUpdatingProgress) {
                this.isUpdatingProgress = true;

                requestAnimationFrame(() => {
                    const currentTime = this.audioElement.currentTime;
                    const duration = this.audioElement.duration || 1;
                    const progressPercent = (currentTime / duration) * 100;

                    this.progressSlider.style.background =
                        `linear-gradient(to right, #0066cc 0%, #0066cc ${progressPercent}%, #535353 ${progressPercent}%, #535353 100%)`;

                    this.progressSlider.value = progressPercent;

                    if (this.currentTimeElement) {
                        this.currentTimeElement.textContent = this.formatTime(currentTime);
                    }

                    this.isUpdatingProgress = false;
                });
            }
        },

        formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";

            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
        },

        loadTrack(track) {
            console.log("Loading track:", track);
            this.audioElement.src = track.audioUrl;
            this.trackId = track.id;

            // Determine cover URL
            let coverUrl = '';
            if (track.image && track.image.startsWith('/images/')) {
                coverUrl = track.image;
            } else if (track.image_cover_filename) {
                coverUrl = `/images/${track.image_cover_filename}`;
            } else if (track.coverUrl) {
                coverUrl = track.coverUrl;
            } else {
                coverUrl = '/images/default-cover.jpg';
            }

            console.log('Resolved cover URL:', coverUrl);

            const trackInfo = {
                title: track.title || 'Unknown Track',
                artist: track.artist || 'Unknown Artist',
                coverUrl: coverUrl,
                trackId: track.id,
                albumType: track.albumType,
                albumTitle: track.albumTitle,
                trackList: track.trackList,
                currentTrackIndex: track.currentTrackIndex,
            };
            console.log("1111111 TRACK LIST::::: ", trackInfo.trackList, "CURRENT INDEX:::: ", trackInfo.currentTrackIndex)



            this.updateTrackInfo(trackInfo);

            // Save to localStorage
            const trackToSave = {
                id: track.id,
                title: trackInfo.title,
                artist: trackInfo.artist,
                src: track.audioUrl,
                coverUrl: coverUrl,
                currentTime: this.audioElement.currentTime || 0,
                albumType: track.albumType || trackInfo.albumType,
                albumTitle: track.albumTitle || trackInfo.albumTitle,
                albumId: track.albumId || track.album_id,
                trackList: track.trackList,
                currentTrackIndex: track.currentTrackIndex,
            };
            console.log("TRACK LIST::::: ", trackToSave.trackList, "CURRENT INDEX:::: ", trackToSave.currentTrackIndex)
            this.lastLoadedTrack = {...trackToSave};
            localStorage.setItem('lastLoadedTrackMeta', JSON.stringify({
                albumType: trackToSave.albumType,
                albumTitle: trackToSave.albumTitle
            }));


            console.log("SAVING TO LOCALSTORAGE:", {
                albumType: trackToSave.albumType,
                albumTitle: trackToSave.albumTitle
            });

            localStorage.setItem('currentTrack', JSON.stringify(trackToSave));

            localStorage.setItem('playerState', 'playing');
            console.log("TRACK TO SAVE: ", trackToSave)
            this.container.style.display = 'flex';
            this.container.classList.remove('hidden');

            // Attempt to play automatically and handle autoplay restrictions
            const playPromise = this.audioElement.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Autoplay started successfully');
                    window.audioController.play('mini-player', this.trackId, this.audioElement, trackInfo);
                    this.updatePlayButton();
                }).catch(error => {
                    console.warn('Autoplay prevented:', error);
                    // Update UI to indicate play is needed
                    this.updatePlayButton();
                    // Show some visual indicator that user needs to press play
                    if (this.playBtn) {
                        this.playBtn.classList.add('attention');
                        setTimeout(() => this.playBtn.classList.remove('attention'), 2000);
                    }
                });
            }
        },

        restorePlayerState() {
            try {
                console.log('RPS1: Starting restore player state');
                const savedTrackJSON = localStorage.getItem('currentTrack');

                console.log('RPS2: Raw saved track data:', savedTrackJSON);

                if (!savedTrackJSON) {
                    console.log('RPS3: No saved track data found');
                    return false;
                }

                console.log('RPS4: Parsing saved track data');
                const savedTrack = JSON.parse(savedTrackJSON || '{}');
                const savedMeta = JSON.parse(localStorage.getItem('lastLoadedTrackMeta') || '{}');
                if (savedMeta.albumType) savedTrack.albumType = savedMeta.albumType;
                if (savedMeta.albumTitle) savedTrack.albumTitle = savedMeta.albumTitle;
                console.log("PARSED SAVED TRACK - FULL OBJECT:", JSON.stringify(savedTrack));
                console.log("KEYS IN SAVED TRACK:", Object.keys(savedTrack));
                console.log('RPS5: Parsed track data:', savedTrack);

                if (!savedTrack || !savedTrack.src) {
                    console.log('RPS6: Invalid track data - missing src property');
                    return false;
                }

                console.log('RPS7: Making player visible');
                // Always make player visible first
                this.container.style.display = 'flex';
                this.container.classList.remove('hidden');

                console.log('RPS8: Setting audio source to', savedTrack.src);
                // Set basic track info immediately
                this.audioElement.src = savedTrack.src;
                this.trackId = savedTrack.id;

                console.log('RPS9: Updating UI display');
                console.log("Full saved track data before display update:", savedTrack);
                this.updateTrackDisplay(savedTrack);

                const registerTrack = () => {
                    console.log('RPS10: RegisterTrack function called');
                    if (!window.audioController) {
                        console.error('RPS11: Audio controller not available, retrying in 500ms');
                        setTimeout(registerTrack, 500);
                        return;
                    }

                    console.log('RPS12: Registering restored track with audio controller:', this.trackId);

                    console.log('RPS13: Setting playback position if available');
                    if (savedTrack.currentTime && !isNaN(savedTrack.currentTime)) {
                        console.log('RPS14: Setting currentTime to', savedTrack.currentTime);
                        this.audioElement.currentTime = savedTrack.currentTime;
                        this.updateProgressBar();
                    }

                    console.log('RPS15: Updating play button state');
                    this.updatePlayButton();

                    console.log('RPS16: Checking if should resume playback');
                    const playerState = localStorage.getItem('playerState');
                    console.log('RPS17: playerState =', playerState);
                    // In the restorePlayerState function, replace the code around line RPS18 (the "if (playerState === 'playing')" block) with:

                    if (playerState === 'playing') {
                        console.log('RPS18: Attempting to resume playback');

                        // Try to play first (will likely be blocked)
                        const playPromise = this.audioElement.play();
                        if (playPromise !== undefined) {
                            playPromise
                                .then(() => {
                                    console.log('RPS19: Playback resumed successfully');
                                    window.audioController.play('mini-player', this.trackId, this.audioElement, {
                                        title: savedTrack.title,
                                        artist: savedTrack.artist,
                                        coverUrl: savedTrack.coverUrl
                                    });
                                })
                                .catch(e => {
                                    console.warn("RPS20: Auto-play prevented:", e);

                                    if (this.playBtn) {
                                        this.playBtn.classList.add('attention-needed');
                                        this.playBtn.style.animation = 'pulse 1.5s infinite';
                                    }

                                    const resumePlayback = () => {
                                        // First set the correct position BEFORE playing
                                        if (savedTrack && savedTrack.currentTime) {
                                            this.audioElement.currentTime = savedTrack.currentTime;
                                        }

                                        // Then attempt to play
                                        this.audioElement.play()
                                            .then(() => {
                                                window.audioController.play('mini-player', this.trackId, this.audioElement, {
                                                    title: savedTrack.title,
                                                    artist: savedTrack.artist,
                                                    coverUrl: savedTrack.coverUrl
                                                });

                                                // Remove visual indicator
                                                if (this.playBtn) {
                                                    this.playBtn.classList.remove('attention-needed');
                                                    this.playBtn.style.animation = '';
                                                }
                                            });

                                        // Remove the listeners
                                        document.removeEventListener('click', resumePlayback);
                                        document.removeEventListener('keydown', resumePlayback);
                                        document.removeEventListener('touchstart', resumePlayback);
                                    };

                                    document.addEventListener('click', resumePlayback, {once: true});
                                    document.addEventListener('keydown', resumePlayback, {once: true});
                                    document.addEventListener('touchstart', resumePlayback, {once: true});
                                });
                        }
                    }
                };

                console.log('RPS21: Checking if audioController exists now:', !!window.audioController);
                // Try to register immediately if audio controller exists
                if (window.audioController) {
                    console.log('RPS22: audioController available immediately');
                    registerTrack();
                } else {
                    console.log('RPS23: Setting up audio-controller-ready listener');
                    // Wait for audio controller to become available
                    document.addEventListener('audio-controller-ready', () => {
                        console.log('RPS24: audio-controller-ready event received');
                        registerTrack();
                    }, { once: true });
                }
                console.log("RESTORATION VALUES BEFORE TRACK DISPLAY:", {
                    albumType: savedTrack.albumType,
                    albumTitle: savedTrack.albumTitle,
                    title: savedTrack.title
                });

                console.log('RPS25: Setting up loadedmetadata event');
                // Setup metadata event for timing issues
                this.audioElement.addEventListener('loadedmetadata', () => {
                    console.log('RPS26: loadedmetadata event fired');
                    // Double check registration after metadata loads
                    if (window.audioController) {
                        console.log('RPS27: Calling registerTrack from loadedmetadata');
                        registerTrack();
                    }
                }, { once: true });

                console.log('RPS28: Setting safety timeout');
                // Safety timeout in case metadata never loads
                setTimeout(() => {
                    console.log('RPS29: Safety timeout fired');
                    if (window.audioController) {
                        console.log('RPS30: Calling registerTrack from timeout');
                        registerTrack();
                    } else {
                        console.log('RPS31: audioController still not available after timeout');
                    }
                }, 2000);

                console.log('RPS32: Restore sequence complete, returning true');
                return true;
            } catch (e) {
                console.error("RPS33: Player restore error:", e);
                console.error("Stack trace:", e.stack);
            }
            console.log('RPS34: Restore failed, returning false');
            return false;
        },

        updateTrackDisplay(trackData) {
            console.log("RESTORATION VALUES BEFORE AFTER TRACK DISPLAY:", {
                albumType: trackData.albumType,
                albumTitle: trackData.albumTitle,
                title: trackData.title
            });

            console.log("Track data in updateTrackDisplay:", trackData);

            if (this.trackName) {
                this.trackName.textContent = trackData.title || '';

                if (trackData.artist) {
                    const albumType = trackData.albumType || 'album';
                    // Use the track title if albumTitle is empty
                    const albumTitle = trackData.albumTitle || trackData.title || '';

                    // Construct URL with no trailing slash when albumTitle is empty
                    this.trackName.href = `/a/${albumType}/${trackData.artist}/${albumTitle}`;
                    console.log(`Set track name link: ${this.trackName.href}`);
                }
            }

            if (this.trackArtist) {
                this.trackArtist.textContent = trackData.artist || '';
                if (trackData.artist) {
                    this.trackArtist.href = `/a/${trackData.artist}`;
                    console.log(`Set artist link: ${this.trackArtist.href}`);
                }
            }

            if (this.trackArt && trackData.coverUrl) {
                this.trackArt.src = trackData.coverUrl;
                console.log('Set cover image from:', trackData.coverUrl);
            }
            if (this.prevBtn) {
                this.prevBtn.disabled = false
                console.log("AAAAAAAAAA DISABLED")
            };
            if (this.nextBtn) this.nextBtn.disabled = false;
        },

        setupEvents() {
            this._playButtonCooldown = true;

            setTimeout(() => {
                this._playButtonCooldown = false;
            }, 1500);

            if (this._playBtnHandler) {
                this.playBtn.removeEventListener('click', this._playBtnHandler);
            }

            // Create a named handler function we can reference for removal
            this._playBtnHandler = (e) => {
                console.log('Play button clicked, current paused state:', this.audioElement.paused);

                if (this._playButtonCooldown) {
                    console.log('Play button on cooldown, ignoring click');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                // Only restore position if the player is currently paused
                if (this.audioElement.paused) {
                    const savedTrackJSON = localStorage.getItem('currentTrack');
                    if (savedTrackJSON) {
                        try {
                            const savedTrack = JSON.parse(savedTrackJSON);
                            if (savedTrack && savedTrack.currentTime && !isNaN(savedTrack.currentTime) &&
                                savedTrack.id === this.trackId) {
                                console.log('Restoring saved position before play:', savedTrack.currentTime);
                                this.audioElement.currentTime = savedTrack.currentTime;
                            }
                        } catch (e) {
                            console.error('Error parsing saved track data:', e);
                        }
                    }

                    this.audioElement.play()
                        .then(() => {
                            window.audioController.play('mini-player', this.trackId, this.audioElement, {
                                title: this.trackName.textContent,
                                artist: this.trackArtist.textContent,
                                coverUrl: this.trackArt ? this.trackArt.src : null
                            });
                            localStorage.setItem('playerState', 'playing');
                            this.updatePlayButton();
                        })
                        .catch(err => console.error('Playback error:', err));
                } else {
                    this.audioElement.pause();
                    window.audioController.pause('mini-player');
                    localStorage.setItem('playerState', 'paused');
                    this.updatePlayButton();
                }
            };

            // Add the event listener with our named handler
            this.playBtn.addEventListener('click', this._playBtnHandler);

            // Handle previous button
            if (this.prevBtn) {
                if (this._prevBtnHandler) {
                    this.prevBtn.removeEventListener('click', this._prevBtnHandler);
                }
                this._prevBtnHandler = () => {
                    const event = new CustomEvent('mini-player-prev');
                    document.dispatchEvent(event);
                };
                this.prevBtn.addEventListener('click', this._prevBtnHandler);
            }

            // Handle next button
            if (this.nextBtn) {
                if (this._nextBtnHandler) {
                    this.nextBtn.removeEventListener('click', this._nextBtnHandler);
                }
                this._nextBtnHandler = () => {
                    const event = new CustomEvent('mini-player-next');
                    document.dispatchEvent(event);
                };
                this.nextBtn.addEventListener('click', this._nextBtnHandler);
            }

            // Audio element events
            if (this._audioPlayHandler) {
                this.audioElement.removeEventListener('play', this._audioPlayHandler);
            }
            this._audioPlayHandler = () => {
                window.audioController.play('mini-player', this.trackId, this.audioElement, {
                    title: this.trackName.textContent,
                    artist: this.trackArtist.textContent,
                    coverUrl: this.trackArt ? this.trackArt.src : null
                });
                localStorage.setItem('playerState', 'playing');
                this.updatePlayButton();
            };
            this.audioElement.addEventListener('play', this._audioPlayHandler);

            if (this._audioPauseHandler) {
                this.audioElement.removeEventListener('pause', this._audioPauseHandler);
            }
            this._audioPauseHandler = () => {
                window.audioController.pause('mini-player');
                localStorage.setItem('playerState', 'paused');

                const savedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}');
                if (savedTrack.id && savedTrack.id === this.trackId) {
                    savedTrack.currentTime = this.audioElement.currentTime;
                    localStorage.setItem('currentTrack', JSON.stringify(savedTrack));
                }

                this.updatePlayButton();
            };
            this.audioElement.addEventListener('pause', this._audioPauseHandler);

            if (this._audioEndedHandler) {
                this.audioElement.removeEventListener('ended', this._audioEndedHandler);
            }
            this._audioEndedHandler = () => {
                const event = new CustomEvent('mini-player-next');
                document.dispatchEvent(event);
            };
            this.audioElement.addEventListener('ended', this._audioEndedHandler);

            if (this._audioErrorHandler) {
                this.audioElement.removeEventListener('error', this._audioErrorHandler);
            }
            this._audioErrorHandler = (e) => {
                console.error('❌ AUDIO ERROR EVENT:', e);
                console.error('Error code:', this.audioElement.error ? this.audioElement.error.code : 'No error code');
                console.error('Error message:', this.audioElement.error ? this.audioElement.error.message : 'No message');
                console.error('Current src:', this.audioElement.src);
            };
            this.audioElement.addEventListener('error', this._audioErrorHandler);

            // Document-level event listeners
            if (this._musicPlayHandler) {
                document.removeEventListener('music-play', this._musicPlayHandler);
            }
            this._musicPlayHandler = (e) => {
                if (e.detail.source !== 'mini-player') {
                    this.audioElement.pause();
                    this.updatePlayButton();
                }
            };
            document.addEventListener('music-play', this._musicPlayHandler);

            if (this._trackInfoUpdateHandler) {
                document.removeEventListener('track-info-update', this._trackInfoUpdateHandler);
            }
            this._trackInfoUpdateHandler = (e) => {
                this.updateTrackInfo(e.detail);
            };
            document.addEventListener('track-info-update', this._trackInfoUpdateHandler);
        },

        updatePlayButton() {
            if (!this.playBtn) return;
            const icon = this.audioElement.paused ? 'fa-play-circle' : 'fa-pause-circle';
            this.playBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        },

        updateTrackInfo(info) {
            console.log('Track info:', info);

            if (!info) {
                console.error('No track info provided');
                return;
            }

            if (info.title) {
                this.trackName.textContent = info.title;
                if (info.albumType && info.albumTitle && info.artist) {
                    this.trackName.href = `/a/${info.albumType}/${info.artist}/${info.albumTitle}`;
                }
            }

            if (info.artist) {
                this.trackArtist.textContent = info.artist;
                this.trackArtist.href = `/a/${info.artist}`;
            }

            console.log('Cover URL:', info.coverUrl);
            console.log('Track art element:', this.trackArt);

            if (info.coverUrl && this.trackArt) {
                this.trackArt.src = info.coverUrl;
            }

            this.trackId = info.trackId;
            this.container.classList.remove('hidden');
            this.container.style.display = 'flex';
        },
    }

    window.miniPlayer = miniPlayer;
    console.log('Mini player object created, checking for audioController');


    document.addEventListener('click', (e) => {
        console.log('🔍 Document click detected');
        const playButton = e.target.closest('.play-track, [data-track-id], .song-play-btn');
        if (playButton) {
            const trackId = playButton.dataset.trackId;
            if (trackId) {
                console.log('Track selected:', trackId);

                // Fetch track data from API
                fetch(`/api/track/${trackId}`)
                    .then(response => {
                        if (!response.ok) throw new Error('Failed to fetch track');
                        return response.json();
                    })
                    .then(trackData => {
                        console.log('Track data received:', trackData);
                        miniPlayer.loadTrack(trackData);
                    })
                    .catch(err => {
                        console.error('Error loading track:', err);
                    })

                e.preventDefault();
            }
        }
    });

    document.addEventListener('track-selected', (e) => {
        console.log('Track selected event:', e.detail);
        if (e.detail && e.detail.trackId) {
            fetch(`/api/track/${e.detail.trackId}`)
                .then(response => response.json())
                .then(trackData => miniPlayer.loadTrack(trackData))
                .catch(err => console.error('Error loading track from event:', err));
        }
    });

    if (window.audioController) {
        console.log('AudioController available immediately, initializing');
        miniPlayer.init();
    } else {
        console.log('Waiting for audio-controller-ready event');
        window.addEventListener('audio-controller-ready', () => {
            console.log('AudioController ready event received');
            miniPlayer.init();
        });
    }

    setTimeout(() => {
        console.log('Timeout check: audioController available:', !!window.audioController);
        if (window.audioController) {
            console.log('Ensuring player is registered');
            miniPlayer.init();
        }
    }, 1000);
});
