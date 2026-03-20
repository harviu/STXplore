export const RELATION_TARGET_LEN = 77;

/** API `targets` array index 0..76 → map keys "1".."77" with numeric counts. */
export function targetsToCountsByCommunityId(targets) {
  const out = {};
  for (let j = 0; j < RELATION_TARGET_LEN; j++) {
    out[String(j + 1)] = Number(targets[j]) || 0;
  }
  return out;
}
