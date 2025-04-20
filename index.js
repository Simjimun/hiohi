const playDl = require('play-dl');
const YTMusic = require('ytmusic-api');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ytdl = require('@distube/ytdl-core');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const FormData = require('form-data');
const { handleError, SearchError, DownloadError, ConversionError, checkConnection } = require('./errorHandler');
const config = require('./config');
const YTDlpWrap = require('yt-dlp-wrap').default;
const youtubeDl = require('youtube-dl-exec');
const { 
  ensureDirectoryExists, 
  sanitizeFilename, 
  formatDuration,
  cleanupFile,
  getFileSizeMB
} = require('./utils');

// Check for lock file to prevent multiple instances
const LOCK_FILE = path.join(process.cwd(), '.bot.lock');

try {
  // Forcefully remove any existing lock file
  if (fs.existsSync(LOCK_FILE)) {
    console.log('🔄 Removing existing lock file...');
    try {
      fs.unlinkSync(LOCK_FILE);
      console.log('✅ Lock file removed successfully.');
    } catch (e) {
      console.error('❌ Failed to remove lock file:', e);
      console.error('Please manually remove the lock file:');
      console.error(`  > del "${LOCK_FILE}"`);
      process.exit(1);
    }
  }
  
  // Create lock file
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    timestamp: Date.now()
  }));
  
  // Remove lock file on exit
  process.on('exit', () => {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch (e) {
      console.error('Failed to remove lock file:', e);
    }
  });
  
  // Also catch termination signals
  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\n🛑 Bot shutting down due to ${signal}...`);
      try {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
        }
      } catch (e) {
        console.error('Failed to remove lock file:', e);
      }
      process.exit(0);
    });
  });
  
} catch (e) {
  console.error('Error setting up lock file:', e);
}

// ===== Replace with Baileys imports =====
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
// =========================================

// WhatsApp Music Bot - Baileys Implementation

// Store user search results for selection
const userSearchResults = new Map();
const searchCache = new Map();
const CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour

console.log('Starting WhatsApp Music Bot with Baileys...');

// Environment detection
const platform = os.platform();
const isTermux = platform === 'android' || fs.existsSync('/data/data/com.termux');
const isUbuntu = platform === 'linux' && (fs.existsSync('/etc/lsb-release') || execSync('uname -a').toString().toLowerCase().includes('ubuntu'));

// Log environment details
console.log(`Detected environment: ${isTermux ? 'Termux (Android)' : isUbuntu ? 'Ubuntu' : platform}`);

// Memory limits based on environment
let memoryLimitMB;
if (isTermux) {
  // Termux typically has limited resources
  memoryLimitMB = Math.min(512, Math.floor(os.freemem() / (1024 * 1024 * 3))); // 1/3 of free memory or max 512MB
  console.log('Applying Termux-specific optimizations (reduced memory usage)');
} else if (isUbuntu) {
  // Ubuntu server can handle more, but still be conservative
  memoryLimitMB = Math.min(1024, Math.floor(os.freemem() / (1024 * 1024 * 2))); // Half of free memory or max 1GB
  console.log('Applying Ubuntu-specific optimizations');
} else {
  // Default for other environments
  memoryLimitMB = Math.min(768, Math.floor(os.freemem() / (1024 * 1024 * 2))); // Half of free memory or max 768MB
}

console.log(`Memory limit set to: ${memoryLimitMB}MB`);

// Check for FFmpeg installation
try {
  const ffmpegVersion = execSync('ffmpeg -version').toString();
  console.log('System FFmpeg detected:', ffmpegVersion.split('\n')[0]);
} catch (error) {
  console.error('ERROR: FFmpeg is not installed or not in PATH');
  console.error('Please install FFmpeg before running this bot');
  console.error('- Termux: pkg install ffmpeg');
  console.error('- Ubuntu: apt install ffmpeg');
  console.error('- Windows: download from https://ffmpeg.org/download.html');
  process.exit(1);
}

// Resource configuration - adjust based on environment
const CONVERSION_TIMEOUT = isTermux ? 2 * 60 * 1000 : 4 * 60 * 1000; // 2 minutes for Termux, 4 minutes otherwise
const MAX_CONCURRENT_DOWNLOADS = isTermux ? 1 : Math.max(1, Math.min(3, Math.floor(os.cpus().length / 2))); // Single download for Termux
const MAX_FILE_SIZE_MB = isTermux ? 25 : 50; // Smaller files for Termux to prevent memory issues

// Ensure directories exist with cross-platform path handling
const downloadsDir = ensureDirectoryExists(path.join('.', 'downloads'));
const tempDir = ensureDirectoryExists(path.join('.', 'temp'));
console.log('Downloads directory:', downloadsDir);
console.log('Temp directory:', tempDir);

// Download queue management
let activeDownloads = 0;
const downloadQueue = [];

// Resource usage cleanup - run every 15 minutes

setInterval(() => {
  // Clear old cached searches
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRY) {
      searchCache.delete(key);
    }
  }
  
  // Clean temporary directory if it exists
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        try {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          // Remove files older than 2 hours
          if (now - stats.mtime.getTime() > 2 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old temp file: ${filePath}`);
          }
        } catch (err) {
          console.error(`Error cleaning temp file: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error during cleanup: ${err.message}`);
  }
}, 15 * 60 * 1000);

// Initialize YouTube Music API
const ytmusic = new YTMusic();
console.log('YTMusic instance created');

// Setup message store for Baileys
const store = makeInMemoryStore({ 
  logger: pino().child({ level: 'silent', stream: 'store' }) 
});

// Configure yt-dlp
let ytDlp = null;
try {
  ytDlp = new YTDlpWrap();
  console.log('yt-dlp wrapper initialized');
  
  // Test if yt-dlp is working by getting the version
  ytDlp.getVersion()
    .then(version => {
      console.log(`yt-dlp version: ${version}`);
    })
    .catch(error => {
      console.log(`yt-dlp version check failed: ${error.message}`);
    });
} catch (error) {
  console.error(`❌ Error initializing yt-dlp: ${error.message}`);
}

// Function to mark bot as ready and initialize any startup tasks
async function start(client) {
  console.log('🤖 WhatsApp Music Bot is ready to use!');
  console.log('📱 Send !help to the bot for a list of commands');
}

// Initialize and start Baileys connection
async function connectToWhatsApp() {
  // Create authentication state
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  // Fetch the latest version of Baileys
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`🔄 Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);
  
  // Set up logger options - set to 'info' for more verbose logging or 'silent' for quieter logs
  const logger = pino({ level: 'warn' });
  
  // Create the WhatsApp socket client with better reconnection handling
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['WhatsApp Music Bot', 'Chrome', '103.0.5060.114'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 2500,
    qrTimeout: 40000, // Increase QR timeout
    defaultQueryTimeoutMs: 60000, // Increase default query timeout
    emitOwnEvents: false, // Prevent duplicate events
    markOnlineOnConnect: false, // Don't mark as online immediately
    getMessage: async key => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return {
        conversation: 'Hello!'
      };
    }
  });
  
  // Bind the store to the socket
  store.bind(sock.ev);
  
  // Handle connection updates with reconnection limit to prevent infinite loops
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let reconnectTimer = null;
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp!');
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      // Start the bot functionality after connection
      await start(sock);
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                              statusCode !== 409 && // Don't reconnect on conflict (409)
                              statusCode !== 440; // Don't reconnect on protocol error (440)
      
      console.log(`⚠️ Connection closed due to ${lastDisconnect?.error?.message || 'unknown error'} (code: ${statusCode})`);
      
      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = reconnectAttempts * 5000; // Increasing delay between attempts
        
        console.log(`🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay/1000} seconds...`);
        
        // Clear any existing timer
        if (reconnectTimer) clearTimeout(reconnectTimer);
        
        // Set up delayed reconnection
        reconnectTimer = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connectToWhatsApp().catch(err => console.error('❌ Failed to reconnect:', err));
        }, delay);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('❌ Maximum reconnection attempts reached. Please restart the bot manually.');
        
        // Clean up auth info to force new login
        try {
          console.log('🧹 Cleaning up session data...');
          const authPath = path.join(process.cwd(), 'auth_info_baileys');
          if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('✅ Session data cleaned up. Please restart the bot.');
          }
        } catch (err) {
          console.error('❌ Failed to clean up session:', err);
        }
      } else {
        console.log('❌ Connection closed permanently. Not reconnecting.');
      }
    }
    
    // Show when the QR code is displayed
    if (qr) {
      console.log('📱 QR Code received, please scan with WhatsApp!');
    }
  });
  
  // Save credentials whenever they are updated
  sock.ev.on('creds.update', saveCreds);
  
  // Listen for messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const message of messages) {
      // Only process non-notification messages
      if (!message.message) continue;
      
      // Convert message format to a compatible format for existing handlers
      const formattedMessage = {
        from: message.key.remoteJid,
        isGroupMsg: message.key.remoteJid.endsWith('@g.us'),
        type: message.message.conversation ? 'chat' : 'other',
        body: message.message.conversation || message.message.extendedTextMessage?.text || '',
        key: message.key
      };
      
      // Log the message for debugging
      console.log('📩 Message received:', {
        from: formattedMessage.from,
        isGroup: formattedMessage.isGroupMsg,
        type: formattedMessage.type,
        body: formattedMessage.body
      });
      
      // Only process private chat messages (not groups or status)
      if (!formattedMessage.isGroupMsg && formattedMessage.type === 'chat' && !formattedMessage.from.includes('status')) {
        // Handle the message with our existing functions
        try {
          await handleIncomingMessage(sock, formattedMessage);
        } catch (error) {
          console.error('❌ Error handling message:', error);
        }
      }
    }
  });
}

// Start the Baileys connection
connectToWhatsApp().catch(err => console.error('❌ Unexpected error:', err));

// Helper function to send messages using Baileys
async function sendMessage(client, to, text) {
  if (!client || typeof client.sendMessage !== 'function') {
    console.error('❌ Invalid client object - missing sendMessage function:', client);
    throw new Error('Invalid client object - missing sendMessage function');
  }
  
  if (!to || typeof to !== 'string') {
    console.error('❌ Invalid recipient:', to);
    throw new Error('Invalid recipient');
  }
  
  if (!text) {
    console.error('❌ Empty message text');
    text = '...'; // Default to something not empty
  }
  
  try {
    console.log(`📤 Sending message to ${to}`);
    return await client.sendMessage(to, { text: text });
  } catch (error) {
    console.error(`❌ Error sending message to ${to}:`, error.message);
    throw error;
  }
}

// Add these variables at the global scope near the top of the file
let instagramCookieFile = null;
let isInstagramLoggedIn = false;

// Function to handle Instagram login
async function handleInstagramLogin(client, message) {
  try {
    // Send message explaining cookies-only approach
    await sendMessage(
      client,
      message.from,
      "ℹ️ Instagram login now works with browser cookies only. The bot will automatically detect and import Instagram cookie files you send."
    );
    
    return false;
  } catch (error) {
    console.error(`❌ Instagram login error: ${error.message}`);
    await sendMessage(
      client,
      message.from,
      `❌ Instagram login error: ${error.message}`
    );
    return false;
  }
}

/**
 * Saves Instagram cookies from a message to a file
 */
async function saveInstagramCookies(client, message, cookieData) {
  try {
    const timestamp = Date.now();
    const cookieFileName = `instagram_cookies_${timestamp}.txt`;
    instagramCookieFile = path.join(tempDir, cookieFileName);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write cookie data to file
    fs.writeFileSync(instagramCookieFile, cookieData);
    isInstagramLoggedIn = true;
    
    console.log(`✅ Instagram cookies saved to: ${instagramCookieFile}`);
    await sendMessage(
      client,
      message.from,
      { text: '✅ Instagram cookies successfully imported! You can now download Instagram content without manual login.' }
    );
    return true;
  } catch (error) {
    console.error('❌ Error saving Instagram cookies:', error);
    await sendMessage(
      client,
      message.from,
      { text: '❌ Failed to save Instagram cookies. Please try again.' }
    );
    return false;
  }
}

// Modify handleIncomingMessage to process the cookies
async function handleIncomingMessage(client, message) {
  try {
    // Log the message sender
    console.log(`Message from: ${message.from}`);
    
    // Check if message body contains cookie data
    if (message.body && 
        message.body.includes('# Netscape HTTP Cookie File') && 
        message.body.includes('.instagram.com')) {
      console.log('📝 Instagram cookie data detected in message');
      await saveInstagramCookies(client, message, message.body);
      return;
    }
    
    // Skip processing if it's a group message and not mentioning the bot
    if (message.isGroupMsg) {
      const mentionedMe = message.mentionedIds && message.mentionedIds.includes(client.user.id);
      if (!mentionedMe) {
        return;
      }
    }
    
    // Extract clean message (remove mention if present)
    let cleanMessage = message.body;
    if (message.body.startsWith('@')) {
      const firstSpaceIndex = message.body.indexOf(' ');
      if (firstSpaceIndex !== -1) {
        cleanMessage = message.body.substring(firstSpaceIndex + 1).trim();
      }
    }
    
    // Check if this is a song selection response (numbers 1-5)
    if (/^[1-5]$/.test(cleanMessage) && userSearchResults.has(message.from)) {
      const selection = parseInt(cleanMessage) - 1; // Convert to 0-based index
      await downloadAndSendSong(client, message, selection);
      return;
    }
    
    // Process commands
    if (cleanMessage.startsWith('!ig ')) {
      const url = cleanMessage.substring(4).trim();
      await handleInstagramDownload(client, message, url);
    } else if (cleanMessage === '!iglogin') {
      await handleInstagramLogin(client, message);
    } else if (cleanMessage.startsWith('!yt ')) {
      const url = cleanMessage.substring(4).trim();
      await handleYoutubeDownload(client, message, url);
    } else if (cleanMessage.startsWith('!music ')) {
      const query = cleanMessage.substring(7).trim();
      await handleMusicDownload(client, message, query);
    } else if (cleanMessage === '!help') {
      await sendHelpMessage(client, message);
    } else {
      // Handle regular messages (non-commands)
      await handleRegularMessage(client, message, cleanMessage);
    }
  } catch (error) {
    console.error('❌ Error handling message:', error);
    await sendMessage(
      client,
      message.from,
      '❌ An error occurred processing your message. Please try again.'
    );
  }
}

// Function to handle regular text messages (not commands)
async function handleRegularMessage(client, message, text) {
  try {
    // If the message is a greeting
    const greetings = ['hi', 'hello', 'hey', 'hola', 'namaste'];
    if (greetings.some(greeting => text.toLowerCase().includes(greeting))) {
      await sendMessage(
        client,
        message.from,
        '👋 Hello! I am a WhatsApp bot that can download videos from Instagram and YouTube. Send !help to see available commands.'
      );
      return;
    }
    
    // Default response for other messages
    await sendMessage(
      client,
      message.from,
      'I can help you download videos from Instagram and YouTube. Send !help to see available commands.'
    );
  } catch (error) {
    console.error('❌ Error handling regular message:', error);
  }
}

// Function to send help message
async function sendHelpMessage(client, message) {
  const helpText = `📱 *WhatsApp Media Bot Help*\n\n` +
                  `*Available Commands:*\n\n` +
                  `🎵 *!music [song name]* - Search and download a song (shows options to choose)\n` +
                  `🎬 *!yt [url]* - Download a YouTube video\n` +
                  `📸 *!ig [url]* - Download Instagram photo/video\n` +
                  `🔑 *!iglogin* - Login to Instagram (for private content)\n` +
                  `❓ *!help* - Show this help message\n\n` +
                  `*How to download music:*\n1. Send !music [song name]\n2. Choose a song by replying with its number\n3. Wait for download to complete`;
  
  await sendMessage(client, message.from, helpText);
}

// Helper function to send media (images/videos)
async function sendMedia(client, to, filePath) {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    
    console.log(`📤 Sending media (${fileExt}) file: ${filePath} (${fileSizeMB.toFixed(2)} MB)`);
    
    if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
      // Send as image
      await client.sendMessage(to, {
        image: fs.readFileSync(filePath),
        caption: `📷 Downloaded from Instagram (${fileSizeMB.toFixed(2)} MB)`
      });
      console.log('✅ Image sent successfully');
    } else if (fileExt === '.mp4') {
      // Send as video
      await client.sendMessage(to, {
        video: fs.readFileSync(filePath),
        caption: `🎬 Downloaded from Instagram (${fileSizeMB.toFixed(2)} MB)`,
        gifPlayback: false
      });
      console.log('✅ Video sent successfully');
    } else {
      console.log(`❌ Unsupported media type: ${fileExt}`);
      throw new Error(`Unsupported media type: ${fileExt}`);
    }
  } catch (error) {
    console.error(`❌ Error sending media: ${error.message}`);
    throw error;
  }
}

// Helper function to send files
async function sendFile(client, to, filePath, fileName) {
  try {
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    
    console.log(`📤 Sending file: ${filePath} (${fileSizeMB.toFixed(2)} MB)`);
    
    await client.sendMessage(to, {
      document: fs.readFileSync(filePath),
      mimetype: 'application/octet-stream',
      fileName: fileName || path.basename(filePath),
      caption: `📄 Downloaded from Instagram (${fileSizeMB.toFixed(2)} MB)`
    });
    
    console.log('✅ File sent successfully');
  } catch (error) {
    console.error(`❌ Error sending file: ${error.message}`);
    throw error;
  }
}

// Update the Instagram download function to use the persistent cookies
async function handleInstagramDownload(client, message, url) {
  try {
    const timestamp = Date.now();
    
    // Validate URL
    if (!url || (!url.includes('instagram.com/') && !url.includes('instagr.am/'))) {
      await sendMessage(
        client,
        message.from,
        '❌ Invalid Instagram URL. Please provide a valid Instagram URL.'
      );
      return;
    }
    
    // Send initial status message
    await sendMessage(
      client,
      message.from,
      '⏳ Processing Instagram URL...'
    );
    
    // Create download directory
    const downloadDir = path.join(tempDir, `ig_${timestamp}`);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    // Prepare yt-dlp command
    let ytdlpArgs = [
      '-f', 'best',
      '-o', path.join(downloadDir, '%(title)s.%(ext)s'),
      '--no-warnings',
      '--no-check-certificate',
      url
    ];
    
    // Add cookies if available
    if (isInstagramLoggedIn && instagramCookieFile && fs.existsSync(instagramCookieFile)) {
      ytdlpArgs.push('--cookies', instagramCookieFile);
    } else {
      console.log('⚠️ No Instagram cookies available. Trying to download without authentication.');
    }
    
    console.log(`📥 Downloading Instagram content: ${url}`);
    console.log(`Command: yt-dlp ${ytdlpArgs.join(' ')}`);
    
    // Execute yt-dlp command
    const ytdlp = spawn('yt-dlp', ytdlpArgs);
    let output = '';
    
    ytdlp.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk);
    });
    
    ytdlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.error(chunk);
    });
    
    ytdlp.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error(`❌ yt-dlp exited with code ${code}`);
          
          // Handle common Instagram errors
          if (output.includes('This content is private')) {
            await sendMessage(
              client,
              message.from,
              '❌ This Instagram content is private. You need to be logged in and following this account to access it.'
            );
          } else if (output.includes('login')) {
            isInstagramLoggedIn = false;
            await sendMessage(
              client,
              message.from,
              '❌ Instagram login required or session expired. Please send Instagram cookies.'
            );
          } else {
            await sendMessage(
              client,
              message.from,
              `❌ Failed to download Instagram content. Error code: ${code}`
            );
          }
          
          // Clean up directory even on error
          try {
            fs.rmSync(downloadDir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up Instagram download directory: ${downloadDir}`);
          } catch (cleanupError) {
            console.error(`❌ Error cleaning up directory: ${cleanupError.message}`);
          }
          return;
        }
        
        // Find downloaded files
        const files = fs.readdirSync(downloadDir);
        if (files.length === 0) {
          await sendMessage(
            client,
            message.from,
            '❌ No media found at this Instagram URL.'
          );
          
          // Clean up empty directory
          try {
            fs.rmSync(downloadDir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up Instagram download directory: ${downloadDir}`);
          } catch (cleanupError) {
            console.error(`❌ Error cleaning up directory: ${cleanupError.message}`);
          }
          return;
        }
        
        // Process and send each file
        for (const file of files) {
          const filePath = path.join(downloadDir, file);
          const fileSize = fs.statSync(filePath).size / (1024 * 1024); // MB
          
          if (fileSize > 100) {
            await sendMessage(
              client,
              message.from,
              `❌ File ${file} is too large (${fileSize.toFixed(2)} MB). WhatsApp limit is 100 MB.`
            );
            continue;
          }
          
          const fileExt = path.extname(file).toLowerCase();
          if (['.mp4', '.jpg', '.jpeg', '.png'].includes(fileExt)) {
            // Send as media
            await sendMedia(client, message.from, filePath);
          } else {
            // Send as file
            await sendFile(client, message.from, filePath, file);
          }
        }
        
        // Send success message
        await sendMessage(
          client,
          message.from,
          '✅ Instagram download complete!'
        );
        
        // Clean up
        try {
          fs.rmSync(downloadDir, { recursive: true, force: true });
          console.log(`🧹 Cleaned up Instagram download directory: ${downloadDir}`);
        } catch (cleanupError) {
          console.error(`❌ Error cleaning up directory: ${cleanupError.message}`);
        }
      } catch (sendError) {
        console.error(`❌ Error processing Instagram download: ${sendError.message}`);
        
        // If processing fails, notify the user
        await sendMessage(
          client,
          message.from,
          `⚠️ Failed to process Instagram content: ${sendError.message}`
        );
        
        // Clean up on error
        try {
          fs.rmSync(downloadDir, { recursive: true, force: true });
          console.log(`🧹 Cleaned up Instagram download directory: ${downloadDir}`);
        } catch (cleanupError) {
          console.error(`❌ Error cleaning up directory: ${cleanupError.message}`);
        }
      }
    });
  } catch (error) {
    console.error(`❌ Instagram download error: ${error.message}`);
    await sendMessage(
      client,
      message.from,
      `⚠️ Failed to download from Instagram: ${error.message}\n\nPlease make sure the content is available and the URL is correct.`
    );
  }
}

// Function to handle music downloads
async function handleMusicDownload(client, message, query) {
  try {
    // Validate query
    if (!query) {
      await sendMessage(
        client,
        message.from,
        '❌ Please provide a song name. Example: !music Shape of You'
      );
      return;
    }
    
    // Send initial status message
    await sendMessage(
      client,
      message.from,
      `🔍 Searching for "${query}"...`
    );
    
    // First, init YT Music API if needed
    if (!ytmusic.initialized) {
      await ytmusic.initialize();
    }
    
    // Search for the song
    console.log(`🔍 Searching for music: "${query}"`);
    const searchResults = await ytmusic.searchSongs(query);
    
    if (!searchResults || searchResults.length === 0) {
      await sendMessage(
        client,
        message.from,
        `❌ No songs found for "${query}". Please try a different search term.`
      );
      return;
    }
    
    // Log entire search results for debugging
    console.log('Full search results:', JSON.stringify(searchResults, null, 2));
    
    // Store search results for this user
    userSearchResults.set(message.from, searchResults.slice(0, 5)); // Store top 5 results
    
    // Create selection message
    let selectionMessage = `🎵 *Found ${Math.min(5, searchResults.length)} results for "${query}"*\n\nReply with the number to download:\n\n`;
    
    // Add each result with number
    searchResults.slice(0, 5).forEach((song, index) => {
      // Extract artist name with improved handling
      let artistNames = extractArtistNames(song);
      
      const duration = song.duration ? formatDuration(song.duration) : 'Unknown';
      
      selectionMessage += `*${index + 1}.* ${song.name || 'Unknown Title'} - ${artistNames} (${duration})\n`;
    });
    
    selectionMessage += '\nReply with a number 1-' + Math.min(5, searchResults.length);
    
    // Send selection message
    await sendMessage(client, message.from, selectionMessage);
    
    return;
  } catch (error) {
    console.error(`❌ Music search error: ${error.message}`);
    await sendMessage(
      client,
      message.from,
      `⚠️ Failed to search for music: ${error.message}`
    );
  }
}

// Helper function to extract artist names from song data
function extractArtistNames(song) {
  try {
    // Log the song object structure for debugging
    console.log(`Extracting artist from song:`, JSON.stringify(song, null, 2));
    
    // Case 1: Array of artist objects with name property
    if (song.artists && Array.isArray(song.artists) && song.artists.length > 0) {
      const artistArr = song.artists.map(artist => {
        return (artist && artist.name) ? artist.name : 'Unknown';
      });
      return artistArr.join(', ');
    }
    
    // Case 2: Single artist object
    if (song.artist && song.artist.name) {
      return song.artist.name;
    }
    
    // Case 3: Check if there's a simple artist string property
    if (song.artist && typeof song.artist === 'string') {
      return song.artist;
    }
    
    // Case 4: Try to extract artist from title if it contains a dash
    if (song.name && song.name.includes('-')) {
      const parts = song.name.split('-').map(p => p.trim());
      if (parts.length >= 2) {
        return parts[0]; // First part before dash is usually artist
      }
    }
    
    // Case 5: Look for artist in channel name if available
    if (song.channel && song.channel.name) {
      return song.channel.name;
    }
    
    // Fallback
    return 'Unknown Artist';
  } catch (err) {
    console.error('Error extracting artist names:', err);
    return 'Unknown Artist';
  }
}

// Function to download and send the selected song
async function downloadAndSendSong(client, message, songIndex) {
  try {
    // Get stored search results for this user
    const searchResults = userSearchResults.get(message.from);
    
    if (!searchResults || !searchResults[songIndex]) {
      await sendMessage(
        client,
        message.from,
        '❌ Invalid selection or your search results expired. Please search again with !music [song name]'
      );
      return;
    }
    
    const song = searchResults[songIndex];
    console.log('Selected song data:', JSON.stringify(song, null, 2));
    
    // Use the common artist extraction helper function
    const artistNames = extractArtistNames(song);
    console.log(`Artist names extracted: "${artistNames}"`);
    
    // Send status update
    await sendMessage(
      client,
      message.from,
      `🎵 Downloading: "${song.name || 'Unknown Title'}" by ${artistNames}...\n\n⏳ Please wait, this may take a moment.`
    );
    
    // Create unique filename
    const timestamp = Date.now();
    const sanitizedTitle = sanitizeFilename(`${song.name || 'Unknown'} - ${artistNames}`);
    const filename = `${sanitizedTitle}_${timestamp}.mp3`;
    const outputPath = path.join(downloadsDir, filename);
    
    // Ensure downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
      console.log(`Created downloads directory: ${downloadsDir}`);
    }
    
    // Prepare YouTube URL from video ID
    const videoUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
    
    // Execute yt-dlp command with simpler options to avoid errors
    const ytdlpArgs = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--add-metadata',
      '-o', outputPath,
      videoUrl
    ];
    
    console.log(`📥 Downloading music: ${videoUrl}`);
    console.log(`Full output path: ${path.resolve(outputPath)}`);
    
    const ytdlp = spawn('yt-dlp', ytdlpArgs);
    let output = '';
    
    ytdlp.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`YTDLP stdout: ${chunk}`);
    });
    
    ytdlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.error(`YTDLP stderr: ${chunk}`);
    });
    
    ytdlp.on('close', async (code) => {
      try {
        console.log(`yt-dlp process exited with code ${code}`);
        
        if (code !== 0) {
          console.error(`❌ yt-dlp exited with code ${code}`);
          await sendMessage(
            client,
            message.from,
            `❌ Failed to download music. Please try again later.`
          );
          return;
        }
        
        // Find actual output file (in case filename changed during download)
        let actualFilePath = outputPath;
        if (!fs.existsSync(outputPath)) {
          console.log('Looking for actual downloaded file in directory...');
          // Try to find the file by listing the directory
          const files = fs.readdirSync(downloadsDir);
          const recentFiles = files
            .map(file => {
              const filePath = path.join(downloadsDir, file);
              return {
                path: filePath,
                mtime: fs.statSync(filePath).mtime
              };
            })
            .sort((a, b) => b.mtime - a.mtime); // Sort by most recent
          
          if (recentFiles.length > 0) {
            actualFilePath = recentFiles[0].path;
            console.log(`Found most recent file: ${actualFilePath}`);
          } else {
            console.error(`❌ No files found in downloads directory`);
            await sendMessage(
              client,
              message.from,
              `❌ Failed to save music file. Please try again.`
            );
            return;
          }
        }
        
        // Verify file exists and has content
        if (!fs.existsSync(actualFilePath)) {
          console.error(`❌ Output file does not exist: ${actualFilePath}`);
          await sendMessage(
            client,
            message.from,
            `❌ Failed to save music file. Please try again.`
          );
          return;
        }
        
        // Log file details
        const fileStats = fs.statSync(actualFilePath);
        const fileSizeMB = fileStats.size / (1024 * 1024);
        console.log(`File exists: ${actualFilePath}, Size: ${fileSizeMB.toFixed(2)}MB, Created: ${fileStats.birthtime}, Modified: ${fileStats.mtime}`);
        
        if (fileStats.size === 0) {
          console.error('❌ Output file is empty (0 bytes)');
          await sendMessage(
            client,
            message.from,
            `❌ Downloaded file is empty. Please try again.`
          );
          return;
        }
        
        // Check if file is too large for WhatsApp (100MB limit)
        if (fileSizeMB > 100) {
          await sendMessage(
            client,
            message.from,
            `❌ The audio file (${fileSizeMB.toFixed(2)}MB) is too large to send via WhatsApp.`
          );
          return;
        }
        
        // PRIMARY METHOD: Send as audio for direct playback
        console.log(`📤 Sending as audio (playable): ${actualFilePath} (${fileSizeMB.toFixed(2)} MB)`);
        
        try {
          // Read file into buffer
          const fileBuffer = fs.readFileSync(actualFilePath);
          console.log(`Read file into buffer: ${fileBuffer.length} bytes`);
          
          // Create audio message with necessary attributes for playback
          const audioMessage = {
            audio: fileBuffer,
            mimetype: 'audio/mpeg',
            ptt: false, // This is important - false means it's music, not voice note
            fileName: `${sanitizedTitle}.mp3`
          };
          
          // Add optional metadata if available
          if (song.name) audioMessage.title = song.name;
          if (artistNames) audioMessage.author = artistNames;
          
          // Send as audio which will be playable in WhatsApp
          await client.sendMessage(message.from, audioMessage);
          
          console.log('✅ Audio sent successfully for playback');
          
          // Format duration safely
          const formattedDuration = song.duration ? formatDuration(song.duration) : 'Unknown';
          
          // Send additional info
          const infoMessage = `🎵 *${song.name || 'Unknown Title'}*\n` +
                            `👤 *Artist:* ${artistNames}\n` +
                            `💿 *Album:* ${song.album && song.album.name ? song.album.name : 'Unknown album'}\n` +
                            `⏱️ *Duration:* ${formattedDuration}\n` +
                            `📊 *Size:* ${fileSizeMB.toFixed(2)} MB\n\n` +
                            `▶️ The song should be playable directly in WhatsApp`;
                            
          await sendMessage(client, message.from, infoMessage);
          
          console.log('✅ Music info sent successfully');
        } catch (sendAudioError) {
          console.error(`❌ Error sending as audio: ${sendAudioError.message}`);
          
          // FALLBACK: Try as document if audio fails
          try {
            console.log('Trying to send as document instead...');
            
            await client.sendMessage(message.from, {
              document: fs.readFileSync(actualFilePath),
              mimetype: 'audio/mp3',
              fileName: `${sanitizedTitle}.mp3`
            });
            
            console.log('✅ Audio sent as document instead');
            
            // Format duration safely
            const formattedDuration = song.duration ? formatDuration(song.duration) : 'Unknown';
            
            // Send additional info
            const infoMessage = `🎵 *${song.name || 'Unknown Title'}*\n` +
                              `👤 *Artist:* ${artistNames}\n` +
                              `💿 *Album:* ${song.album && song.album.name ? song.album.name : 'Unknown album'}\n` +
                              `⏱️ *Duration:* ${formattedDuration}\n` +
                              `📊 *Size:* ${fileSizeMB.toFixed(2)} MB\n\n` +
                              `ℹ️ Note: The file was sent as a document. You'll need to download it to play.`;
                              
            await sendMessage(client, message.from, infoMessage);
          } catch (sendDocError) {
            console.error(`❌ Error sending as document: ${sendDocError.message}`);
            await sendMessage(
              client,
              message.from,
              `⚠️ Failed to send the audio: ${sendDocError.message}. Please try again.`
            );
          }
        }
        
        // Clean up file
        try {
          fs.unlinkSync(actualFilePath);
          console.log(`🧹 Cleaned up music file: ${actualFilePath}`);
        } catch (cleanupError) {
          console.error(`❌ Error cleaning up file: ${cleanupError.message}`);
        }
      } catch (sendError) {
        console.error(`❌ Error processing download: ${sendError.message}`);
        await sendMessage(
          client,
          message.from,
          `⚠️ Failed to send the audio: ${sendError.message}`
        );
        
        // Attempt cleanup even on error
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch (e) {
          console.error(`❌ Cleanup error: ${e.message}`);
        }
      }
    });
  } catch (error) {
    console.error(`❌ Music download error: ${error.message}`);
    await sendMessage(
      client,
      message.from,
      `⚠️ Failed to process music request: ${error.message}`
    );
  }
}

// Function to handle YouTube video downloads
async function handleYoutubeDownload(client, message, url) {
  try {
    // Validate URL
    if (!url || !url.match(/youtu(\.be|be\.com)/)) {
      await sendMessage(
        client,
        message.from,
        '❌ Invalid YouTube URL. Please provide a valid YouTube URL.'
      );
      return;
    }
    
    // Send initial status message
    await sendMessage(
      client,
      message.from,
      '⏳ Processing YouTube URL...'
    );
    
    // Create unique filename with timestamp
    const timestamp = Date.now();
    const downloadDir = path.join(tempDir, `yt_${timestamp}`);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    // Get video info first
    console.log(`🔍 Getting video info: ${url}`);
    let videoInfo = null;
    
    try {
      const infoArgs = [
        '--dump-json',
        '--no-warnings',
        '--no-check-certificate',
        url
      ];
      
      const infoProcess = spawn('yt-dlp', infoArgs);
      let infoOutput = '';
      
      infoProcess.stdout.on('data', (data) => {
        infoOutput += data.toString();
      });
      
      await new Promise((resolve, reject) => {
        infoProcess.on('close', (code) => {
          if (code === 0 && infoOutput) {
            try {
              videoInfo = JSON.parse(infoOutput);
              resolve();
            } catch (e) {
              reject(new Error(`Failed to parse video info: ${e.message}`));
            }
          } else {
            reject(new Error(`Failed to get video info, exit code: ${code}`));
          }
        });
        
        infoProcess.on('error', (err) => {
          reject(new Error(`Error getting video info: ${err.message}`));
        });
      });
      
      console.log(`✅ Video info retrieved: ${videoInfo.title} (${videoInfo.duration}s)`);
      
      // Check video duration - limit to 10 minutes to avoid huge files
      if (videoInfo.duration > 600) {
        await sendMessage(
          client,
          message.from,
          `⚠️ This video is ${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')} minutes long. Please use the !music command for audio only or choose a shorter video (under 10 minutes).`
        );
        return;
      }
      
      // Update user with video info
      await sendMessage(
        client,
        message.from,
        `🎬 *${videoInfo.title}*\n` +
        `⏱️ Duration: ${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}\n` +
        `👤 Channel: ${videoInfo.channel || 'Unknown'}\n\n` +
        `⏳ Downloading video...`
      );
    } catch (infoError) {
      console.error(`❌ Error getting video info: ${infoError.message}`);
      await sendMessage(
        client,
        message.from,
        `❌ Failed to get video information: ${infoError.message}`
      );
      return;
    }
    
    // Download the video with yt-dlp
    const outputTemplate = path.join(downloadDir, '%(title)s.%(ext)s');
    const ytdlpArgs = [
      '-f', 'best[height<=720]', // Limit to 720p to avoid huge files
      '-o', outputTemplate,
      '--no-warnings',
      '--no-check-certificate',
      url
    ];
    
    console.log(`📥 Downloading YouTube video: ${url}`);
    console.log(`Command: yt-dlp ${ytdlpArgs.join(' ')}`);
    
    const ytdlp = spawn('yt-dlp', ytdlpArgs);
    let output = '';
    
    ytdlp.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk);
    });
    
    ytdlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.error(chunk);
    });
    
    ytdlp.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error(`❌ yt-dlp exited with code ${code}`);
          await sendMessage(
            client,
            message.from,
            `❌ Failed to download YouTube video. Error code: ${code}`
          );
          return;
        }
        
        // Find downloaded file
        const files = fs.readdirSync(downloadDir);
        if (files.length === 0) {
          await sendMessage(
            client,
            message.from,
            '❌ No video file found after download.'
          );
          return;
        }
        
        // Get the downloaded file
        const videoFile = files[0];
        const videoPath = path.join(downloadDir, videoFile);
        const fileSize = fs.statSync(videoPath).size / (1024 * 1024); // MB
        
        // Check if the file is too large for WhatsApp (limit is around 15MB)
        const finalVideoPath = videoPath;
        const finalSizeMB = fileSize;
        
        if (finalSizeMB > 100) {
          await sendMessage(
            client,
            message.from,
            `⚠️ The video (${finalSizeMB.toFixed(2)}MB) is too large to send via WhatsApp (limit ~100MB).\n\nTry a shorter video or use the !music command to download just the audio.`
          );
        } else {
          // Send the video
          const caption = videoInfo ? 
            `📥 ${videoInfo.title}\n\n⏱️ Duration: ${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}\n📊 Size: ${finalSizeMB.toFixed(2)}MB` : 
            `📥 Downloaded from YouTube\n📊 Size: ${finalSizeMB.toFixed(2)}MB`;
          
          await client.sendMessage(message.from, {
            video: fs.readFileSync(finalVideoPath),
            caption: caption,
            gifPlayback: false
          });
          
          console.log('✅ YouTube video sent successfully');
        }
      } catch (sendError) {
        console.error(`❌ Error sending YouTube video: ${sendError.message}`);
        
        // If sending fails, notify the user
        await sendMessage(
          client,
          message.from,
          `⚠️ Failed to send the video: ${sendError.message}\n\nTry a shorter video or use the !music command to download just the audio.`
        );
      } finally {
        // Clean up files
        try {
          fs.rmSync(downloadDir, { recursive: true, force: true });
          console.log(`🧹 Cleaned up video directory: ${downloadDir}`);
        } catch (cleanupError) {
          console.error(`❌ Error cleaning up files: ${cleanupError.message}`);
        }
      }
    });
  } catch (error) {
    console.error(`❌ YouTube download error: ${error.message}`);
    await sendMessage(
      client,
      message.from,
      `⚠️ Failed to download from YouTube: ${error.message}\n\nPlease make sure the video is available and the URL is correct.`
    );
  }
}
  