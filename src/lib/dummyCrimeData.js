import { BOUNDARY_GEO, getBoundaryId } from './boundaries.js';

/**
 * Generate dummy crime counts for boundaries
 * @param {string} layer - 'community', 'beat', or 'district'
 * @param {number} daysAgo - Number of days to look back
 * @returns {Map<string, number>} Map of boundary ID to crime count
 */
export function generateDummyCrimeCounts(layer, daysAgo) {
  const counts = new Map();
  
  const geo = BOUNDARY_GEO[layer];
  if (!geo || !geo.features) {
    return counts;
  }
  
  const baseMultiplier = Math.max(1, daysAgo / 30);
  
  geo.features.forEach(feature => {
    const id = String(getBoundaryId(layer, feature));
    
    const seed = parseInt(id) || id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (seed * 9301 + 49297) % 233280 / 233280;
    
    let count;
    if (random < 0.1) {
      count = Math.floor(200 + random * 300 * baseMultiplier);
    } else if (random < 0.3) {
      count = Math.floor(100 + random * 200 * baseMultiplier);
    } else if (random < 0.6) {
      count = Math.floor(50 + random * 100 * baseMultiplier);
    } else if (random < 0.85) {
      count = Math.floor(20 + random * 50 * baseMultiplier);
    } else {
      count = Math.floor(5 + random * 20 * baseMultiplier);
    }
    
    const noise = Math.sin(seed + daysAgo) * 10;
    count = Math.max(0, Math.floor(count + noise));
    
    counts.set(id, count);
  });
  
  return counts;
}

/**
 * Load dummy crime counts
 * @param {number} daysAgo
 * @param {string} layer
 * @returns {Promise<Map<string, number>>}
 */
export async function loadDummyCrimeCounts(daysAgo, layer) {
  await new Promise(resolve => setTimeout(resolve, 50));
  
  return generateDummyCrimeCounts(layer, daysAgo);
}
