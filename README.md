# WhatsApp Media Downloader Bot

A WhatsApp bot that allows users to search and download music from YouTube Music, Instagram posts/reels/images, and YouTube videos without watermarks.

## Features

- Search and download songs from YouTube Music
- Download Instagram posts, reels, and images
- Download YouTube videos without watermark
- Convert videos to high-quality MP3 files
- Simple command interface
- Error handling and logging
- Configurable settings

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- FFmpeg (required for audio/video conversion)
- yt-dlp (recommended for better download performance)
- A smartphone with WhatsApp installed

## Installation

1. Clone this repository:
```
git clone <repository-url>
cd <repository-folder>
```

2. Install dependencies:
```
npm install
```

3. Install FFmpeg (if not already installed):
   - Windows: Download from https://ffmpeg.org/download.html
   - Ubuntu/Debian: `sudo apt install ffmpeg`
   - Termux: `pkg install ffmpeg`

4. Run the bot:
```
npm start
```

5. Scan the QR code with WhatsApp to link your device:
   - Open WhatsApp on your phone
   - Tap Menu or Settings and select WhatsApp Web/Linked Devices
   - Point your phone to scan the QR code on your screen

## Usage

The bot responds to the following commands:

- `!music [song name]` - Search and download a song
  Example: `!music Shape of You`

- `!ig [instagram-url]` - Download Instagram posts, reels, or images
  Example: `!ig https://www.instagram.com/reel/ABC123/`

- `!yt [youtube-url]` - Download YouTube videos without watermark
  Example: `!yt https://youtu.be/ABC123`

- `!help` - Show available commands

- `!ping` - Check if the bot is online

## Project Structure

- `index.js` - Main bot application
- `config.js` - Configuration settings
- `errorHandler.js` - Error handling utilities
- `utils.js` - Helper functions
- `downloads/` - Directory for temporary downloads
- `temp/` - Directory for temporary processing files

## Configuration

You can customize the bot by editing the `config.js` file:

- Change command prefixes
- Adjust audio/video quality settings
- Customize messages

## Error Handling

The bot includes comprehensive error handling for:
- Search failures
- Download issues
- File conversion problems
- Size limit handling

## Technologies Used

- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [ytmusic-api](https://github.com/zS1L3NT/ts-npm-ytmusic-api) - YouTube Music API to search for songs
- [yt-dlp-wrap](https://github.com/yajuu-senpai/yt-dlp-wrap) - Wrapper for yt-dlp
- [ytdl-core](https://github.com/ytdl-org/ytdl-core) - YouTube video downloader
- [play-dl](https://github.com/play-dl/play-dl) - YouTube audio extraction
- [FFmpeg](https://ffmpeg.org/) - Media processing

## Notes

- This bot is for educational purposes only
- Respect copyright laws and terms of service
- Downloaded files are temporarily stored and automatically deleted after sending
- The bot is designed for personal use only
- For Instagram downloads, the content must be public
- Video size is limited to around 15MB for WhatsApp transfer 