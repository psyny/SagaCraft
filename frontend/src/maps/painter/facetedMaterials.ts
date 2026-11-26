/** Continuous displacement interpolated on a triangular lattice, so its edges stay straight inside each cell. */
export const ANGULAR_EDGES = `
vec2 angularWarp(vec2 p) {
  vec2 q = p / (uSize * MAP_TERRAIN_EDGES_SIZE);
  vec2 cell = floor(q), f = fract(q);
  vec2 corner = vec2(step(1.0, f.x + f.y));
  vec2 w = abs(f - corner);
  vec2 a = hash2(cell + corner + 13.0);
  vec2 b = hash2(cell + vec2(1.0, 0.0) + 13.0);
  vec2 c = hash2(cell + vec2(0.0, 1.0) + 13.0);
  if (corner.x > 0.5) { vec2 swap = b; b = c; c = swap; }
  return (a * (1.0 - w.x - w.y) + b * w.x + c * w.y - 0.5) * (uSize * MAP_TERRAIN_EDGES_OFFSET);
}`

/** Triangle heights shared across world-space edges. Light is constant across each triangle. */
export const FACET_FIELD = `
float facetHeight(vec2 v, float t) {
  return sin(dot(v, vec2(0.74, -0.81)) - t) * 0.44 + hash(v + 27.0) * 0.38;
}
float facetLight(vec2 q, float t) {
  q.x += q.y * 0.41 + sin(q.y * 0.69) * 0.23;
  q.y += sin(q.x * 0.54) * 0.23;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float flip = step(0.5, hash(cell + 9.0));
  f.x = mix(f.x, 1.0 - f.x, flip);
  float farCorner = step(1.0, f.x + f.y);
  vec2 diagonal = vec2(1.0 - 2.0 * flip, 1.0);
  vec2 a = cell + vec2(flip, 0.0) + farCorner * diagonal;
  float direction = 1.0 - 2.0 * farCorner;
  float h = facetHeight(a, t);
  float dx = (facetHeight(a + vec2(diagonal.x * direction, 0.0), t) - h) * diagonal.x * direction;
  float dy = (facetHeight(a + vec2(0.0, direction), t) - h) * direction;
  return clamp(dx * 0.7 + dy * 0.48, -1.0, 1.0);
}`

/** Convex cells of varying sizes with molten seams. Channels are crust coverage and its face shade. */
export const LAVA_PLATES = `
vec2 plateSurface(float nearest, float next, vec2 a, vec2 b, float pixel) {
  float edge = (sqrt(next) - sqrt(nearest)) * 0.5;
  float gap = mix(0.028, 0.076, hash(a + b + 41.0));
  float crust = smoothstep(gap * 0.5, gap + min(pixel * 0.42, 0.085), edge);
  return vec2(crust, 0.74 + 0.39 * hash(a + 8.0));
}
vec2 lavaPlates(vec2 q, float pixel) {
  vec2 cell = floor(q);
  vec2 a = cell, b = cell;
  float nearest = 10.0, next = 10.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = cell + vec2(float(x), float(y));
    vec2 delta = id + 0.12 + hash2(id + 57.0) * 0.76 - q;
    float distance = dot(delta, delta);
    if (distance < nearest) { next = nearest; b = a; nearest = distance; a = id; }
    else if (distance < next) { next = distance; b = id; }
  }
  return plateSurface(nearest, next, a, b, pixel);
}`

export const FACET_FLAME = `
vec4 facetedFlame(vec2 p, vec3 color, float time, float seed) {
  float y = p.y + 0.5;
  // The vertices move smoothly. Each tongue is shaded with a lit face and a darker side plane.
  float phase = time * MAP_FLAME_FLICKER + seed * 13.0;
  float tip = 0.76 + sin(phase) * 0.12 + sin(phase * 1.87) * 0.065;
  float shoulder = 0.30 + sin(phase * 1.37 + 1.4) * 0.06;
  float bend = (sin(phase * 0.79) * 0.12 + sin(seed * 4.3) * 0.08);
  float width = min(mix(0.14, 0.38, y / shoulder), 0.36 * (tip - y) / (tip - shoulder));
  float x = p.x - bend * (y / tip);
  float edge = width - abs(x + (x > 0.0 ? y * 0.06 : -y * 0.025));
  float outer = smoothstep(0.0, 0.024, edge);
  float tongue = min(y * 1.5 + 0.020, (0.55 - y + sin(phase + 2.0) * 0.08) * 0.42);
  float inner = smoothstep(-0.012, 0.023, tongue - abs(x + 0.048 - 0.12 * y));
  vec3 shade = mix(color * vec3(0.78, 0.35, 0.16), color, 1.0 - smoothstep(-0.015, 0.009, x - y * 0.07));
  vec3 core = mix(color, vec3(1.0, 0.94, 0.63), MAP_FLAME_HEAT);
  shade = mix(shade, core * mix(0.86, 1.07, step(x + y * 0.16, 0.05)), inner);
  return vec4(shade, outer);
}`

export const FACET_PARTICLES = `
vec4 facetedParticle(vec2 p, float shape, vec3 color, vec3 shade, vec3 light) {
  vec2 dirs = abs(p);
  float diamond = dirs.x + dirs.y;
  float hex = max(dirs.y, dirs.x * 0.87 + dirs.y * 0.5) * 2.15;
  float plane = step(0.0, p.x + p.y * 0.35);
  float contrast = MAP_PARTICLES_CONTRAST;
  float a;
  if (shape > 1.5 && shape < 2.5) {         // layered cloud planes for mist, smoke and steam
    float lobe = min(hex, max(abs(p.y + 0.13) * 2.8, abs(p.x - 0.24) * 3.4));
    float level = step(0.06, p.y - abs(p.x) * 0.34);
    a = (1.0 - smoothstep(0.73, 1.03, lobe)) * mix(0.44, 0.78, level);
    color = mix(color, shade, contrast * (1.0 - level) * 0.72);
  } else if (shape > 3.5 && shape < 4.5) {  // a folded leaf or petal
    a = 1.0 - smoothstep(0.91, 1.0, dirs.x * 3.0 + dirs.y * 2.0);
    color = mix(color, shade, contrast * plane);
  } else if (shape > 4.5 && shape < 5.5) {  // a polygonal bubble ring
    a = (1.0 - smoothstep(0.86, 0.98, hex)) * smoothstep(0.65, 0.76, hex);
    color = mix(color, light, (1.0 - plane) * contrast);
  } else {                                 // sparks and small lights
    a = 1.0 - smoothstep(0.24, 0.41, diamond);
    color = mix(color, light, (1.0 - smoothstep(0.10, 0.18, diamond)) * (1.0 - plane * contrast));
  }
  return vec4(color, a);
}`
