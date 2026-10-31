// Small, fast deterministic noise toolkit used for terrain and textures.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662687) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

export function makePerlin(seed = 1337) {
  const random = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  function grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y
      case 1: return x - y
      case 2: return -x + y
      case 3: return -x - y
      case 4: return x
      case 5: return -x
      case 6: return y
      default: return -y
    }
  }

  function noise2(x, y) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const u = fade(xf)
    const v = fade(yf)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u)
    const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u)
    return lerp(x1, x2, v)
  }

  function fbm2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += noise2(x * freq, y * freq) * amp
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }

  function ridged2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise2(x * freq, y * freq))
      sum += n * n * amp
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }

  return { noise2, fbm2, ridged2 }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
