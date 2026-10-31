import * as THREE from 'three'
import { mulberry32 } from './noise.js'

export const TILE = 16
export const ATLAS_COLS = 16
export const ATLAS_SIZE = TILE * ATLAS_COLS

const T = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  cobble: 4,
  sand: 5,
  oakSide: 6,
  oakTop: 7,
  oakLeaves: 8,
  planks: 9,
  glass: 10,
  water: 11,
  bedrock: 12,
  snow: 13,
  snowSide: 14,
  gravel: 15,
  sandstoneSide: 16,
  sandstoneTop: 17,
  coalOre: 18,
  ironOre: 19,
  bricks: 20,
  birchSide: 21,
  birchTop: 22,
  birchLeaves: 23,
  obsidian: 24,
  glowstone: 25,
  craftingTop: 26,
  craftingSide: 27,
  flowerRed: 28,
  flowerYellow: 29,
  grassTuft: 30,
  deadBush: 31,
  pumpkinSide: 32,
  pumpkinTop: 33,
  whiteWool: 34,
  redWool: 35,
  blueWool: 36,
  yellowWool: 37,
  stoneBricks: 38,
  mossyStone: 39,
}

const palette = {
  dirt: ['#8a5a34', '#8f6039', '#83542f', '#96663d', '#7d4f2c'],
  grass: ['#5b9b2c', '#63a433', '#548f27', '#6caf3b', '#4f8a23'],
  stone: ['#8c8c8c', '#949494', '#848484', '#9a9a9a', '#7e7e7e'],
  sand: ['#e2d19a', '#e8d8a3', '#dbc891', '#e6d49f', '#d6c38c'],
  water: ['#3d8fc9', '#4598d0', '#3684bd', '#4da1d6'],
}

function px(ctx, ox, oy, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color
  ctx.fillRect(ox + x, oy + y, w, h)
}

function noiseFill(ctx, ox, oy, colors, rnd, alpha = 1) {
  ctx.globalAlpha = alpha
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      px(ctx, ox, oy, x, y, colors[(rnd() * colors.length) | 0])
    }
  }
  ctx.globalAlpha = 1
}

function speckle(ctx, ox, oy, colors, rnd, count = 20, size = 1) {
  for (let i = 0; i < count; i++) {
    const x = (rnd() * TILE) | 0
    const y = (rnd() * TILE) | 0
    px(ctx, ox, oy, x, y, colors[(rnd() * colors.length) | 0], size, size)
  }
}

function paintGrassTop(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.grass, rnd)
  for (let i = 0; i < 22; i++) {
    const x = (rnd() * 16) | 0
    const y = (rnd() * 16) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.5 ? '#7cbf4b' : '#43701f')
  }
  for (let i = 0; i < 7; i++) {
    const x = (rnd() * 15) | 0
    const y = (rnd() * 13) | 0
    px(ctx, ox, oy, x, y, '#8ecf56')
    px(ctx, ox, oy, x, y + 1, '#6fae3d')
  }
}

function paintGrassSide(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.dirt, rnd)
  const depths = []
  for (let x = 0; x < 16; x++) depths[x] = 2 + ((rnd() * 3) | 0)
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) {
      if (y < depths[x]) {
        const c = y === depths[x] - 1 && rnd() < 0.45 ? '#44741f' : palette.grass[(rnd() * palette.grass.length) | 0]
        px(ctx, ox, oy, x, y, c)
      } else if (y === depths[x] && rnd() < 0.32) {
        px(ctx, ox, oy, x, y, '#4e8a24')
      }
    }
  }
  speckle(ctx, ox, oy, ['#70472a', '#9d6d41', '#5e3a21'], rnd, 14)
}

function paintDirt(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.dirt, rnd)
  speckle(ctx, ox, oy, ['#6b4226', '#a17146', '#59351c', '#9a6a3e'], rnd, 24)
}

function paintStone(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.stone, rnd)
  for (let i = 0; i < 16; i++) {
    const x = (rnd() * 16) | 0
    const y = (rnd() * 16) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.5 ? '#737373' : '#a4a4a4')
  }
  // a few cracks
  let x = 3 + ((rnd() * 3) | 0)
  let y = 2 + ((rnd() * 4) | 0)
  for (let i = 0; i < 6; i++) {
    px(ctx, ox, oy, x, y, '#6f6f6f')
    x += rnd() < 0.6 ? 1 : 0
    y += 1
  }
  x = 9 + ((rnd() * 3) | 0)
  y = 10 + ((rnd() * 2) | 0)
  for (let i = 0; i < 5; i++) {
    px(ctx, ox, oy, x, y, '#707070')
    x -= 1
    y += rnd() < 0.4 ? 1 : 0
  }
}

function paintCobble(ctx, ox, oy, rnd) {
  px(ctx, ox, oy, 0, 0, '#5b5b5b', 16, 16)
  const stones = [
    [1, 1, 6, 4], [8, 0, 7, 5], [0, 6, 5, 4], [6, 6, 5, 4], [12, 6, 4, 4],
    [1, 11, 7, 4], [9, 11, 6, 5], [0, 15, 5, 1], [14, 12, 2, 4],
  ]
  for (const [x, y, w, h] of stones) {
    const shade = 108 + ((rnd() * 42) | 0)
    const base = `rgb(${shade},${shade},${shade})`
    px(ctx, ox, oy, x, y, base, w, h)
    px(ctx, ox, oy, x, y, `rgb(${shade + 22},${shade + 22},${shade + 22})`, w, 1)
    px(ctx, ox, oy, x, y, `rgb(${shade + 16},${shade + 16},${shade + 16})`, 1, h)
    px(ctx, ox, oy, x, y + h - 1, `rgb(${shade - 30},${shade - 30},${shade - 30})`, w, 1)
    px(ctx, ox, oy, x + w - 1, y, `rgb(${shade - 24},${shade - 24},${shade - 24})`, 1, h)
    for (let i = 0; i < Math.max(2, w * h / 7); i++) {
      const sx = x + 1 + ((rnd() * Math.max(1, w - 2)) | 0)
      const sy = y + 1 + ((rnd() * Math.max(1, h - 2)) | 0)
      px(ctx, ox, oy, sx, sy, rnd() < 0.5 ? `rgb(${shade - 18},${shade - 18},${shade - 18})` : `rgb(${shade + 15},${shade + 15},${shade + 15})`)
    }
  }
}

function paintSand(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.sand, rnd)
  speckle(ctx, ox, oy, ['#cdb87e', '#f0e2b1', '#c8b47c'], rnd, 20)
}

function paintOakSide(ctx, ox, oy, rnd) {
  const bands = ['#6a4a29', '#74522e', '#5e4022', '#7c5934', '#654626']
  for (let x = 0; x < 16; x++) {
    const c = bands[(x * 7 + ((rnd() * 3) | 0)) % bands.length]
    px(ctx, ox, oy, x, 0, c, 1, 16)
  }
  for (let i = 0; i < 28; i++) {
    const x = (rnd() * 16) | 0
    const y = (rnd() * 16) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.55 ? '#54381d' : '#8a653d')
  }
  for (let i = 0; i < 3; i++) {
    const x = 2 + ((rnd() * 11) | 0)
    const y = 2 + ((rnd() * 11) | 0)
    px(ctx, ox, oy, x, y, '#4b321a', 2, 1)
    px(ctx, ox, oy, x + 1, y + 1, '#4b321a', 1, 1)
  }
}

function paintOakTop(ctx, ox, oy, rnd) {
  px(ctx, ox, oy, 0, 0, '#b08a55', 16, 16)
  noiseFill(ctx, ox, oy, ['#a98351', '#b58e59', '#9d7948'], rnd)
  const rings = ['#8a693e', '#937146', '#7c5d36']
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = rings[i % rings.length]
    ctx.lineWidth = 1
    ctx.strokeRect(ox + 0.5 + i, oy + 0.5 + i, 15 - i * 2, 15 - i * 2)
  }
  px(ctx, ox, oy, 7, 7, '#4f3a1f', 2, 2)
  px(ctx, ox, oy, 8, 4, '#6b4b29', 1, 8)
  px(ctx, ox, oy, 4, 8, '#6b4b29', 8, 1)
}

function paintLeaves(ctx, ox, oy, rnd, light = false) {
  const colors = light
    ? ['#5c9a3a', '#6caf48', '#4d852e', '#79ba52', '#3d6d25']
    : ['#3f7a2a', '#4b8b33', '#356b24', '#55953a', '#2f5f20']
  ctx.clearRect(ox, oy, TILE, TILE)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const clump = Math.sin(x * 0.9 + y * 0.6) * 0.12
      if (rnd() > 0.14 + clump) {
        px(ctx, ox, oy, x, y, colors[(rnd() * colors.length) | 0])
      }
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = (rnd() * 16) | 0
    const y = (rnd() * 16) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.6 ? '#2b571c' : '#6cae45')
  }
}

function paintPlanks(ctx, ox, oy, rnd) {
  px(ctx, ox, oy, 0, 0, '#a97a45', 16, 16)
  const boards = ['#a97a45', '#b0814b', '#9f7240', '#aa7c47']
  for (let b = 0; b < 4; b++) {
    px(ctx, ox, oy, 0, b * 4, boards[b], 16, 3)
    px(ctx, ox, oy, 0, b * 4 + 3, '#7d552e', 16, 1)
    for (let i = 0; i < 7; i++) {
      const x = (rnd() * 15) | 0
      const y = b * 4 + ((rnd() * 3) | 0)
      px(ctx, ox, oy, x, y, rnd() < 0.5 ? '#8f6436' : '#c09058')
    }
  }
  // staggered vertical seams
  px(ctx, ox, oy, 5, 0, '#7d552e', 1, 3)
  px(ctx, ox, oy, 11, 4, '#7d552e', 1, 3)
  px(ctx, ox, oy, 7, 8, '#7d552e', 1, 3)
  px(ctx, ox, oy, 13, 12, '#7d552e', 1, 3)
}

function paintGlass(ctx, ox, oy, rnd) {
  ctx.clearRect(ox, oy, TILE, TILE)
  ctx.globalAlpha = 1
  px(ctx, ox, oy, 0, 0, '#c7edff', 16, 1)
  px(ctx, ox, oy, 0, 15, '#c7edff', 16, 1)
  px(ctx, ox, oy, 0, 0, '#c7edff', 1, 16)
  px(ctx, ox, oy, 15, 0, '#c7edff', 1, 16)
  px(ctx, ox, oy, 2, 2, 'rgba(220,248,255,0.55)', 5, 1)
  px(ctx, ox, oy, 2, 3, 'rgba(220,248,255,0.3)', 1, 4)
  px(ctx, ox, oy, 11, 11, 'rgba(220,248,255,0.45)', 3, 1)
  px(ctx, ox, oy, 3, 12, 'rgba(220,248,255,0.35)', 2, 2)
}

function paintWater(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.water, rnd)
  for (let i = 0; i < 10; i++) {
    const x = (rnd() * 13) | 0
    const y = (rnd() * 15) | 0
    px(ctx, ox, oy, x, y, '#5cb0e2', 2, 1)
    px(ctx, ox, oy, x + 3, y + 1, '#2e77ad', 2, 1)
  }
}

function paintBedrock(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#494949', '#3c3c3c', '#555555', '#333333'], rnd)
  for (let i = 0; i < 12; i++) {
    const x = (rnd() * 13) | 0
    const y = (rnd() * 13) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.5 ? '#252525' : '#676767', 2, 2)
  }
}

function paintSnow(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#f4f9fd', '#eaf3fa', '#ffffff', '#dfeaf4'], rnd)
  speckle(ctx, ox, oy, ['#cbdceb', '#ffffff'], rnd, 12)
}

function paintSnowSide(ctx, ox, oy, rnd) {
  paintDirt(ctx, ox, oy, rnd)
  for (let x = 0; x < 16; x++) {
    const d = 3 + ((rnd() * 2.4) | 0)
    for (let y = 0; y < d; y++) {
      px(ctx, ox, oy, x, y, y === d - 1 ? '#c9dbea' : ['#f4f9fd', '#eaf3fa', '#ffffff'][(rnd() * 3) | 0])
    }
  }
}

function paintGravel(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#8d857e', '#7c746d', '#9b938b', '#6f6862'], rnd)
  for (let i = 0; i < 18; i++) {
    const x = (rnd() * 14) | 0
    const y = (rnd() * 14) | 0
    const c = rnd() < 0.5 ? '#5e5852' : '#aea69d'
    px(ctx, ox, oy, x, y, c, 2, 2)
    px(ctx, ox, oy, x, y, 'rgba(255,255,255,0.18)')
  }
}

function paintSandstoneSide(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#dcc78d', '#e2cf97', '#d4bf84'], rnd)
  for (let y = 3; y < 16; y += 5) {
    px(ctx, ox, oy, 0, y, '#c3ad72', 16, 1)
    px(ctx, ox, oy, 0, y + 1, '#eddba6', 16, 1)
  }
  speckle(ctx, ox, oy, ['#c9b47a', '#f0dfae'], rnd, 14)
}

function paintSandstoneTop(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#e4d29b', '#ead9a6', '#ddca91'], rnd)
  for (let i = 0; i < 3; i++) {
    px(ctx, ox, oy, (rnd() * 12) | 0, (rnd() * 16) | 0, '#cdb87f', 3, 1)
  }
}

function paintOre(ctx, ox, oy, rnd, dark, light) {
  paintStone(ctx, ox, oy, rnd)
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((rnd() * 12) | 0)
    const y = 1 + ((rnd() * 12) | 0)
    px(ctx, ox, oy, x, y, dark, 2, 2)
    px(ctx, ox, oy, x, y, light, 1, 1)
    if (rnd() < 0.6) px(ctx, ox, oy, x + 2, y + 1, dark, 1, 1)
  }
}

function paintBricks(ctx, ox, oy, rnd) {
  px(ctx, ox, oy, 0, 0, '#b9a99a', 16, 16)
  const rows = [0, 4, 8, 12]
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r]
    const offset = r % 2 === 0 ? 0 : 4
    for (let x = -offset; x < 16; x += 8) {
      const bx = Math.max(0, x) + 1
      const bw = Math.min(8, x + 8) - bx
      if (bw <= 0) continue
      px(ctx, ox, oy, bx, y + 1, '#9c4a37', bw - 1, 2)
      px(ctx, ox, oy, bx, y + 1, '#ad5540', bw - 1, 1)
      px(ctx, ox, oy, bx, y + 2, '#8a3f2f', bw - 1, 1)
    }
  }
  speckle(ctx, ox, oy, ['#8a3f2f', '#b96049', '#c7b9aa'], rnd, 12)
}

function paintBirchSide(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#e7e1d2', '#ded7c6', '#f0ebdd', '#d5cdbb'], rnd)
  for (let i = 0; i < 7; i++) {
    const x = (rnd() * 12) | 0
    const y = (rnd() * 15) | 0
    px(ctx, ox, oy, x, y, '#3e3a32', 2 + ((rnd() * 3) | 0), 1)
    if (rnd() < 0.5) px(ctx, ox, oy, x + 1, y + 1, '#57524a', 1, 1)
  }
}

function paintBirchTop(ctx, ox, oy, rnd) {
  px(ctx, ox, oy, 0, 0, '#d9d0b9', 16, 16)
  noiseFill(ctx, ox, oy, ['#d2c8b0', '#e0d7c2', '#c9bfa7'], rnd)
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = '#9d927b'
    ctx.strokeRect(ox + 0.5 + i, oy + 0.5 + i, 15 - i * 2, 15 - i * 2)
  }
  px(ctx, ox, oy, 7, 7, '#7f755f', 2, 2)
}

function paintObsidian(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#1b1430', '#241a3f', '#150f27', '#2b204a'], rnd)
  for (let i = 0; i < 12; i++) {
    px(ctx, ox, oy, (rnd() * 16) | 0, (rnd() * 16) | 0, rnd() < 0.5 ? '#4a3678' : '#332554')
  }
  px(ctx, ox, oy, 3, 3, '#6b51a3', 1, 1)
  px(ctx, ox, oy, 12, 10, '#5a438a', 1, 1)
}

function paintGlowstone(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#c99a43', '#d9aa52', '#b98938', '#e3ba68'], rnd)
  for (let i = 0; i < 18; i++) {
    const x = (rnd() * 14) | 0
    const y = (rnd() * 14) | 0
    px(ctx, ox, oy, x, y, '#f8dd8a', 2, 2)
    px(ctx, ox, oy, x, y, '#fff3c4')
  }
  for (let i = 0; i < 5; i++) {
    px(ctx, ox, oy, (rnd() * 16) | 0, (rnd() * 16) | 0, '#8f6424', 2, 1)
  }
}

function paintCraftingTop(ctx, ox, oy, rnd) {
  paintPlanks(ctx, ox, oy, rnd)
  ctx.strokeStyle = '#5d3f22'
  for (let i = 1; i < 3; i++) {
    px(ctx, ox, oy, i * 5, 0, '#5d3f22', 1, 16)
    px(ctx, ox, oy, 0, i * 5, '#5d3f22', 16, 1)
  }
  speckle(ctx, ox, oy, ['#7a532c', '#c08f55'], rnd, 10)
}

function paintCraftingSide(ctx, ox, oy, rnd) {
  paintPlanks(ctx, ox, oy, rnd)
  px(ctx, ox, oy, 0, 0, '#7a532c', 16, 1)
  px(ctx, ox, oy, 2, 4, '#6b4a29', 5, 1)
  px(ctx, ox, oy, 2, 5, '#d4b07a', 1, 4)
  px(ctx, ox, oy, 6, 5, '#d4b07a', 1, 3)
  px(ctx, ox, oy, 9, 3, '#8d8d8d', 6, 2)
  px(ctx, ox, oy, 11, 5, '#6b4a29', 2, 6)
}

function paintFlower(ctx, ox, oy, rnd, petal, center) {
  ctx.clearRect(ox, oy, TILE, TILE)
  for (let y = 8; y < 16; y++) px(ctx, ox, oy, 7, y, '#3f7a2a')
  px(ctx, ox, oy, 5, 11, '#4b8b33', 2, 1)
  px(ctx, ox, oy, 9, 9, '#4b8b33', 2, 1)
  px(ctx, ox, oy, 6, 12, '#4b8b33')
  const petals = [[6, 4], [7, 3], [8, 4], [9, 5], [8, 6], [7, 7], [6, 6], [5, 5], [6, 5], [7, 4], [8, 5], [7, 6]]
  for (const [x, y] of petals) px(ctx, ox, oy, x, y, petal)
  px(ctx, ox, oy, 7, 5, center, 1, 1)
}

function paintGrassTuft(ctx, ox, oy, rnd) {
  ctx.clearRect(ox, oy, TILE, TILE)
  for (let i = 0; i < 9; i++) {
    let x = 2 + ((rnd() * 12) | 0)
    const h = 4 + ((rnd() * 7) | 0)
    for (let k = 0; k < h; k++) {
      px(ctx, ox, oy, x, 15 - k, k > h - 3 ? '#7dbb4f' : (rnd() < 0.5 ? '#4d8b2c' : '#5c9f36'))
      if (k > 2 && rnd() < 0.22) x += rnd() < 0.5 ? 1 : -1
    }
  }
  for (let i = 0; i < 3; i++) px(ctx, ox, oy, 4 + ((rnd() * 8) | 0), 13 + ((rnd() * 3) | 0), '#365f21')
}

function paintDeadBush(ctx, ox, oy, rnd) {
  ctx.clearRect(ox, oy, TILE, TILE)
  for (let i = 0; i < 6; i++) {
    let x = 4 + ((rnd() * 8) | 0)
    for (let k = 0; k < 8; k++) {
      px(ctx, ox, oy, x, 15 - k, '#6d4a28')
      if (k > 2 && rnd() < 0.3) x += rnd() < 0.5 ? 1 : -1
    }
  }
  px(ctx, ox, oy, 7, 8, '#8a6135', 2, 1)
  px(ctx, ox, oy, 4, 11, '#8a6135', 2, 1)
}

function paintPumpkinSide(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#d87920', '#e28628', '#c96b18', '#ea9134'], rnd)
  for (let x = 1; x < 16; x += 3) {
    px(ctx, ox, oy, x, 0, '#b65e12', 1, 16)
    px(ctx, ox, oy, x + 1, 0, '#f09b3d', 1, 16)
  }
  speckle(ctx, ox, oy, ['#b65e12', '#f4a84d'], rnd, 12)
}

function paintPumpkinTop(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, ['#d87920', '#e28628', '#c96b18'], rnd)
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = '#b65e12'
    ctx.strokeRect(ox + 1.5 + i, oy + 1.5 + i, 13 - i * 2, 13 - i * 2)
  }
  px(ctx, ox, oy, 7, 7, '#5f7d2a', 3, 4)
  px(ctx, ox, oy, 8, 6, '#7c9e3a', 2, 1)
}

function paintWool(ctx, ox, oy, rnd, base, shade, light) {
  noiseFill(ctx, ox, oy, [base, base, shade, light], rnd)
  for (let y = 0; y < 16; y += 4) {
    for (let x = 0; x < 16; x += 4) {
      if ((x + y) % 8 === 0) px(ctx, ox, oy, x, y, shade)
    }
  }
  speckle(ctx, ox, oy, [shade, light], rnd, 14)
}

function paintStoneBricks(ctx, ox, oy, rnd) {
  noiseFill(ctx, ox, oy, palette.stone, rnd)
  for (let r = 0; r < 4; r++) {
    const y = r * 4
    px(ctx, ox, oy, 0, y, '#6f6f6f', 16, 1)
    const offset = r % 2 === 0 ? 0 : 4
    for (let x = offset; x < 16; x += 8) {
      px(ctx, ox, oy, (x + 16) % 16, y, '#6f6f6f', 1, 4)
    }
    for (let i = 0; i < 3; i++) px(ctx, ox, oy, (rnd() * 15) | 0, y + 1 + ((rnd() * 3) | 0), rnd() < 0.5 ? '#777777' : '#a0a0a0')
  }
}

function paintMossyStone(ctx, ox, oy, rnd) {
  paintStone(ctx, ox, oy, rnd)
  for (let i = 0; i < 30; i++) {
    const x = (rnd() * 16) | 0
    const y = (rnd() * 16) | 0
    px(ctx, ox, oy, x, y, rnd() < 0.5 ? '#5d7f39' : '#76994a')
  }
}

let atlasCanvas = null

export function buildAtlas() {
  if (atlasCanvas) return atlasCanvas
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_SIZE
  canvas.height = ATLAS_SIZE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const at = (tile) => [(tile % ATLAS_COLS) * TILE, Math.floor(tile / ATLAS_COLS) * TILE]
  const rnd = mulberry32(0x5eed1234)
  const draw = (tile, fn) => fn(ctx, ...at(tile), rnd)

  draw(T.grassTop, paintGrassTop)
  draw(T.grassSide, paintGrassSide)
  draw(T.dirt, paintDirt)
  draw(T.stone, paintStone)
  draw(T.cobble, paintCobble)
  draw(T.sand, paintSand)
  draw(T.oakSide, paintOakSide)
  draw(T.oakTop, paintOakTop)
  draw(T.oakLeaves, (c, x, y, r) => paintLeaves(c, x, y, r, false))
  draw(T.planks, paintPlanks)
  draw(T.glass, paintGlass)
  draw(T.water, paintWater)
  draw(T.bedrock, paintBedrock)
  draw(T.snow, paintSnow)
  draw(T.snowSide, paintSnowSide)
  draw(T.gravel, paintGravel)
  draw(T.sandstoneSide, paintSandstoneSide)
  draw(T.sandstoneTop, paintSandstoneTop)
  draw(T.coalOre, (c, x, y, r) => paintOre(c, x, y, r, '#222222', '#4a4a4a'))
  draw(T.ironOre, (c, x, y, r) => paintOre(c, x, y, r, '#b28b6a', '#d8b58f'))
  draw(T.bricks, paintBricks)
  draw(T.birchSide, paintBirchSide)
  draw(T.birchTop, paintBirchTop)
  draw(T.birchLeaves, (c, x, y, r) => paintLeaves(c, x, y, r, true))
  draw(T.obsidian, paintObsidian)
  draw(T.glowstone, paintGlowstone)
  draw(T.craftingTop, paintCraftingTop)
  draw(T.craftingSide, paintCraftingSide)
  draw(T.flowerRed, (c, x, y, r) => paintFlower(c, x, y, r, '#d83b31', '#f6d552'))
  draw(T.flowerYellow, (c, x, y, r) => paintFlower(c, x, y, r, '#f2d33c', '#c98a24'))
  draw(T.grassTuft, paintGrassTuft)
  draw(T.deadBush, paintDeadBush)
  draw(T.pumpkinSide, paintPumpkinSide)
  draw(T.pumpkinTop, paintPumpkinTop)
  draw(T.whiteWool, (c, x, y, r) => paintWool(c, x, y, r, '#e9e9e9', '#cfcfcf', '#ffffff'))
  draw(T.redWool, (c, x, y, r) => paintWool(c, x, y, r, '#b02e26', '#8e211b', '#d2463c'))
  draw(T.blueWool, (c, x, y, r) => paintWool(c, x, y, r, '#3c44aa', '#2b3185', '#5860d1'))
  draw(T.yellowWool, (c, x, y, r) => paintWool(c, x, y, r, '#fed83d', '#d9b62a', '#fff08a'))
  draw(T.stoneBricks, paintStoneBricks)
  draw(T.mossyStone, paintMossyStone)

  atlasCanvas = canvas
  return canvas
}

export function atlasDataURL() {
  return buildAtlas().toDataURL('image/png')
}

export function createAtlasTexture() {
  const texture = new THREE.CanvasTexture(buildAtlas())
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapNearestFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

export function createWaterNormalTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const rnd = mulberry32(987)
  const waves = [
    { fx: 0.2, fy: 0.11, amp: 1.0, phase: rnd() * 6.28 },
    { fx: 0.09, fy: 0.23, amp: 0.7, phase: rnd() * 6.28 },
    { fx: 0.31, fy: -0.17, amp: 0.5, phase: rnd() * 6.28 },
  ]
  const height = (x, y) => {
    let h = 0
    for (const w of waves) h += Math.sin((x * w.fx + y * w.fy) * Math.PI * 2 + w.phase) * w.amp
    return h
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hx = height(x + 1, y) - height(x - 1, y)
      const hy = height(x, y + 1) - height(x, y - 1)
      const nx = -hx * 0.35
      const ny = -hy * 0.35
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      image.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      image.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      image.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

export const BLOCKS = [
  null,
  { id: 1, name: 'Grass Block', tiles: [T.grassTop, T.dirt, T.grassSide], opaque: true, solid: true, icon: 'grass' },
  { id: 2, name: 'Dirt', tiles: [T.dirt, T.dirt, T.dirt], opaque: true, solid: true },
  { id: 3, name: 'Stone', tiles: [T.stone, T.stone, T.stone], opaque: true, solid: true },
  { id: 4, name: 'Cobblestone', tiles: [T.cobble, T.cobble, T.cobble], opaque: true, solid: true },
  { id: 5, name: 'Sand', tiles: [T.sand, T.sand, T.sand], opaque: true, solid: true },
  { id: 6, name: 'Oak Log', tiles: [T.oakTop, T.oakTop, T.oakSide], opaque: true, solid: true },
  { id: 7, name: 'Oak Leaves', tiles: [T.oakLeaves, T.oakLeaves, T.oakLeaves], opaque: false, solid: true, cutout: true },
  { id: 8, name: 'Oak Planks', tiles: [T.planks, T.planks, T.planks], opaque: true, solid: true },
  { id: 9, name: 'Glass', tiles: [T.glass, T.glass, T.glass], opaque: false, solid: true, cutout: true },
  { id: 10, name: 'Water', tiles: [T.water, T.water, T.water], opaque: false, solid: false, liquid: true },
  { id: 11, name: 'Bedrock', tiles: [T.bedrock, T.bedrock, T.bedrock], opaque: true, solid: true, unbreakable: true },
  { id: 12, name: 'Snow Block', tiles: [T.snow, T.snow, T.snow], opaque: true, solid: true },
  { id: 13, name: 'Gravel', tiles: [T.gravel, T.gravel, T.gravel], opaque: true, solid: true },
  { id: 14, name: 'Sandstone', tiles: [T.sandstoneTop, T.sandstoneSide, T.sandstoneSide], opaque: true, solid: true },
  { id: 15, name: 'Coal Ore', tiles: [T.coalOre, T.coalOre, T.coalOre], opaque: true, solid: true },
  { id: 16, name: 'Iron Ore', tiles: [T.ironOre, T.ironOre, T.ironOre], opaque: true, solid: true },
  { id: 17, name: 'Bricks', tiles: [T.bricks, T.bricks, T.bricks], opaque: true, solid: true },
  { id: 18, name: 'Birch Log', tiles: [T.birchTop, T.birchTop, T.birchSide], opaque: true, solid: true },
  { id: 19, name: 'Birch Leaves', tiles: [T.birchLeaves, T.birchLeaves, T.birchLeaves], opaque: false, solid: true, cutout: true },
  { id: 20, name: 'Obsidian', tiles: [T.obsidian, T.obsidian, T.obsidian], opaque: true, solid: true },
  { id: 21, name: 'Glowstone', tiles: [T.glowstone, T.glowstone, T.glowstone], opaque: true, solid: true, light: 14 },
  { id: 22, name: 'Crafting Table', tiles: [T.craftingTop, T.planks, T.craftingSide], opaque: true, solid: true },
  { id: 23, name: 'Poppy', tiles: [T.flowerRed, T.flowerRed, T.flowerRed], opaque: false, solid: false, cross: true },
  { id: 24, name: 'Dandelion', tiles: [T.flowerYellow, T.flowerYellow, T.flowerYellow], opaque: false, solid: false, cross: true },
  { id: 25, name: 'Grass Tuft', tiles: [T.grassTuft, T.grassTuft, T.grassTuft], opaque: false, solid: false, cross: true },
  { id: 26, name: 'Dead Bush', tiles: [T.deadBush, T.deadBush, T.deadBush], opaque: false, solid: false, cross: true },
  { id: 27, name: 'Pumpkin', tiles: [T.pumpkinTop, T.pumpkinSide, T.pumpkinSide], opaque: true, solid: true },
  { id: 28, name: 'White Wool', tiles: [T.whiteWool, T.whiteWool, T.whiteWool], opaque: true, solid: true },
  { id: 29, name: 'Red Wool', tiles: [T.redWool, T.redWool, T.redWool], opaque: true, solid: true },
  { id: 30, name: 'Blue Wool', tiles: [T.blueWool, T.blueWool, T.blueWool], opaque: true, solid: true },
  { id: 31, name: 'Yellow Wool', tiles: [T.yellowWool, T.yellowWool, T.yellowWool], opaque: true, solid: true },
  { id: 32, name: 'Stone Bricks', tiles: [T.stoneBricks, T.stoneBricks, T.stoneBricks], opaque: true, solid: true },
  { id: 33, name: 'Mossy Stone', tiles: [T.mossyStone, T.mossyStone, T.mossyStone], opaque: true, solid: true },
]

export const PLACEABLE = BLOCKS.filter((b) => b && !b.liquid && b.id !== 11)

export function tileUV(tile, inset = 0.001) {
  const col = tile % ATLAS_COLS
  const row = Math.floor(tile / ATLAS_COLS)
  const u0 = col / ATLAS_COLS + inset
  const u1 = (col + 1) / ATLAS_COLS - inset
  const v1 = 1 - row / ATLAS_COLS - inset
  const v0 = 1 - (row + 1) / ATLAS_COLS + inset
  return { u0, u1, v0, v1 }
}

const tileCanvasCache = new Map()

function getTileCanvas(tile) {
  if (tileCanvasCache.has(tile)) return tileCanvasCache.get(tile)
  const atlas = buildAtlas()
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const col = tile % ATLAS_COLS
  const row = Math.floor(tile / ATLAS_COLS)
  ctx.drawImage(atlas, col * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE)
  tileCanvasCache.set(tile, canvas)
  return canvas
}

export function createBlockIcon(blockId, size = 96) {
  const block = BLOCKS[blockId]
  if (!block) return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const s = size / 64
  const ox = size / 2
  const oy = size / 2 - 2 * s

  if (block.cross) {
    ctx.save()
    ctx.setTransform(size / 32, 0, 0, size / 32, 0, 0)
    ctx.drawImage(getTileCanvas(block.tiles[0]), 0, 0, 16, 16, 0, 0, 32, 32)
    ctx.restore()
    return canvas
  }

  // top face
  ctx.save()
  ctx.setTransform(2 * s, -1 * s, 2 * s, 1 * s, ox - 32 * s, oy - 16 * s)
  ctx.drawImage(getTileCanvas(block.tiles[0]), 0, 0, 16, 16, 0, 0, 16, 16)
  ctx.restore()

  // left face
  ctx.save()
  ctx.setTransform(2 * s, 1 * s, 0, 2 * s, ox - 32 * s, oy + 16 * s)
  ctx.drawImage(getTileCanvas(block.tiles[2]), 0, 0, 16, 16, 0, 0, 16, 16)
  ctx.fillStyle = 'rgba(0,0,0,0.24)'
  ctx.fillRect(0, 0, 16, 16)
  ctx.restore()

  // right face
  ctx.save()
  ctx.setTransform(2 * s, -1 * s, 0, 2 * s, ox, oy + 32 * s)
  ctx.drawImage(getTileCanvas(block.tiles[2]), 0, 0, 16, 16, 0, 0, 16, 16)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(0, 0, 16, 16)
  ctx.restore()
  return canvas
}

export function blockAverageColor(blockId) {
  if (blockId === 10) return '#3f93c9'
  const block = BLOCKS[blockId]
  if (!block) return '#888888'
  const src = getTileCanvas(block.tiles[2])
  const ctx = src.getContext('2d')
  const data = ctx.getImageData(0, 0, TILE, TILE).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n++
  }
  if (!n) return '#888888'
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
}
