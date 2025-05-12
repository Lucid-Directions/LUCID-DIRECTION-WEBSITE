/**
 * Standalone FatSecret API endpoints for NutriSnap
 * This module provides dedicated functions for querying the FatSecret nutrition database
 */
const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const fatSecretAPI = require('../utils/fatSecretAPI');

/**
 * Search for nutrition data using FatSecret API
 * @param {string} foodName - Name of food to search for
 * @returns {Object} Nutrition data in standardized format
 */
exports.searchFatSecretNutrition = onCall(
  { enforceAppCheck: true },
  async (data, context) => {
    try {
      // Basic validation
      if (!data.foodName) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing food name to search'
        );
      }

      const searchTerm = data.foodName.trim();
      logger.info(`Searching FatSecret for nutrition data: ${searchTerm}`);

      // Call the FatSecret API utility
      const nutritionData = await fatSecretAPI.getNutritionFromFatSecret(searchTerm);

      // Handle no results
      if (!nutritionData) {
        logger.info(`No FatSecret nutrition data found for: ${searchTerm}`);
        return {
          success: false,
          message: `No nutrition data found for "${searchTerm}"`,
          source: 'FatSecret'
        };
      }

      // Return standardized nutrition data
      return {
        success: true,
        source: 'FatSecret',
        nutritionData,
        message: `Found nutrition data for "${searchTerm}" from FatSecret`
      };
    } catch (error) {
      logger.error(`Error searching FatSecret for "${data.foodName || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error searching for nutrition data',
        error.message
      );
    }
  }
);

/**
 * Get food details by ID from FatSecret API
 * @param {string} foodId - FatSecret food ID
 * @returns {Object} Detailed food information
 */
exports.getFatSecretFoodDetails = onCall(
  { enforceAppCheck: true },
  async (request) => {
    // Standardize the parameter format for 2nd gen functions
    const { data, auth } = request;
    try {
      // Basic validation
      if (!data.foodId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing food ID'
        );
      }

      const foodId = data.foodId;
      logger.info(`Getting FatSecret food details for ID: ${foodId}`);

      // Call the FatSecret API utility
      const foodDetails = await fatSecretAPI.getFoodDetails(foodId);

      // Handle no results
      if (!foodDetails) {
        logger.info(`No FatSecret food details found for ID: ${foodId}`);
        return {
          success: false,
          message: `No food details found for ID "${foodId}"`,
          source: 'FatSecret'
        };
      }

      // Return food details with standardized structure
      const nutritionData = fatSecretAPI.standardizeNutritionData(foodDetails);
      
      return {
        success: true,
        foodDetails,
        nutritionData,
        source: 'FatSecret',
        message: `Found food details for ID "${foodId}" from FatSecret`
      };
    } catch (error) {
      logger.error(`Error getting FatSecret food details for ID "${data.foodId || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error getting food details',
        error.message
      );
    }
  }
);

/**
 * Get autocomplete suggestions for food search from FatSecret API
 * @param {string} query - Partial text to get suggestions for
 * @param {number} maxResults - Maximum number of results (default 4, max 10)
 * @param {string} region - Optional region code (e.g. 'US', 'UK')
 * @returns {Array<string>} Array of suggested search terms
 */
exports.getAutocompleteSuggestions = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const { data, auth } = request;
    try {
      // Basic validation
      if (!data.query) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing search query'
        );
      }

      const searchQuery = data.query.trim();
      const maxResults = data.maxResults || 4;
      const region = data.region || null;
      
      logger.info(`Getting autocomplete suggestions for query: ${searchQuery}`);

      // Call the FatSecret API utility
      const suggestions = await fatSecretAPI.autocompleteSearch(searchQuery, maxResults, region);

      // Return the suggestions
      return {
        success: true,
        suggestions,
        message: `Found ${suggestions.length} autocomplete suggestions for "${searchQuery}"`
      };
    } catch (error) {
      logger.error(`Error getting autocomplete suggestions for "${data.query || 'unknown'}":`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Error getting autocomplete suggestions',
        error.message
      );
    }
  }
);
