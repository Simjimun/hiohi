const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Starting dependency installation...');

// Check if node_modules exists
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('Installing npm dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('npm dependencies installed successfully!');
  } catch (error) {
    console.error('Error installing npm dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('node_modules directory already exists, skipping npm install');
}

// Determine if we're on Windows or Linux/Mac
const isWindows = os.platform() === 'win32';
const ytdlpFilename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const ytdlpPath = path.join(__dirname, ytdlpFilename);

// Check for yt-dlp
if (!fs.existsSync(ytdlpPath)) {
  console.log(`${ytdlpFilename} not found, downloading...`);
  try {
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
      fs.mkdirSync(path.join(__dirname, 'downloads'));
    }
    
    if (isWindows) {
      // Download yt-dlp.exe for Windows
      execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o yt-dlp.exe', 
        { stdio: 'inherit' });
    } else {
      // Download yt-dlp for Linux/Mac
      execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp', 
        { stdio: 'inherit' });
      // Make it executable
      execSync('chmod +x yt-dlp', { stdio: 'inherit' });
    }
    console.log(`${ytdlpFilename} downloaded successfully!`);
  } catch (error) {
    console.error(`Error downloading ${ytdlpFilename}:`, error.message);
    console.log(`Please download ${ytdlpFilename} manually from https://github.com/yt-dlp/yt-dlp/releases`);
  }
}

console.log('All dependencies installed successfully!');
console.log('You can now run the project with: node index.js'); 