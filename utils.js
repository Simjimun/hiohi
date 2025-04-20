/**
 * Utility functions for the WhatsApp Music Bot
 */

const fs = require('fs');
const path = require('path');

/**
 * Create a downloads directory if it doesn't exist
 * @param {string} dirPath - Directory path
 * @returns {string} - Created directory path
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
  return dirPath;
}

/**
 * Clean filename by removing invalid characters
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Format duration in seconds to mm:ss format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Clean up temporary files
 * @param {string} filePath - Path to file for deletion
 */
function cleanupFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted temporary file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete temporary file ${filePath}:`, error);
    }
  }
}

/**
 * Get file size in MB
 * @param {string} filePath - Path to file
 * @returns {number} - File size in MB
 */
function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

module.exports = {
  ensureDirectoryExists,
  sanitizeFilename,
  formatDuration,
  cleanupFile,
  getFileSizeMB
}; 