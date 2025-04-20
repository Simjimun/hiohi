/**
 * Configuration for the WhatsApp Music Bot
 */

module.exports = {
  // Bot session name
  sessionName: 'music-bot',
  
  // Bot settings
  multidevice: true,
  headless: 'new',
  useChrome: false,
  
  // Command prefix
  commandPrefix: '!',
  
  // Commands
  commands: {
    music: 'music',
    help: 'help',
    ping: 'ping',
    cancel: 'cancel',
    instagram: 'ig',
    ytVideo: 'yt'
  },
  
  // Audio settings
  audio: {
    bitrate: 128,
    format: 'mp3',
    quality: 'highestaudio'
  },
  
  // Instagram settings
  instagram: {
    // Set to true to use authentication for private content
    useAuthentication: true
  },
  
  // Proxy settings
  proxy: {
    // Set to true to use proxies for downloads
    useProxy: true,
    // Current active proxy index in the list
    currentIndex: 0,
    // List of proxies in format: IP:PORT:USERNAME:PASSWORD
    list: [
      '95.134.151.66:6667:rpszuwej1:mpkovnvf1',
      '95.134.88.8:6667:irkoqmqj1:rdumbuto1',
      '95.134.134.87:6667:fkmaebgv1:ovpctrjk1',
      '95.134.128.115:6667:xmanmgjf1:ieegodwd1',
      '156.228.210.80:6666:tcegufzy1:vqcleplg1'
    ]
  },
  
  // Messages
  messages: {
    welcome: '👋 Welcome to the Music Bot! \n\n' +
             'Use the following commands:\n' +
             '!music [song name] - Search for songs\n' +
             '!ig [instagram-url] - Download Instagram posts/reels/images\n' +
             '!yt [youtube-url] - Download YouTube videos without watermark\n' +
             '!cancel - Cancel current search\n' +
             '!help - Show all commands\n' +
             '!ping - Check if bot is online',
    help: '🎵 *WhatsApp Media Bot* 🎵\n\n' +
          'Commands:\n' +
          '!music [song name] - Search for songs\n' +
          '!ig [instagram-url] - Download Instagram posts/reels/images\n' +
          '!yt [youtube-url] - Download YouTube videos without watermark\n' +
          '!cancel - Cancel current search\n' +
          '!help - Show this help message\n' +
          '!ping - Check if bot is online',
    noQuery: 'Please provide a song name or URL. Example: !music Shape of You or !ig https://www.instagram.com/reel/...',
    searching: '🔍 Searching for "{query}"...',
    noResults: '❌ No results found for "{query}".',
    found: '🎵 Found: {title} - {artist}\n⏳ Downloading...',
    downloading: '⏳ Downloading your media from {source}...',
    igInvalid: '❌ Invalid Instagram link. Please provide a valid Instagram post, reel, or image URL.',
    ytInvalid: '❌ Invalid YouTube link. Please provide a valid YouTube video URL.',
    igPrivate: '⚠️ This Instagram content is private. Please make sure to provide browser cookies from an account that can access this content.',
    igLoginFailed: '⚠️ Instagram authentication failed. Please try sending a fresh cookie file exported from your browser.'
  }
}; 