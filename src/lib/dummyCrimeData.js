/**
 * Generate dummy crime data for visualization
 * This simulates crime counts per boundary for demonstration purposes
 */

import { BOUNDARY_GEO, getBoundaryId } from './boundaries.js';

/**
 * Generate dummy crime counts for boundaries based on actual geo data
 * @param {string} layer - 'community', 'beat', or 'district'
 * @param {number} daysAgo - Number of days to look back (affects variation)
 * @returns {Map<string, number>} Map of boundary ID to crime count
 */
export function generateDummyCrimeCounts(layer, daysAgo) {
  const counts = new Map();
  
  // Get actual boundary features from geo data
  const geo = BOUNDARY_GEO[layer];
  if (!geo || !geo.features) {
    return counts;
  }
  
  // Generate counts with some variation
  // Use daysAgo to add some time-based variation
  const baseMultiplier = Math.max(1, daysAgo / 30); // More days = more crimes
  
  geo.features.forEach(feature => {
    const id = String(getBoundaryId(layer, feature));
    
    // Create pseudo-random but consistent counts based on ID
    // This makes the heat map interesting with varying intensities
    const seed = parseInt(id) || id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (seed * 9301 + 49297) % 233280 / 233280; // Simple PRNG
    
    // Vary the crime counts - some areas have more crime than others
    let count;
    if (random < 0.1) {
      // 10% high crime areas
      count = Math.floor(200 + random * 300 * baseMultiplier);
    } else if (random < 0.3) {
      // 20% medium-high crime areas
      count = Math.floor(100 + random * 200 * baseMultiplier);
    } else if (random < 0.6) {
      // 30% medium crime areas
      count = Math.floor(50 + random * 100 * baseMultiplier);
    } else if (random < 0.85) {
      // 25% low-medium crime areas
      count = Math.floor(20 + random * 50 * baseMultiplier);
    } else {
      // 15% low crime areas
      count = Math.floor(5 + random * 20 * baseMultiplier);
    }
    
    // Add some noise based on daysAgo for variation when slider changes
    const noise = Math.sin(seed + daysAgo) * 10;
    count = Math.max(0, Math.floor(count + noise));
    
    counts.set(id, count);
  });
  
  return counts;
}

/**
 * Load dummy crime counts (synchronous, instant)
 * @param {number} daysAgo - Number of days to look back
 * @param {string} layer - 'community', 'beat', or 'district'
 * @returns {Promise<Map<string, number>>} Map of boundary ID to crime count
 */
export async function loadDummyCrimeCounts(daysAgo, layer) {
  // Simulate a small delay to make it feel realistic
  await new Promise(resolve => setTimeout(resolve, 50));
  
  return generateDummyCrimeCounts(layer, daysAgo);
}
