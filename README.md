# IgiFy
#### Video Demo:  https://www.youtube.com/watch?v=CKMoGfJtO0g&ab_channel=IgnacyMr%C3%B3z
#### Description: A music platform for everyone.
# app.js - Core Application File

The `app.js` file serves as the main server file for IgiFy, handling all routes, database interactions, and business logic.

## Required Packages

- **express**
- **knex**
- **express-session**
- **multer**
- **fs**
- **path**
- **child_process**
- **express-ejs-layouts**


## Database Configuration

The application connects to a PostgreSQL database with configuration for local development.

## Main Routes

### Authentication
- `/login`, `/register`, `/logout` - User authentication endpoints
- `/myaccount`, `/change-password` - User account management

### Artist Management
- `/submit_artist` - Form for creating artist profiles
- `/artistsPanel` - Dashboard for managing artist content
- `/artistsPanel/:name` - Specific artist management panel

### Music Content
- `/a/:name` - Artist profile page
- `/a/:type/:name/:title` - Album/EP/Single page
- `/addAlbum`, `/tempAlbumUpload`, `/confirmAlbumUpload` - Album creation workflow
- `/albumPreview` - Preview page for album uploads

### Discovery
- `/explore` - Browse all artists
- `/search` - Search for artists and music
- `/top` - View most popular artists

### API Endpoints
- `/api/track/:songId` - Retrieve track information
- `/api/album/:albumId/songs` - Get all songs for an album
- `/api/check-artist-name` - Check availability of artist names
- `/api/search-suggestions` - Autocomplete for search

## Key Functions

- **Audio Processing**: Converts uploaded WAV files to FLAC format 
- **File Management**: Handles image and audio file uploads
- **Song Duration**: Uses ffprobe to calculate track lengths
- **Session Management**: Tracks user login state and permissions
- **Error Handling**: Flash messages for user feedback

# convert.sh - Audio Conversion Script

`convert.sh` is a shell script used in the IgiFy application to convert audio files from WAV format to the more disk space efficient FLAC format.


# public/javascripts/ajax-navigation.js - Client-Side Navigation Module

`ajax-navigation.js` provides single-page application (SPA) behavior to IgiFy, enabling smooth transitions between pages without full browser reloads.

# public/javascripts/mini-player.js - Music Player Module

`mini-player.js` provides persistent audio playback functionality for IgiFy, creating a consistent music listening experience across page navigation.


# public/javascripts/audio-controller.js - Centralized Audio Management

`audio-controller.js` provides a centralized management system for audio playback across the IgiFy application, coordinating between different player instances and maintaining a consistent playback state.

# CSS Stylesheets for IgiFy

## mini-player.css

## mini-player.css

* Fixed bottom positioning for persistent display
* Three-column layout (track info, playback controls, and volume)
* Responsive design that adapts to different screen sizes
* Custom-styled controls with visual feedback animations
* Shadow effects for visual depth and separation
* Smooth transitions for player visibility changes
* Text overflow handling for track and artist names



# View Templates Overview

## artists.ejs
- Form for submitting new artists
- Fields for name, genre, about, and optional image upload
- Real-time artist name availability checking via API

## artistslogin.ejs
- Simple login form specifically for artist access
- Contains fields for artist username and password

## artistsPanel.ejs
- Dashboard for artists to manage their profile
- Interface to add new music releases (albums, EPs, singles)
- File upload for album covers and songs (WAV format)
- Preview functionality for albums before release

## change-password.ejs
- Form for users to update their password
- Validation for current password and new password fields
- Success/error message display

## explore.ejs
- Grid display of all artists in the system
- Artist cards with images, names, and genres
- Navigation to individual artist profiles

## home.ejs
- Main landing page with navigation cards
- Links to key sections (Explore, Most Popular, Search, etc.)
- Conditional UI elements based on login status

## layout.ejs
- Main template with header, footer, and navigation
- Includes mini-player component
- CSS styles for consistent site appearance
- Script loading for JavaScript functionality

## login.ejs
- User authentication form
- Links to registration and password reset
- Error/success message display

## myaccount.ejs
- Personal user information display
- Artist profile management for artist users
- Account settings (password change, logout)

## myartists.ejs
- Grid display of artists managed by the current user
- Links to individual artist management panels
- Option to create new artist profiles

## opening.ejs
- Project introduction page
- Author and project information
- Entry point to main website

## search.ejs
* Search interface with real-time artist suggestions and auto-complete
* Display of search results with artist cards
* Top Artists ranking section with sorting controls

## top.ejs
* Grid display of most popular artists ranked by views
* Artist cards with position badges and circular images
* Visual hover effects with responsive grid layout

## album.ejs
* Individual album page with dynamic track listing and play buttons
* Album metadata and cover art with fallback images
* "Play Album" button with audio controller integration

## albumPreview.ejs
* Preview interface with "PREVIEW" badge before confirming uploads
* Album metadata and track listing preview
* Confirmation and cancel options for upload workflow

## artistDomain.ejs
* Artist profile with image, bio, and view counter
* Separate sections for albums, EPs, and singles
* Responsive grid layout for music releases with details

## player.ejs
* Full-page audio player with track artwork and animations
* Large playback controls with track position indicator
* Integration with audio controller and mini-player hiding

## register.ejs
* User registration form with validation
* Success/error notification system
* Navigation link to login for existing users

## mini-player.ejs
* Persistent audio player with three-section layout
* Progress bar with time display and seek functionality
* Playback controls with track metadata display