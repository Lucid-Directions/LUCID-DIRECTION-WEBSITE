/**
 * FatSecret API utility for NutriSnap
 * Handles OAuth2 authentication and API requests
 */
const fetch = require('node-fetch');
const logger = require('firebase-functions/logger');
const apiUtils = require('./apiUtils');

// FatSecret API Endpoints
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api';

// Cache keys
const TOKEN_CACHE_KEY = 'fatsecret_token';

/**
 * Get OAuth2 access token for FatSecret API
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  try {
    // Check if we have a cached token
    const cachedToken = apiUtils.getCachedResponse(TOKEN_CACHE_KEY);
    if (cachedToken && cachedToken.expires_at > Date.now()) {
      logger.debug('Using cached FatSecret access token');
      return cachedToken.access_token;
    }

    // Get client credentials from environment
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error('FatSecret API credentials not configured');
      throw new Error('FatSecret API credentials not configured');
    }

    // Request new token
    const tokenResponse = await fetch(FATSECRET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'basic premier barcode localization',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(`FatSecret token request failed: ${errorText}`);
      throw new Error(`Failed to get FatSecret token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Cache the token with expiration time (subtract 60 seconds for safety margin)
    const tokenWithExpiry = {
      ...tokenData,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000
    };
    
    apiUtils.cacheResponse(TOKEN_CACHE_KEY, tokenWithExpiry, tokenData.expires_in);
    
    logger.info('Successfully obtained new FatSecret access token');
    return tokenData.access_token;
  } catch (error) {
    logger.error('Error getting FatSecret access token:', error);
    throw error;
  }
}

/**
 * Search for food items in FatSecret database
 * @param {string} query Food name to search for
 * @param {number} maxResults Maximum number of results to return
 * @returns {Promise<Array>} Search results
 */
async function searchFoods(query, maxResults = 3) {
  try {
    // Generate cache key based on query
    const cacheKey = `fatsecret_search_${query.toLowerCase().trim()}`;
    
    // Check if we have cached results
    const cachedResults = apiUtils.getCachedResponse(cacheKey);
    if (cachedResults) {
      logger.debug(`Using cached FatSecret search results for "${query}"`);
      return cachedResults;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Make API request
    const searchResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams({
        method: 'foods.search',
        search_expression: query,
        max_results: maxResults.toString(),
        format: 'json'
      })
    });
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error(`FatSecret search request failed: ${errorText}`);
      throw new Error(`Failed to search FatSecret: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    // Handle empty results
    if (!searchData.foods || !searchData.foods.food) {
      logger.info(`No FatSecret results found for "${query}"`);
      return [];
    }
    
    // Handle single vs array results
    const foods = Array.isArray(searchData.foods.food) 
      ? searchData.foods.food 
      : [searchData.foods.food];
    
    // Cache results for 24 hours (86400 seconds)
    apiUtils.cacheResponse(cacheKey, foods, 86400);
    
    logger.info(`Found ${foods.length} FatSecret results for "${query}"`);
    return foods;
  } catch (error) {
    logger.error(`Error searching FatSecret for "${query}":`, error);
    return [];
  }
}

/**
 * Get detailed food information by ID
 * @param {string} foodId FatSecret food ID
 * @returns {Promise<Object>} Food details
 */
async function getFoodDetails(foodId) {
  try {
    // Generate cache key based on food ID
    const cacheKey = `fatsecret_food_${foodId}`;
    
    // Check if we have cached results
    const cachedResults = apiUtils.getCachedResponse(cacheKey);
    if (cachedResults) {
      logger.debug(`Using cached FatSecret food details for ID ${foodId}`);
      return cachedResults;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Make API request
    const detailsResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams({
        method: 'food.get.v2',
        food_id: foodId,
        format: 'json',
        include_sub_categories: 'true'
      })
    });
    
    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      logger.error(`FatSecret food details request failed: ${errorText}`);
      throw new Error(`Failed to get FatSecret food details: ${detailsResponse.status}`);
    }
    
    const detailsData = await detailsResponse.json();
    
    // Cache results for 7 days (604800 seconds)
    apiUtils.cacheResponse(cacheKey, detailsData.food, 604800);
    
    logger.info(`Retrieved FatSecret details for food ID ${foodId}`);
    return detailsData.food;
  } catch (error) {
    logger.error(`Error getting FatSecret food details for ID ${foodId}:`, error);
    throw error;
  }
}

/**
 * Convert FatSecret food data to NutriSnap's standardized format
 * @param {Object} fatSecretFood Food data from FatSecret API
 * @returns {Object} Standardized nutrition data
 */
function standardizeNutritionData(fatSecretFood) {
  // Default empty nutrition object
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
    foodName: fatSecretFood.food_name || 'Unknown Food',
    source: 'FatSecret',
    servingSize: '100g',
    microNutrients: {}
  };
  
  try {
    // Check if we have serving data
    if (!fatSecretFood.servings || !fatSecretFood.servings.serving) {
      return nutrition;
    }
    
    // Get the first serving (or the only serving if it's not an array)
    const serving = Array.isArray(fatSecretFood.servings.serving) 
      ? fatSecretFood.servings.serving[0] 
      : fatSecretFood.servings.serving;
    
    // Extract nutrition data
    nutrition.calories = parseFloat(serving.calories) || 0;
    nutrition.protein = parseFloat(serving.protein) || 0;
    nutrition.fat = parseFloat(serving.fat) || 0;
    nutrition.carbohydrates = parseFloat(serving.carbohydrate) || 0;
    nutrition.servingSize = serving.serving_description || '100g';
    
    // Extract micronutrients if available
    if (serving.fiber) nutrition.microNutrients.fiber = parseFloat(serving.fiber);
    if (serving.sugar) nutrition.microNutrients.sugar = parseFloat(serving.sugar);
    if (serving.sodium) nutrition.microNutrients.sodium = parseFloat(serving.sodium);
    if (serving.potassium) nutrition.microNutrients.potassium = parseFloat(serving.potassium);
    if (serving.cholesterol) nutrition.microNutrients.cholesterol = parseFloat(serving.cholesterol);
    if (serving.saturated_fat) nutrition.microNutrients.saturatedFat = parseFloat(serving.saturated_fat);
    
    return nutrition;
  } catch (error) {
    logger.error('Error standardizing FatSecret nutrition data:', error);
    return nutrition;
  }
}

/**
 * Get nutrition data for a food item from FatSecret
 * @param {string} foodLabel Food name to search for
 * @returns {Promise<Object|null>} Nutrition data or null if not found
 */
async function getNutritionFromFatSecret(foodLabel) {
  try {
    if (!foodLabel) return null;
    
    // Generate cache key
    const cacheKey = `fatsecret_nutrition_${foodLabel.toLowerCase().trim()}`;
    
    // Check cache
    const cachedNutrition = apiUtils.getCachedResponse(cacheKey);
    if (cachedNutrition) {
      logger.debug(`Using cached FatSecret nutrition data for "${foodLabel}"`);
      return cachedNutrition;
    }
    
    // Search for the food
    const searchResults = await searchFoods(foodLabel);
    
    if (!searchResults || searchResults.length === 0) {
      logger.info(`No FatSecret results found for "${foodLabel}"`);
      return null;
    }
    
    // Get details for the best match (first result)
    const foodId = searchResults[0].food_id;
    const foodDetails = await getFoodDetails(foodId);
    
    // Convert to standardized format
    const nutritionData = standardizeNutritionData(foodDetails);
    
    // Cache results for 24 hours (86400 seconds)
    apiUtils.cacheResponse(cacheKey, nutritionData, 86400);
    
    logger.info(`Successfully retrieved nutrition data from FatSecret for "${foodLabel}"`);
    return nutritionData;
  } catch (error) {
    logger.error(`Error getting nutrition from FatSecret for "${foodLabel}":`, error);
    return null;
  }
}

/**
 * Get autocomplete suggestions for food search
 * @param {string} expression - Partial text to get suggestions for
 * @param {number} maxResults - Maximum number of results (default 4, max 10)
 * @param {string} region - Optional region code (e.g. 'US', 'UK')
 * @returns {Promise<string[]>} - Array of suggestion strings
 */
async function autocompleteSearch(expression, maxResults = 4, region = null) {
  try {
    if (!expression || expression.trim().length < 2) {
      return [];
    }

    // Generate cache key
    const cacheKey = `fatsecret_autocomplete_${expression.toLowerCase().trim()}_${maxResults}_${region || 'default'}`;
    
    // Check if we have cached results
    const cachedSuggestions = apiUtils.getCachedResponse(cacheKey);
    if (cachedSuggestions) {
      logger.debug(`Using cached FatSecret autocomplete for "${expression}"`);
      return cachedSuggestions;
    }
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Prepare parameters
    const params = {
      method: 'foods.autocomplete.v2',
      expression: expression.trim(),
      max_results: Math.min(maxResults, 10).toString(), // Ensure max_results doesn't exceed 10
      format: 'json'
    };
    
    // Add region if provided
    if (region) {
      params.region = region;
    }
    
    // Make API request
    const searchResponse = await fetch(FATSECRET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`
      },
      body: new URLSearchParams(params)
    });
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error(`FatSecret autocomplete request failed: ${errorText}`);
      throw new Error(`Failed to get autocomplete suggestions: ${searchResponse.status}`);
    }
    
    const responseData = await searchResponse.json();
    
    // Handle empty results
    if (!responseData.suggestions || !responseData.suggestions.suggestion) {
      logger.info(`No autocomplete suggestions found for "${expression}"`);
      return [];
    }
    
    // Handle single result vs array
    let suggestions;
    if (Array.isArray(responseData.suggestions.suggestion)) {
      suggestions = responseData.suggestions.suggestion;
    } else {
      suggestions = [responseData.suggestions.suggestion];
    }
    
    // Cache for 15 minutes (900 seconds)
    apiUtils.cacheResponse(cacheKey, suggestions, 900);
    
    logger.info(`Retrieved ${suggestions.length} autocomplete suggestions for "${expression}"`);
    return suggestions;
  } catch (error) {
    logger.error(`Error getting autocomplete suggestions for "${expression}":`, error);
    return [];
  }
}

module.exports = {
  getAccessToken,
  searchFoods,
  getFoodDetails,
  getNutritionFromFatSecret,
  autocompleteSearch,
  standardizeNutritionData // Export this function as well, it was missing in the exports
};
