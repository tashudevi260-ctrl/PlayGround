import * as THREE from 'three'
import { BLOCKS, createAtlasTexture, createWaterNormalTexture, tileUV } from './blocks.js'
import { makePerlin, hash2, hash3, smoothstep, clamp, mulberry32 } from './noise.js'

export const CHUNK = 16
export const WORLD_HEIGHT = 64
export const WORLD_CHUNKS = 9
export const WORLD_SIZE = CHUNK * WORLD_CHUNKS
export const SEA_LEVEL = 27

export const SPAWN = { x: 78.5, z: 84.5 }
export const LAKE = { x: 101, z: 53, radius: 27 }
const BIG_OAK = { x: 50, z: 95 }

const FACE_DEFS = [
  {
    dir: [0, 1, 0],
    corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    uvs: [[0, 1], [0, 0], [1, 0], [1, 1]],
    tangents: [
      [[-1, 0, 0], [0, 0, -1]],
      [[-1, 0, 0], [0, 0, 1]],
      [[1, 0, 0], [0, 0, 1]],
      [[1, 0, 0], [0, 0, -1]],
    ],
    tile: 0,
  },
  {
    dir: [0, -1, 0],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uvs: [[0, 1], [1, 1], [1, 0], [0, 0]],
    tangents: [
      [[-1, 0, 0], [0, 0, -1]],
      [[1, 0, 0], [0, 0, -1]],
      [[1, 0, 0], [0, 0, 1]],
      [[-1, 0, 0], [0, 0, 1]],
    ],
    tile: 1,
  },
  {
    dir: [0, 0, -1],
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    tangents: [
      [[-1, 0, 0], [0, -1, 0]],
      [[-1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, -1, 0]],
    ],
    tile: 2,
  },
  {
    dir: [0, 0, 1],
    corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    tangents: [
      [[1, 0, 0], [0, -1, 0]],
      [[1, 0, 0], [0, 1, 0]],
      [[-1, 0, 0], [0, 1, 0]],
      [[-1, 0, 0], [0, -1, 0]],
    ],
    tile: 2,
  },
  {
    dir: [1, 0, 0],
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    tangents: [
      [[0, 0, 1], [0, -1, 0]],
      [[0, 0, 1], [0, 1, 0]],
      [[0, 0, -1], [0, 1, 0]],
      [[0, 0, -1], [0, -1, 0]],
    ],
    tile: 2,
  },
  {
    dir: [-1, 0, 0],
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    tangents: [
      [[0, 0, -1], [0, -1, 0]],
      [[0, 0, -1], [0, 1, 0]],
      [[0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [0, -1, 0]],
    ],
    tile: 2,
  },
]

const AO_LEVELS = [0.53, 0.69, 0.85, 1.0]

export class World {
  constructor(seed = 872341) {
    this.seed = seed
    this.perlin = makePerlin(seed)
    this.chunks = new Map()
    this.chunkGrid = new Array(WORLD_CHUNKS * WORLD_CHUNKS).fill(null)
    this.group = new THREE.Group()
    this.group.name = 'voxel-world'
    this.heightMap = new Int16Array(WORLD_SIZE * WORLD_SIZE)
    this.atlas = createAtlasTexture()
    this.waterNormal = createWaterNormalTexture()
    this.waterNormal.repeat.set(8, 8)
    this.solidMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      alphaTest: 0.35,
    })
    this.plantMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
    })
    this.waterMaterial = new THREE.MeshPhongMaterial({
      color: 0x2f82bb,
      specular: 0xd9f4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.76,
      normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.plantMeshes = []
    this.build()
  }

  idx(x, y, z) {
    return (y * CHUNK + z) * CHUNK + x
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`
  }

  makeChunk(cx, cz) {
    const key = this.chunkKey(cx, cz)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = {
        cx,
        cz,
        data: new Uint8Array(CHUNK * CHUNK * WORLD_HEIGHT),
        mesh: null,
        waterMesh: null,
        plantMesh: null,
      }
      this.chunks.set(key, chunk)
      this.chunkGrid[cz * WORLD_CHUNKS + cx] = chunk
    }
    return chunk
  }

  getBlock(x, y, z) {
    if (y < 0) return 11
    if (y >= WORLD_HEIGHT) return 0
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE) return 11
    const cx = x >> 4
    const cz = z >> 4
    const chunk = this.chunkGrid[cz * WORLD_CHUNKS + cx]
    if (!chunk) return 0
    return chunk.data[this.idx(x & 15, y, z & 15)]
  }

  isOpaque(x, y, z) {
    const b = BLOCKS[this.getBlock(x, y, z)]
    return Boolean(b && b.opaque)
  }

  isSolid(x, y, z) {
    const b = BLOCKS[this.getBlock(x, y, z)]
    return Boolean(b && b.solid)
  }

  setBlockRaw(x, y, z, id) {
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE || y < 0 || y >= WORLD_HEIGHT) return
    const cx = x >> 4
    const cz = z >> 4
    const chunk = this.chunkGrid[cz * WORLD_CHUNKS + cx]
    if (!chunk) return
    chunk.data[this.idx(x & 15, y, z & 15)] = id
  }

  setBlock(x, y, z, id, remesh = true) {
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE || y < 0 || y >= WORLD_HEIGHT) return false
    const cx = x >> 4
    const cz = z >> 4
    const chunk = this.chunkGrid[cz * WORLD_CHUNKS + cx]
    if (!chunk) return false
    const before = chunk.data[this.idx(x & 15, y, z & 15)]
    if (before === id) return false
    chunk.data[this.idx(x & 15, y, z & 15)] = id
    if (remesh) {
      this.remeshChunk(cx, cz)
      const lx = x & 15
      const lz = z & 15
      if (lx === 0) this.remeshChunk(cx - 1, cz)
      if (lx === 15) this.remeshChunk(cx + 1, cz)
      if (lz === 0) this.remeshChunk(cx, cz - 1)
      if (lz === 15) this.remeshChunk(cx, cz + 1)
    }
    return true
  }

  surfaceHeight(x, z) {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const b = BLOCKS[this.getBlock(x, y, z)]
      if (b && b.solid && !b.cross) return y
    }
    return 0
  }

  terrainHeight(x, z) {
    const p = this.perlin
    const nx = x
    const nz = z
    let h = 29 + p.fbm2(nx * 0.012, nz * 0.012, 4) * 7.5 + p.fbm2(nx * 0.045 + 40, nz * 0.045 - 17, 3) * 2.6
    h += p.fbm2(nx * 0.085 + 12, nz * 0.085 - 33, 2) * 1.7

    // Broad lake basin, with a warped shoreline so the banks do not read as
    // perfect concentric terraces.
    const warpX = p.noise2(nx * 0.045 + 31, nz * 0.045 - 12)
    const warpZ = p.noise2(nx * 0.045 - 77, nz * 0.045 + 46)
    const lakeDist = Math.hypot(nx + warpX * 7 - LAKE.x, nz + warpZ * 7 - LAKE.z)
    const basin = 1 - smoothstep(LAKE.radius * 0.35, LAKE.radius, lakeDist)
    h -= basin * 10.5

    // Spawn rises gently out of the shoreline.
    const spawnDist = Math.hypot(x - SPAWN.x, z - SPAWN.z)
    h += (1 - smoothstep(0, 18, spawnDist)) * 6.5

    // A ridge across the far side of the lake.
    const ridgeWarpX = p.noise2(nx * 0.05 + 3, nz * 0.05 - 8) * 9
    const ridgeWarpZ = p.noise2(nx * 0.05 - 21, nz * 0.05 + 11) * 9
    const ridgeDist = Math.hypot((nx - 120) * 0.85 + ridgeWarpX, (nz - 27) * 1.15 + ridgeWarpZ)
    const ridgeMask = (1 - smoothstep(12, 42, ridgeDist)) * smoothstep(0.42, 0.82, p.fbm2(nx * 0.02 + 9, nz * 0.02 - 4, 3) + 0.35)
    h += ridgeMask * (10 + p.ridged2(nx * 0.035 - 4, nz * 0.035 + 8, 3) * 16)

    // Secondary hill on the east shore.
    const hillDist = Math.hypot((x - 78) * 1.1, (z - 28) * 1.2)
    h += (1 - smoothstep(0, 22, hillDist)) * (5 + p.fbm2(nx * 0.06, nz * 0.06, 2) * 3)

    // A low, hazy rim keeps the world edge out of sight without turning the
    // horizon into a giant crater wall.
    const edge = Math.min(x, z, WORLD_SIZE - 1 - x, WORLD_SIZE - 1 - z)
    if (edge < 24) {
      const t = Math.pow(1 - smoothstep(2, 24, edge), 1.25)
      h += t * (4.5 + p.ridged2(nx * 0.06 + 11, nz * 0.06 - 7, 3) * 7.5)
    }

    // Small outcrops for interest, kept low-frequency so they read as crags.
    const crag = Math.max(0, p.noise2(nx * 0.055 + 70, nz * 0.055 - 33) - 0.46) * 7
    h += crag

    return clamp(Math.round(h), 4, WORLD_HEIGHT - 6)
  }

  biomeAt(x, z, height) {
    const temp = this.perlin.fbm2(x * 0.009 + 211, z * 0.009 - 93, 3)
    const humidity = this.perlin.fbm2(x * 0.013 - 44, z * 0.013 + 155, 3)
    if (height >= 47 || temp < -0.34) return 'snow'
    if (temp > 0.32 && humidity < 0.02 && height > SEA_LEVEL + 2) return 'desert'
    if (humidity > 0.02) return 'forest'
    return 'plains'
  }

  build() {
    const size = WORLD_SIZE
    for (let cz = 0; cz < WORLD_CHUNKS; cz++) {
      for (let cx = 0; cx < WORLD_CHUNKS; cx++) this.makeChunk(cx, cz)
    }

    // Raw height field, then two gentle smoothing passes. This removes
    // single-block puddles and makes the mountain rim read as slopes rather
    // than a staircase.
    let heights = new Float32Array(size * size)
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) heights[z * size + x] = this.terrainHeight(x, z)
    }
    for (let pass = 0; pass < 2; pass++) {
      const smoothed = new Float32Array(size * size)
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          let sum = 0
          let count = 0
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx
              const nz = z + dz
              if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue
              sum += heights[nz * size + nx]
              count++
            }
          }
          smoothed[z * size + x] = heights[z * size + x] * 0.5 + (sum / count) * 0.5
        }
      }
      heights = smoothed
    }
    for (let i = 0; i < heights.length; i++) this.heightMap[i] = Math.round(heights[i])

    // Terrain columns.
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const h = this.heightMap[z * size + x]
        const biome = this.biomeAt(x, z, h)
        const hL = this.heightMap[z * size + Math.max(0, x - 1)]
        const hR = this.heightMap[z * size + Math.min(size - 1, x + 1)]
        const hU = this.heightMap[Math.max(0, z - 1) * size + x]
        const hD = this.heightMap[Math.min(size - 1, z + 1) * size + x]
        const slope = Math.max(Math.abs(h - hL), Math.abs(h - hR), Math.abs(h - hU), Math.abs(h - hD))
        const beach = h <= SEA_LEVEL + 1 && h >= SEA_LEVEL - 1 && slope < 3
        const desert = biome === 'desert' && slope < 2 && h < 41
        const rocky = slope >= 3 || h >= 43
        const snow = h >= 47 && slope <= 2
        const columnSeed = hash2(x, z, this.seed)

        for (let y = 0; y <= h; y++) {
          let id = 3
          if (y === 0 || (y < 3 && hash3(x, y, z, this.seed + 5) < 0.45)) {
            id = 11
          } else if (y === h) {
            if (h < SEA_LEVEL - 1) id = hash3(x, y, z, this.seed + 1) < 0.24 ? 13 : 5
            else if (beach) id = 5
            else if (snow) id = 12
            else if (rocky) id = hash3(x, y, z, this.seed + 4) < 0.22 ? 13 : hash3(x, y, z, this.seed + 8) < 0.12 ? 33 : 3
            else if (desert) id = 5
            else id = 1
          } else if (y > h - 4) {
            if (beach) id = 5
            else if (rocky || snow) id = 3
            else if (desert) id = y > h - 2 ? 5 : 14
            else id = 2
          } else {
            id = 3
            if (y > 4 && y < h - 7) {
              const roll = hash3(x, y, z, this.seed + 9)
              if (roll < 0.0075) id = 15
              else if (roll < 0.0125 && y < 38) id = 16
              else if (roll < 0.016 && y < 24) id = 20
            }
          }

          // Caves carved below the surface.
          if (y > 3 && y < h - 5) {
            const cave = this.perlin.fbm2(x * 0.07 + y * 0.03, z * 0.07 - y * 0.028, 2)
            const cave2 = this.perlin.noise2(x * 0.045 - 90 + y * 0.05, z * 0.045 + 40)
            if (cave > 0.48 && cave2 > 0.2) id = 0
          }
          this.setBlockRaw(x, y, z, id)
        }

        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) this.setBlockRaw(x, y, z, 10)
        }

        // Beaches get a thin sandstone shelf just under the sand.
        if (beach && h > SEA_LEVEL && h - 3 > 0) {
          for (let y = Math.max(1, h - 3); y < h; y++) this.setBlockRaw(x, y, z, 14)
        }

        if (columnSeed < 0.022 && h > SEA_LEVEL + 2 && !beach) this.plantAt(x, h, z, biome)
      }
    }

    // A hand-shaped shelf around the spawn so the opening view is clean.
    this.flattenSpawn()
    this.plantBigOak()
    this.plantTrees()
    this.plantFlowersAndReeds()
    this.meshAll()
    this.placeLilyPads()
  }

  flattenSpawn() {
    const sx = Math.floor(SPAWN.x)
    const sz = Math.floor(SPAWN.z)
    const h = this.heightMap[sz * WORLD_SIZE + sx]
    const radius = 5.2
    for (let z = sz - 6; z <= sz + 6; z++) {
      for (let x = sx - 6; x <= sx + 6; x++) {
        if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE) continue
        const d = Math.hypot(x + 0.5 - SPAWN.x, z + 0.5 - SPAWN.z)
        if (d > radius) continue
        for (let y = h + 1; y < WORLD_HEIGHT; y++) this.setBlockRaw(x, y, z, 0)
        this.setBlockRaw(x, h, z, 1)
        this.setBlockRaw(x, h - 1, z, 2)
        this.setBlockRaw(x, h - 2, z, 2)
        this.setBlockRaw(x, h - 3, z, 3)
        this.heightMap[z * WORLD_SIZE + x] = h
      }
    }
    const ground = this.surfaceHeight(sx, sz)
    SPAWN.y = ground + 1.001
  }

  plantAt(x, h, z, biome) {
    if (x < 1 || z < 1 || x >= WORLD_SIZE - 1 || z >= WORLD_SIZE - 1) return
    if (this.getBlock(x, h + 1, z) !== 0) return
    const roll = hash3(x, h, z, this.seed + 41)
    const top = this.getBlock(x, h, z)
    if (top === 1) {
      if (roll < 0.24) this.setBlockRaw(x, h + 1, z, 25)
      else if (roll < 0.29) this.setBlockRaw(x, h + 1, z, 23)
      else if (roll < 0.325) this.setBlockRaw(x, h + 1, z, 24)
    } else if (top === 5 && biome === 'desert' && roll < 0.1) {
      this.setBlockRaw(x, h + 1, z, 26)
    }
  }

  plantBigOak() {
    const x = BIG_OAK.x
    const z = BIG_OAK.z
    const ground = this.surfaceHeight(x, z)
    if (ground < SEA_LEVEL) return
    this.setBlockRaw(x, ground, z, 2)
    const trunk = 8
    for (let y = 1; y <= trunk; y++) this.setBlockRaw(x, ground + y, z, 6)
    const top = ground + trunk
    for (let dy = -2; dy <= 3; dy++) {
      const radius = dy <= 0 ? 3.6 : dy === 1 ? 3 : dy === 2 ? 2.1 : 1.2
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.hypot(dx, dz * 1.05)
          if (d > radius) continue
          if (d > radius - 1 && hash3(x + dx, top + dy, z + dz, this.seed + 6) < 0.25) continue
          if (this.getBlock(x + dx, top + dy, z + dz) === 0) this.setBlockRaw(x + dx, top + dy, z + dz, 7)
        }
      }
    }
    this.setBlockRaw(x, top + 4, z, 7)
    this.setBlockRaw(x, top + 5, z, 7)
  }

  plantTrees() {
    const rand = mulberry32(this.seed + 333)
    for (let z = 3; z < WORLD_SIZE - 3; z += 2) {
      for (let x = 3; x < WORLD_SIZE - 3; x += 2) {
        if (Math.hypot(x - BIG_OAK.x, z - BIG_OAK.z) < 8) continue
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 11.5) continue
        const h = this.heightMap[z * WORLD_SIZE + x]
        if (h <= SEA_LEVEL + 1 || h >= 46) continue
        const biome = this.biomeAt(x, z, h)
        if (biome === 'desert') continue
        const roll = rand()
        const density = biome === 'forest' ? 0.11 : 0.035
        if (roll > density) continue
        const top = this.getBlock(x, h, z)
        if (top !== 1) continue
        // keep the view from spawn open toward the lake
        const ang = Math.atan2(z - SPAWN.z, x - SPAWN.x)
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 30 && ang > -1.45 && ang < -0.2) continue
        this.growTree(x, h, z, biome === 'forest' && rand() < 0.24, rand)
      }
    }
  }

  growTree(x, h, z, birch, rand) {
    const trunk = (birch ? 5 : 4) + Math.floor(rand() * 3)
    const log = birch ? 18 : 6
    const leaves = birch ? 19 : 7
    for (let y = 1; y <= trunk; y++) {
      if (this.getBlock(x, h + y, z) !== 0) return
    }
    for (let y = 1; y <= trunk; y++) this.setBlockRaw(x, h + y, z, log)
    const top = h + trunk
    for (let dy = -2; dy <= 2; dy++) {
      const radius = dy <= 0 ? (birch ? 2.1 : 2.6) : dy === 1 ? 1.9 : 1.0
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const d = Math.hypot(dx, dz)
          if (d > radius) continue
          if (d > radius - 1 && hash3(x + dx, top + dy, z + dz, this.seed + 2) < 0.3) continue
          if (this.getBlock(x + dx, top + dy, z + dz) === 0) this.setBlockRaw(x + dx, top + dy, z + dz, leaves)
        }
      }
    }
  }

  plantFlowersAndReeds() {
    const rand = mulberry32(this.seed + 777)
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      for (let x = 1; x < WORLD_SIZE - 1; x++) {
        const h = this.heightMap[z * WORLD_SIZE + x]
        if (h === SEA_LEVEL && this.getBlock(x, h, z) === 5) {
          if (rand() < 0.011) {
            this.setBlockRaw(x, h + 1, z, 25)
          }
        }
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) > 34) continue
        if (this.getBlock(x, h, z) === 1 && this.getBlock(x, h + 1, z) === 0) {
          const roll = rand()
          if (roll < 0.035) this.setBlockRaw(x, h + 1, z, 23)
          else if (roll < 0.055) this.setBlockRaw(x, h + 1, z, 24)
          else if (roll < 0.12) this.setBlockRaw(x, h + 1, z, 25)
        }
      }
    }
  }

  meshAll() {
    for (const chunk of this.chunkGrid) if (chunk) this.buildChunkMesh(chunk)
  }

  remeshChunk(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= WORLD_CHUNKS || cz >= WORLD_CHUNKS) return
    const chunk = this.chunkGrid[cz * WORLD_CHUNKS + cx]
    if (chunk) this.buildChunkMesh(chunk)
  }

  buildChunkMesh(chunk) {
    const solid = { position: [], normal: [], uv: [], color: [], index: [] }
    const water = { position: [], normal: [], uv: [], color: [], index: [] }
    const plant = { position: [], normal: [], uv: [], color: [], index: [] }
    const baseX = chunk.cx * CHUNK
    const baseZ = chunk.cz * CHUNK
    const data = chunk.data
    const size = WORLD_SIZE
    const rand = mulberry32((chunk.cx * 73856093) ^ (chunk.cz * 19349663) ^ this.seed)

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = data[this.idx(x, y, z)]
          if (!id) continue
          const block = BLOCKS[id]
          if (!block) continue
          const wx = baseX + x
          const wz = baseZ + z

          if (block.cross) {
            this.addCross(plant, wx, y, wz, block)
            continue
          }

          const target = block.liquid ? water : solid
          for (let f = 0; f < 6; f++) {
            const face = FACE_DEFS[f]
            const nx = wx + face.dir[0]
            const ny = y + face.dir[1]
            const nz = wz + face.dir[2]
            const neighbor = this.getBlock(nx, ny, nz)
            const neighborBlock = BLOCKS[neighbor]
            if (neighbor) {
              if (neighborBlock && neighborBlock.opaque) continue
              if (neighbor === id) continue
              if (block.liquid && neighborBlock && neighborBlock.liquid) continue
            }
            const tile = face.tile === 0 ? block.tiles[0] : face.tile === 1 ? block.tiles[1] : block.tiles[2]
            if (block.liquid) this.addWaterFace(target, wx, y, wz, face, tile, x, z)
            else this.addSolidFace(target, wx, y, wz, face, tile, id, rand)
          }
        }
      }
    }

    chunk.mesh = this.commitMesh(chunk.mesh, solid, this.solidMaterial, chunk, 'solid')
    chunk.waterMesh = this.commitMesh(chunk.waterMesh, water, this.waterMaterial, chunk, 'water')
    chunk.plantMesh = this.commitMesh(chunk.plantMesh, plant, this.plantMaterial, chunk, 'plant')
  }

  addSolidFace(target, wx, y, wz, face, tile, id, rand) {
    const uvData = tileUV(tile)
    const start = target.position.length / 3
    const tint = 0.93 + rand() * 0.11
    const light = 0.96 + rand() * 0.08
    for (let v = 0; v < 4; v++) {
      const c = face.corners[v]
      const px = wx + c[0]
      const py = y + c[1]
      const pz = wz + c[2]
      target.position.push(px, py, pz)
      target.normal.push(...face.dir)
      const uv = face.uvs[v]
      target.uv.push(uvData.u0 + uv[0] * (uvData.u1 - uvData.u0), uvData.v0 + uv[1] * (uvData.v1 - uvData.v0))
      let ao = 3
      if (!face.isWater) {
        const t1 = face.tangents[v][0]
        const t2 = face.tangents[v][1]
        const s1 = this.isOpaque(wx + face.dir[0] + t1[0], y + face.dir[1] + t1[1], wz + face.dir[2] + t1[2])
        const s2 = this.isOpaque(wx + face.dir[0] + t2[0], y + face.dir[1] + t2[1], wz + face.dir[2] + t2[2])
        const corner = this.isOpaque(
          wx + face.dir[0] + t1[0] + t2[0],
          y + face.dir[1] + t1[1] + t2[1],
          wz + face.dir[2] + t1[2] + t2[2],
        )
        if (s1 && s2) ao = 0
        else ao = 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (corner ? 1 : 0))
      }
      const shade = AO_LEVELS[ao] * tint * light
      target.color.push(shade, shade, shade)
    }
    target.index.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }

  addWaterFace(target, wx, y, wz, face, tile, lx, lz) {
    const uvData = tileUV(tile)
    const start = target.position.length / 3
    for (let v = 0; v < 4; v++) {
      const c = face.corners[v]
      let py = y + c[1]
      if (c[1] === 1) py = y + 0.88
      target.position.push(wx + c[0], py, wz + c[2])
      target.normal.push(...face.dir)
      const uv = face.uvs[v]
      target.uv.push((wx + c[0]) * 0.09 + (wz + c[2]) * 0.045, py * 0.09)
      target.uv.push(0, 0)
      target.uv.length -= 2
      target.color.push(1, 1, 1)
    }
    target.index.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }

  addCross(target, wx, y, wz, block) {
    const uvData = tileUV(block.tiles[2])
    const start = target.position.length / 3
    const tint = 0.9 + ((wx * 13 + wz * 7) % 9) / 60
    const quads = [
      [[0.12, 0, 0.12], [0.88, 0, 0.88], [0.88, 1, 0.88], [0.12, 1, 0.12]],
      [[0.88, 0, 0.12], [0.12, 0, 0.88], [0.12, 1, 0.88], [0.88, 1, 0.12]],
    ]
    for (let q = 0; q < quads.length; q++) {
      const base = target.position.length / 3
      const corners = quads[q]
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]
      for (let v = 0; v < 4; v++) {
        target.position.push(wx + corners[v][0], y + corners[v][1], wz + corners[v][2])
        target.normal.push(0, 1, 0)
        target.uv.push(uvData.u0 + uvs[v][0] * (uvData.u1 - uvData.u0), uvData.v0 + uvs[v][1] * (uvData.v1 - uvData.v0))
        target.color.push(tint, tint, tint)
      }
      target.index.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  commitMesh(oldMesh, data, material, chunk, kind) {
    if (oldMesh) {
      this.group.remove(oldMesh)
      oldMesh.geometry.dispose()
    }
    if (!data.position.length) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.color, 3))
    geometry.setIndex(data.index)
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `chunk-${chunk.cx}-${chunk.cz}-${kind}`
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    if (kind === 'water') mesh.renderOrder = 4
    if (kind === 'plant') mesh.renderOrder = 3
    this.group.add(mesh)
    return mesh
  }

  placeLilyPads() {
    const group = new THREE.Group()
    group.name = 'lily-pads'
    const geometry = new THREE.CircleGeometry(0.42, 10, 0.3, Math.PI * 2 - 0.55)
    const material = new THREE.MeshLambertMaterial({ color: 0x4e8b31, side: THREE.DoubleSide })
    const rand = mulberry32(this.seed + 9001)
    let count = 0
    for (let attempt = 0; attempt < 240 && count < 26; attempt++) {
      const x = LAKE.x + (rand() - 0.5) * LAKE.radius * 1.4
      const z = LAKE.z + (rand() - 0.5) * LAKE.radius * 1.4
      const top = this.surfaceHeight(Math.floor(x), Math.floor(z))
      if (top !== SEA_LEVEL - 1) continue
      if (this.getBlock(Math.floor(x), SEA_LEVEL, Math.floor(z)) !== 10) continue
      const pad = new THREE.Mesh(geometry, material)
      pad.rotation.x = -Math.PI / 2
      pad.rotation.z = rand() * Math.PI * 2
      pad.position.set(x, SEA_LEVEL + 0.9, z)
      pad.scale.setScalar(0.8 + rand() * 0.5)
      group.add(pad)
      count++
    }
    this.group.add(group)
    this.lilyPads = group
  }

  getWaterSurfaceAt(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) === 10) return y + 0.88
    }
    return null
  }
}
