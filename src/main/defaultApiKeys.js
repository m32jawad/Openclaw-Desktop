/**
 * Default API Keys Configuration
 * 
 * This file reads API keys from environment variables for security.
 * 
 * For local development:
 * 1. Copy 'defaultApiKeys.local.example.js' to 'defaultApiKeys.local.js'
 * 2. Add your API keys to 'defaultApiKeys.local.js' (this file is gitignored)
 * 
 * For GitHub Actions/CI builds:
 * - Set environment variables in GitHub Secrets:
 *   NEURAI_ANTHROPIC_KEY
 *   NEURAI_GOOGLE_KEY
 *   NEURAI_OPENAI_KEY
 *   NEURAI_BRAVE_SEARCH_KEY
 * 
 * For production builds:
 * - Keys will be embedded during build time from environment variables
 */

// Try to load local config first (for development)
let localKeys = {};
try {
  localKeys = require('./defaultApiKeys.local.js');
} catch (e) {
  // Local config doesn't exist, will use environment variables
}

module.exports = {
  // Anthropic Claude API Key
  anthropic: process.env.NEURAI_ANTHROPIC_KEY || localKeys.anthropic || '',
  
  // Google Gemini API Key
  google: process.env.NEURAI_GOOGLE_KEY || localKeys.google || '',
  
  // OpenAI API Key
  openai: process.env.NEURAI_OPENAI_KEY || localKeys.openai || '',
  
  // Brave Search API Key (optional, for web search capabilities)
  braveSearch: process.env.NEURAI_BRAVE_SEARCH_KEY || localKeys.braveSearch || ''
};

