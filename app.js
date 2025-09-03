const express = require('express');
const path = require('path');
const knex = require('knex');
const session = require('express-session');
const uploadFolder = 'public/images';
const multer = require('multer');
const fs = require('fs');
const app = express();
const { execFile } = require('child_process');
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);

app.locals.formatDuration = function(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  }
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.get('/opening', (req, res) => {
  res.render('opening', { layout: false });
});

// Flash message middleware
app.use((req, res, next) => {
  res.locals.messages = req.session.messages || [];
  req.session.messages = [];
  next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static('public'));

function getSongDuration(filePath) {
    console.log("Called duration for ", filePath);
    return new Promise((resolve, reject) => {
        execFile('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ], (error, stdout, stderr) => {
            if (!error && stdout.trim()) {
                const duration = parseFloat(stdout.trim());
                resolve(duration);
            } else {
                const flacPath = filePath.replace(/\.wav$/i, '.flac');

                execFile('ffprobe', [
                    '-v', 'error',
                    '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1',
                    flacPath
                ], (flacError, flacStdout, flacStderr) => {
                    if (!flacError && flacStdout.trim()) {
                        console.log("Found duration from FLAC file:", flacPath);
                        const duration = parseFloat(flacStdout.trim());
                        resolve(duration);
                    } else {
                        console.warn(`Cannot calculate duration for: ${filePath}`);
                        resolve(0); // Default to 0 if both attempts fail
                    }
                });
            }
        });
    });
}

if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// Setup upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadFolder),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${path.basename(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.wav'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }
});

function convert(file) {
  console.log("Called func convert");
  const filePath = path.join(uploadFolder, file.filename);

  return new Promise((resolve, reject) => {
    execFile('./convert.sh', [filePath], (error, stdout, stderr) => {
      if (error) {
        console.error('Error converting file:', stderr);
        return reject(stderr);
      }
      const flacPath = filePath.replace(/\.wav$/, '.flac');
      resolve(flacPath);
    });
  });
}




// Routes
app.get('/', (req, res) => res.redirect('/home'));

app.post('/login', upload.none(), (req, res)=>{
    // console.log("Headers:", req.headers);
    console.log("Raw body:", req.body);
    const { username, password } = req.body;

  db('users')
      .where({ username: username })
      .first()
      .then(user=> {
        if(!user){
          req.session.messages = req.session.messages || [];
          req.session.messages.push({category: 'error', message: 'Unknown username or email'});
          return res.redirect('/login');
        }
        else if(user.password !== password){
          req.session.messages = req.session.messages || [];
          req.session.messages.push({category: 'error', message: 'Incorrect password'});
          return res.redirect('/login');
        }

        req.session.user = user;

        db('users')
          .where({ id: req.session.user.id })
          .update({ last_login: new Date() });

        res.redirect('/home')
      })
      .catch(err => {
        console.error('Login error:', err);
        req.session.messages = req.session.messages || [];
        req.session.messages.push({category: 'error', message: 'An error occurred during login'});
        return res.redirect('/login');
      });
})


app.get('/login', (req, res)=>{
    res.render('login')
})

app.post('/register', upload.none(), (req, res)=>{
    const { username, password, email } = req.body;

    // First check if username exists
    db('users')
        .where({username: username})
        .first()
        .then(user => {
            if(user){
                req.session.messages = req.session.messages || [];
                req.session.messages.push({ category: 'error', message: 'Username already taken' });
                return res.redirect('/register');
            }

            // Then check if email exists
            return db('users')
                .where({email: email})
                .first()
                .then(emailUser => {
                    if(emailUser){
                        req.session.messages = req.session.messages || [];
                        req.session.messages.push({ category: 'error', message: 'Email is already in use' });
                        return res.redirect('/register');
                    }

                    if (!password || password.length < 8) {
                        req.session.messages = req.session.messages || [];
                        req.session.messages.push({ category: 'error', message: 'Password must be at least 8 characters long' });
                        return res.redirect('/register');
                    }

                    return db('users')
                        .insert({
                            username: username,
                            password: password,
                            email: email,
                            account_created: new Date(),
                        })
                        .returning('*')
                        .then((result) => {
                            const user = result[0];
                            console.log(username, user.id);
                            req.session.user = {
                                username: username,
                                id: user.id,
                            };
                            res.redirect('/home')
                        });
                });
        })
        .catch(err => {
            console.error('Registration error:', err);
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'error', message: 'An error occurred during registration' });
            res.redirect('/register');
        });
});

app.get('/register', (req, res)=>{
    res.render('register')
})

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/home');
        }
        res.redirect('/home');
    });
});


app.get('/home', (req, res)=>{
    const username = req.session.user ? req.session.user.username : 'Guest';
    res.render('home', {username: username})
})

app.get('/submit_artist', (req, res)=>{
    const username = req.session.user ? req.session.user.username : 'Guest;'
    res.render('artists', {username: username})
})

app.get('/explore', (req, res) => {
  db('artists')
    .select('*')
    .then(artists => {
      res.render('explore', { artists });
    })
    .catch(err => {
      console.error('Error fetching artists:', err);
      res.render('explore', { artists: [] });
    });
});

app.get('/a/:name', (req, res) => {
  const artistName = req.params.name;
  const user = req.session.user || null;

  let userId = 0;

  if (user && user.id && typeof user.username !== 'undefined') {
    userId = user.id;
  }

  db('artists')
      .whereRaw('LOWER(name) = LOWER(?)', [artistName])
    .first()
    .then(artist => {
      if (!artist) {
        return res.status(404).send("Artist not found");
      }

      artistData = artist;

      return db('artist_clicks')
        .insert({
          artist_id: artist.id,
          user_id: userId
        })
        .catch(err => {
          console.error("Error recording click:", err);
          return null;
        })
        .then(() => {
          return db('artist_clicks')
            .count('id as click_count')
            .where({ artist_id: artist.id })
            .first();
        })
        .then(result => {
          artist.clickCount = result ? result.click_count : 0;

          return db('albums')
              .join('artists', 'artists.id', 'albums.artist_id')
              .select('albums.*')
              .where({'artists.name': artistName})
              .then(albums=>{

                  res.render('artistDomain', {artist: artistData ,albums: albums})
              })
        });
    })
    .catch(err => {
      console.error("Error fetching artist:", err);
      res.status(500).send("Server error");
    });
});

app.post('/submit_artist', upload.single('file'), (req, res) => {
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({category: 'error', message: 'Please log in first'});
        return res.redirect('/login');
    }

    const {name, genre, about} = req.body;
    const filename = req.file ? req.file.filename : null;
    const userId = req.session.user.id;

    const missingFields = [];
    if (!name) missingFields.push('Name');
    if (!genre) missingFields.push('Genre');
    if (!about) missingFields.push('About');

    if (missingFields.length > 0) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({
            category: 'error',
            message: `The following fields are missing: ${missingFields.join(', ')}`
        });
        return res.redirect('/submit_artist');
    }

    return db('artists')
        .where({name: name})
        .first()
        .then(taken => {
            if (taken) {
                req.session.messages = req.session.messages || [];
                req.session.messages.push({category: 'error', message: `This artist name is already taken`});
                return res.redirect('/submit_artist');
            }

            return db('artists').insert({
                name,
                genre,
                about,
                image_filename: filename,
                date_added: new Date()
            }).returning('id')
                .then(result => {
                    console.log("RESULT", result);
                    if (!result || result.length === 0) {
                        throw new Error('Failed to create artist');
                    }

                    const artistId = result[0].id || result[0];
                    console.log("ARTIST:", artistId, "USER: ", userId);

                    // Add to junction table
                    return db('user_artists').insert({
                        user_id: userId,
                        artist_id: artistId
                    });
                })
                .then(() => {
                    res.redirect(`/artistsPanel/${name}`);
                })
                .catch(err => {
                    console.error('Error submitting artist:', err);
                    req.session.messages = req.session.messages || [];
                    req.session.messages.push({category: 'error', message: 'Error saving artist'});

                    if (!res.headersSent) {
                        res.redirect('/submit_artist');
                    }
                });
        });
});


app.get('/api/check-artist-name', (req, res) => {
    const name = req.query.name;

    if (!name || name.trim() === '') {
        return res.json({ available: true });
    }

    db('artists')
        .where({name: name})
        .first()
        .then(artist => {
            res.json({ available: !artist });
        })
        .catch(err => {
            console.error('Error checking artist name:', err);
            res.status(500).json({ error: 'Server error' });
        });
});

app.get('/top', (req, res) => {
  db('artist_clicks')
    .select('artists.id', 'artists.name', 'artists.genre', 'artists.image_filename')
    .count('artist_clicks.id as click_count')
    .join('artists', 'artists.id', 'artist_clicks.artist_id')
    .groupBy('artists.id')
    .orderBy('click_count', 'desc')
    .limit(10)
    .then(artists => {
        console.log('Top artists found:', artists);
      res.render('top', { artists });
    })
    .catch(err => {
      console.error('Error fetching top artists:', err);
      res.render('top', { artists: [] });
    });
});



app.get('/artistsPanel/', (req, res) => {
  if (!req.session.user) {
    req.session.messages = req.session.messages || [];
    req.session.messages.push({ category: 'error', message: 'Please log in first' });
    return res.redirect('/login');
  }

  const userId = req.session.user.id;

  db('artists')
    .join('user_artists', 'artists.id', 'user_artists.artist_id')
    .where('user_artists.user_id', userId)
    .select('artists.*')
    .then(artists => {
        console.log("Artists data:", artists.map(a => ({name: a.name, image_filename: a.image_filename})));
        if(artists.length === 1){
            return res.redirect(`/artistsPanel/${artists[0].name}`)
        }
      res.render('myartists', { artists });
    })
    .catch(err => {
      console.error('Error fetching user artists:', err);
      req.session.messages = req.session.messages || [];
      req.session.messages.push({ category: 'error', message: 'Error loading artists' });
      res.redirect('/home');
    });
});

app.get('/artistsPanel/:name', (req, res) => {
  if (!req.session.user) {
    req.session.messages = req.session.messages || [];
    req.session.messages.push({ category: 'error', message: 'Please log in first' });
    return res.redirect('/login');
  }

  const requestedArtistName = req.params.name;
  const userId = req.session.user.id;

  db('artists')
    .join('user_artists', 'artists.id', 'user_artists.artist_id')
    .where({
      'user_artists.user_id': userId,
      'artists.name': requestedArtistName,
    })
    .first()
    .select('artists.*')
    .then(artist => {
      if (!artist) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'You do not have permission to manage this artist' });
        return res.redirect('/artistsPanel');
      }

      res.render('artistsPanel', { artist });
    })
    .catch(err => {
      console.error('Error fetching artist data:', err);
      req.session.messages = req.session.messages || [];
      req.session.messages.push({ category: 'error', message: 'Error loading artist panel' });
      res.redirect('/artistsPanel');
    });
});



app.post('/tempAlbumUpload', upload.fields([{name: 'file', maxCount: 1}, {name: 'songs', maxCount: 25}]), async (req, res) => {
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'You must be logged in as an artist' });
        return res.redirect('/login');
    }

    try {
        const userId = req.session.user.id;
        const artistId = req.body.artistId;
        const artist = await db('artists')
            .join('user_artists', 'artists.id', 'user_artists.artist_id')
            .where({
                'user_artists.user_id': userId,
                'artists.id': artistId
            })
            .first('artists.id', 'artists.name');

        if (!artist) {
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'error', message: 'No artist profile found' });
            return res.redirect('/artistsPanel');
        }

        // Get form data
        const albumType = req.body.albumType;
        const albumName = req.body.AlbumName;

        const imageFile = req.files.file && req.files.file[0] ? req.files.file[0] : null;
        const songFiles = req.files.songs || [];

        let totalDuration = 0;
        const trackList = [];

        const convertedPaths = {};
        for (let i = 0; i < songFiles.length; i++) {
            try {
                const flacPath = await convert(songFiles[i]);
                console.log("Converted:", songFiles[i].filename, "to", flacPath);
                // Store the mapping of original filename to flac path
                convertedPaths[songFiles[i].filename] = path.basename(flacPath);
            } catch (error) {
                console.error("Conversion error:", error);
            }
        }

        for (const song of songFiles) {
            const songPath = path.join(uploadFolder, song.filename);
            const duration = await getSongDuration(songPath);
            totalDuration += duration;

            const flacFilename = convertedPaths[song.filename] || song.filename;

            trackList.push({
                title: path.basename(song.originalname, path.extname(song.originalname)),
                filename: flacFilename,
                length: duration
            });
        }

        // Store temp album data in session
        req.session.tempAlbum = {
            title: albumName,
            type: albumType || 'album',
            image_cover_filename: imageFile ? imageFile.filename : null,
            artist_id: artist.id,
            artist_name: artist.name,
            number_of_songs: songFiles.length,
            length: totalDuration,
            date_of_upload: new Date(),
            tracks: trackList
        };

        res.redirect('/albumPreview');

    } catch (err) {
        console.error('Error processing temp upload:', err);
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'Error processing files' });
        res.redirect('/artistsPanel');
    }
});


app.get('/albumPreview', (req, res) => {
    if (!req.session.tempAlbum) {
        return res.redirect('/artistsPanel');
    }

    db('artists')
        .where('id', req.session.tempAlbum.artist_id)
        .first()
        .then(artistData => {
            if (!artistData) {
                return res.status(404).send("Artist not found");
            }

            res.render('albumPreview', {
                album: req.session.tempAlbum,
                artist: artistData,
                tracks: req.session.tempAlbum.tracks
            });
        })
        .catch(err => {
            console.error("Error preparing album preview:", err);
            res.status(500).send("Server error");
        });
});

app.post('/confirmAlbumUpload', (req, res) => {
    if (!req.session.user || !req.session.tempAlbum) {
        return res.redirect('/artistsPanel');
    }

    const tempAlbum = req.session.tempAlbum;

    db('albums')
        .insert({
            title: tempAlbum.title,
            image_cover_filename: tempAlbum.image_cover_filename,
            artist_id: tempAlbum.artist_id,
            number_of_songs: tempAlbum.number_of_songs,
            length: Math.round(tempAlbum.length),
            date_of_upload: new Date(),
            type: tempAlbum.type
        })
        .returning('id')
        .then(result => {
            let albumId;
            if (result[0] && typeof result[0] === 'object' && 'id' in result[0]) {
                albumId = Number(result[0].id);
            } else {
                albumId = Number(result[0]);
            }

            const songPromises = tempAlbum.tracks.map((track, index) => {
                return db('songs').insert({
                    album_id: albumId,
                    title: track.title,
                    duration: Math.round(track.length),
                    track_number: index + 1,
                    file_path: track.filename,
                    date_added: new Date()
                });
            });

            return Promise.all(songPromises)
                .then(() => {
                    // Clear the temp data
                    delete req.session.tempAlbum;
                    res.redirect(`/a/${tempAlbum.type}/${tempAlbum.artist_name}/${tempAlbum.title}`);
                });
        })
        .catch(err => {
            console.error('Error confirming album upload:', err);
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'error', message: 'Error saving album' });
            res.redirect('/artistsPanel');
        });
});


app.post('/addAlbum', upload.fields([{name: 'file', maxCount: 1}, {name: 'songs', maxCount: 25}]), async (req, res) => {
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'You must be logged in as an artist' });
        return res.redirect('/artistslogin');
    }
    try {
        const imageFilename = req.files.file && req.files.file[0] ? req.files.file[0].filename : null;
        const songFiles = req.files.songs || [];
        const numberOfSongs = songFiles.length;
        const userId = req.session.user.id;

        const artistId = req.body.artistId;
        const artist = await db('artists')
            .join('user_artists', 'artists.id', 'user_artists.artist_id')
            .where({
                'user_artists.user_id': userId,
                'artists.id': artistId
            })
            .first('artists.id', 'artists.name');

        if (!artist) {
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'error', message: 'No artist profile found' });
            return res.redirect('/artistsPanel');
        }

        const albumType = req.body.albumType;
        const AlbumName = req.body.AlbumName;

        let totalDuration = 0;
        for (let i = 0; i < songFiles.length; i++) {
            const song = songFiles[i];
            const songPath = path.join(uploadFolder, song.filename);
            const duration = await getSongDuration(songPath);
            totalDuration += duration;
        }

        const convertedPaths = {};
        for (let i = 0; i < songFiles.length; i++) {
            try {
                const flacPath = await convert(songFiles[i]);
                console.log("Converted:", songFiles[i].filename, "to", flacPath);
                convertedPaths[songFiles[i].filename] = path.basename(flacPath);
            } catch (error) {
                console.error("Conversion error:", error);
            }
        }

        const result = await db('albums')
            .insert({
                title: AlbumName,
                image_cover_filename: imageFilename,
                artist_id: artistId,
                number_of_songs: numberOfSongs,
                length: Math.round(totalDuration), // Round to integer
                date_of_upload: new Date(),
                type: albumType || 'album'
            })
            .returning('id');

        let albumId;
        if (result[0] && typeof result[0] === 'object' && 'id' in result[0]) {
            albumId = Number(result[0].id);
        } else {
            albumId = Number(result[0]);
        }

        for (let i = 0; i < songFiles.length; i++) {
            const song = songFiles[i];
            const songPath = path.join(uploadFolder, song.filename);
            const duration = await getSongDuration(songPath);

            // Extract title from filename (remove extension)
            const songTitle = song.originalname.replace(/\.[^/.]+$/, "");

            await db('songs').insert({
                album_id: albumId,
                title: songTitle,
                duration: Math.round(duration),
                track_number: i + 1, // 1-based track numbering
                file_path: convertedPaths[song.filename] || song.filename.replace('.wav', '.flac'),
                date_added: new Date()
            });
        }

        res.redirect(`/a/${artist.name}`);
    } catch (err) {
        console.error('Error processing album:', err);
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'Error processing request' });
        res.redirect('/artistsPanel');
    }
});


app.get('/a/:type/:name/:title', (req, res) => {
    const {type, name: artistName, title} = req.params;

    db('artists')
        .where({ name: artistName })
        .first()
        .then(artist => {
            if (!artist) {
                return res.status(404).send("Artist not found");
            }
            return db('albums')
                .where({
                    title: title,
                    artist_id: artist.id,
                    type: type,
                })
                .first()
                .then(album => {
                    if (!album) {
                        return res.status(404).send("Album not found");
                    }

                    // Fetch all tracks for this album
                    return db('songs')
                        .where({ album_id: album.id })
                        .orderBy('track_number', 'asc')
                        .then(tracks => {
                            return db('albums')
                                .where({ artist_id: artist.id })
                                .then(allAlbums => {
                                    const regularAlbums = allAlbums.filter(a => a.type === 'album');
                                    const eps = allAlbums.filter(a => a.type === 'ep');
                                    const singles = allAlbums.filter(a => a.type === 'single');

                                    res.render('album', {
                                        artist,
                                        album,
                                        tracks,  // Pass tracks to the template
                                        regularAlbums,
                                        eps,
                                        singles,
                                        type
                                    });
                                });
                        });
                });
        })
        .catch(err => {
            console.error("Error fetching album:", err);
            res.status(500).send("Server error");
        });
});

app.get('/myaccount', (req, res) => {
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'error', message: 'Please log in first' });
        return res.redirect('/login');
    }
    const userId = req.session.user.id;

    db('users')
        .where({id: userId})
        .first()
        .then(user => {
            if (!user) {
                req.session.messages = req.session.messages || [];
                req.session.messages.push({ category: 'error', message: 'User not found' });
                return res.redirect('/login');
            }

            return db('user_artists')
                .where({user_id: userId})
                .first()
                .then(userArtist => {
                    user.is_artist = !!userArtist;

                    if (user.is_artist) {
                        return db('artists')
                            .join('user_artists', 'artists.id', 'user_artists.artist_id')
                            .where('user_artists.user_id', userId)
                            .select('artists.*')
                            .then(artistProfiles => {
                                res.render('myaccount', {
                                    user: user,
                                    artistProfiles: artistProfiles
                                });
                            });
                    } else {
                        res.render('myaccount', {
                            user: user,
                            artistProfiles: []
                        });
                    }
                });
        })
        .catch(err => {
            console.error('Error fetching user data:', err);
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'error', message: 'Error loading account information' });
            res.redirect('/home');
        });
});

app.get('/search', async (req, res) => {
    let query = req.query.q;
    let sort = req.query.sort || 'name';  // Default sort by name

    let topArtists = [];

    try {
        // Get artists with their click counts
        const artistsWithClicks = await db.raw(`
                SELECT artists.*, COUNT(artist_clicks.id) as click_count
                FROM artists
                LEFT JOIN artist_clicks ON artists.id = artist_clicks.artist_id
                GROUP BY artists.id
                ORDER BY click_count DESC
                LIMIT 10
            `);

        topArtists = artistsWithClicks.rows;

        if (!query || query === '') {
            return res.render('search', { results: [], query: '', sort, topArtists });
        }
    } catch (err) {
        console.error('Error getting top artists:', err);
    }

    try {
        const result = await db.raw('SELECT * FROM artists WHERE name ILIKE ? OR genre ILIKE ?',
            [`%${query}%`, `%${query}%`]);

        let artists = result.rows;

        if (sort === 'popularity') {
            const clicks = await db('artist_clicks')
                .whereIn('artist_id', artists.map(artist => artist.id))
                .select('artist_id')
                .count('id as click_count')
                .groupBy('artist_id');
            const clickMap = {};
            clicks.forEach(click => {
                clickMap[click.artist_id] = parseInt(click.click_count);
            });

            artists.sort((a, b) => (clickMap[b.id] || 0) - (clickMap[a.id] || 0));
        } else {
            // Default sort by name
            artists.sort((a, b) => a.name.localeCompare(b.name));
        }

        res.render('search', {
            results: artists,
            query,
            sort,
            topArtists: artists.length === 0 ? topArtists : []
        });
    } catch (err) {
        console.error('Search error:', err);
        res.render('search', { results: [], query, error: 'An error occurred', sort });
    }
});


app.get('/api/search-suggestions', (req, res) => {
    const query = req.query.q;

    if (!query || query.trim() === '') {
        return res.json([]);
    }

    db.raw('SELECT name, genre FROM artists WHERE name ILIKE ? OR genre ILIKE ? LIMIT 10',
        [`%${query}%`, `%${query}%`])
        .then(result => {
            res.json(result.rows);
        })
        .catch(err => {
            console.error('Search suggestion error:', err);
            res.status(500).json({ error: 'An error occurred' });
        });
});


app.get('/api/track/:songId', async (req, res) => {
    try {
        const songId = req.params.songId;

        const song = await db('songs')
            .where({ id: songId })
            .first();

        if (!song) {
            return res.status(404).json({ error: "Song not found" });
        }

        const album = await db('albums')
            .where({ id: song.album_id })
            .first();

        // Get artist info
        const artist = await db('artists')
            .where({ id: album.artist_id })
            .first();

        const albumSongs = await db('songs')
            .where({ album_id: song.album_id })
            .orderBy('track_number', 'asc');

        const currentTrackIndex = albumSongs.findIndex(track => track.id === parseInt(songId));

       const tracks = albumSongs.map(track => ({
           id: track.id,
           title: track.title,
           artist: artist.name,
           image: `/images/${album.image_cover_filename}`,
           audioUrl: `/images/${track.file_path.endsWith('.flac') ? track.file_path : track.file_path + '.flac'}`,
           albumType: album.type,
           albumTitle: album.title,
       }));

        res.json({
            id: parseInt(songId),
            title: song.title,
            artist: artist.name,
            audioUrl: `/images/${song.file_path.endsWith('.flac') ? song.file_path : song.file_path + '.flac'}`,
            image: `/images/${album.image_cover_filename}`,
            albumType: album.type,
            albumTitle: album.title,
            trackList: tracks,
            currentTrackIndex: currentTrackIndex
        });
    } catch (err) {
        console.error("Error in track API:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/api/album/:albumId/songs', async (req, res) => {
  try {
    const albumId = req.params.albumId;

    // Get album info
    const album = await db('albums')
      .where({ id: albumId })
      .first();

    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    // Get artist info
    const artist = await db('artists')
      .where({ id: album.artist_id })
      .first();

    // Get all songs for this album
    const songs = await db('songs')
      .where({ album_id: albumId })
      .orderBy('track_number', 'asc');

    res.json({
      album,
      artist,
      songs
    });
  } catch (err) {
    console.error("Error in album API:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/change-password', (req, res) => {
    console.log("Password change route hit!", req.body)
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'danger', message: 'You must be logged in to change your password' });
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'danger', message: 'All fields are required' });
        return res.redirect('/change-password');
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'danger', message: 'New passwords do not match' });
        return res.redirect('/change-password');
    }

    // Check password strength (at least 8 characters)
    if (newPassword.length < 8) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'danger', message: 'Password must be at least 8 characters long' });
        return res.redirect('/change-password');
    }
    console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", currentPassword, newPassword)
    // Get user from database
    db('users')
        .where({ id: userId })
        .first()
        .then(user => {
            if (!user) {
                req.session.messages = req.session.messages || [];
                req.session.messages.push({ category: 'danger', message: 'User not found' });
                return res.redirect('/login');
            }

            if (user.password !== currentPassword) {
                req.session.messages = req.session.messages || [];
                req.session.messages.push({ category: 'danger', message: 'Current password is incorrect' });
                return res.redirect('/change-password');
            }

            return db('users')
                .where({ id: userId })
                .update({ password: newPassword })
                .then(() => {
                    req.session.messages = req.session.messages || [];
                    req.session.messages.push({ category: 'success', message: 'Password changed successfully' });
                    res.redirect('/myaccount');
                })
                .catch(err => {
                    console.error('Error updating password:', err);
                    req.session.messages = req.session.messages || [];
                    req.session.messages.push({ category: 'danger', message: 'An error occurred updating your password' });
                    res.redirect('/change-password');
                });
        })
        .catch(err => {
            console.error('Error fetching user:', err);
            req.session.messages = req.session.messages || [];
            req.session.messages.push({ category: 'danger', message: 'An error occurred' });
            res.redirect('/change-password');
        });
});

app.get('/change-password', (req, res) => {
    if (!req.session.user) {
        req.session.messages = req.session.messages || [];
        req.session.messages.push({ category: 'danger', message: 'You must be logged in to change your password' });
        return res.redirect('/login');
    }

    const messages = req.session.messages || [];
    req.session.messages = [];

    res.render('change-password', {
        messages: messages,
        user: req.session.user
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

