/**
 * Error handler for the WhatsApp Music Bot
 */

// Define custom error types
class MusicBotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MusicBotError';
  }
}

class SearchError extends MusicBotError {
  constructor(message) {
    super(message || 'Failed to search for music');
    this.name = 'SearchError';
  }
}

class DownloadError extends MusicBotError {
  constructor(message) {
    super(message || 'Failed to download music');
    this.name = 'DownloadError';
  }
}

class ConversionError extends MusicBotError {
  constructor(message) {
    super(message || 'Failed to convert music file');
    this.name = 'ConversionError';
  }
}

class WhatsAppError extends MusicBotError {
  constructor(message) {
    super(message || 'Failed to send message via WhatsApp');
    this.name = 'WhatsAppError';
  }
}

// Main error handler function
async function handleError(error, client, message) {
  console.error('Bot error:', error);
  console.error('Error stack:', error.stack);
  
  let userMessage = '❌ An unexpected error occurred. Please try again later.';
  
  if (error instanceof SearchError) {
    userMessage = '❌ Failed to search for the song. Please try again with a different query.';
  } else if (error instanceof DownloadError) {
    userMessage = '❌ Failed to download the song. The song might be unavailable or restricted.';
  } else if (error instanceof ConversionError) {
    userMessage = '❌ Failed to convert the song. Please try again later.';
  } else if (error instanceof WhatsAppError) {
    userMessage = '❌ Failed to send the message. Please try again later.';
  }
  
  // Log additional diagnostics
  console.log('Sending error message to user:', userMessage);
  console.log('Message recipient:', message ? message.from : 'Unknown');
  
  // Send error message to user if client and message are available
  if (client && message && message.from) {
    try {
      // Using Baileys message format
      await client.sendMessage(message.from, { text: userMessage });
      console.log('Error message sent successfully');
    } catch (err) {
      console.error('Failed to send error message:', err);
      // Try one more time with a simpler message
      try {
        await client.sendMessage(message.from, { text: '❌ Error occurred. Please try again.' });
        console.log('Simple error message sent successfully');
      } catch (finalErr) {
        console.error('Failed to send simple error message:', finalErr);
      }
    }
  }
  
  return userMessage;
}

// Helper function to check if WhatsApp client is still connected
async function checkConnection(client) {
  try {
    // With Baileys, checking if the client.user exists is a good way to verify connection
    return client && client.user !== undefined;
  } catch (error) {
    console.error('Error checking connection:', error);
    return false;
  }
}

module.exports = {
  MusicBotError,
  SearchError,
  DownloadError,
  ConversionError,
  WhatsAppError,
  handleError,
  checkConnection
}; 