import * as THREE from 'three'
import { World, SPAWN, SEA_LEVEL, WORLD_SIZE, WORLD_CHUNKS } from './world.js'
import { Player } from './player.js'
import { BLOCKS, PLACEABLE, createBlockIcon, blockAverageColor } from './blocks.js'
import { Particles, Sky } from './effects.js'
import { MobManager } from './mobs.js'
import { SoundEngine } from './audio.js'
import { clamp } from './noise.js'

const $ = (id) => document.getElementById(id)
const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || innerWidth < 820

const SUN_DIR = new THREE.Vector3(-0.48, 0.64, 0.6).normalize()
const DEFAULT_HOTBAR = [1, 2, 4, 8, 6, 9, 5, 17, 21]

const state = {
  seed: 872341,
  world: null,
  player: null,
  renderer: null,
  scene: null,
  camera: null,
  sky: null,
  particles: null,
  mobs: null,
  sound: new SoundEngine(),
  menu: true,
  playing: false,
  paused: false,
  inventoryOpen: false,
  modalOpen: false,
  selected: 0,
  hotbar: [...DEFAULT_HOTBAR],
  target: null,
  time: 0,
  lastAction: 0,
  breaking: false,
  swing: 0,
  swingActive: false,
  toastTimer: 0,
  blockLabelTimer: 0,
  coordsTimer: 0,
  fpsTime: 0,
  fpsFrames: 0,
  fps: 60,
  baseFov: 72,
  sensitivity: 2.2,
  soundEnabled: true,
  wasLocked: false,
  touchMove: { x: 0, y: 0 },
  touchJump: false,
  touchBreakHeld: false,
  touchPlaceHeld: false,
  keys: Object.create(null),
}

let heldGroup = null
let heldMaterial = null
let highlight = null

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

boot().catch((error) => {
  console.error(error)
  const loading = $('loading')
  if (loading) {
    loading.querySelector('.loading-title').textContent = 'The world failed to generate'
    loading.querySelector('.loading-note').textContent = String(error && error.message ? error.message : error)
    loading.querySelector('.loading-bar').style.display = 'none'
  }
})

async function boot() {
  document.body.classList.toggle('touch', isTouchDevice())
  const params = new URLSearchParams(location.search)
  state.seed = Number(params.get('seed')) || 872341
  $('seedLabel').textContent = String(state.seed)

  await nextFrame()
  await nextFrame()

  setupRenderer()
  setupScene()
  buildWorld()
  setupHeldItem()
  setupUI()
  setupInput()
  setupStatusIcons()

  $('titleWorldInfo').textContent = `${WORLD_SIZE} × ${WORLD_SIZE} blocks`
  const loading = $('loading')
  loading.classList.add('done')
  $('playBtn').disabled = false
  setTimeout(() => loading.classList.add('hidden'), 650)

  window.__game = state
  window.__debug = { THREE, camera: state.camera, player: state.player, world: state.world, state, heldGroup }
  requestAnimationFrame(loop)
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function setupRenderer() {
  const canvas = $('game')
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(innerWidth, innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = false
  state.renderer = renderer
}

function setupScene() {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xcfe7f5, 36, 88)
  state.scene = scene

  const camera = new THREE.PerspectiveCamera(state.baseFov, innerWidth / innerHeight, 0.055, 620)
  camera.rotation.order = 'YXZ'
  scene.add(camera)
  state.camera = camera

  const hemi = new THREE.HemisphereLight(0xc9e4f7, 0x738257, 1.35)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff3d8, 2.0)
  sun.position.copy(SUN_DIR).multiplyScalar(120)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x9dc7e8, 0.34)
  fill.position.set(-40, 30, -60)
  scene.add(fill)

  state.sky = new Sky(scene, SUN_DIR)

  const highlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005))
  highlight = new THREE.LineSegments(
    highlightGeometry,
    new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.62 }),
  )
  highlight.visible = false
  scene.add(highlight)
}

function buildWorld() {
  const start = performance.now()
  const world = new World(state.seed)
  state.world = world
  state.scene.add(world.group)
  console.info(`world built in ${(performance.now() - start).toFixed(0)}ms`)

  const player = new Player(world, SPAWN)
  state.player = player
  player.yaw = -0.62
  player.pitch = -0.16
  player.fov = state.baseFov
  player.fovTarget = state.baseFov
  player.update(0, { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false }, state.camera)

  state.particles = new Particles(state.scene)
  state.mobs = new MobManager(world, state.scene)

  // Put the camera in the scenic opening shot while the title is up.
  state.camera.position.set(SPAWN.x, SPAWN.y + player.eyeHeight, SPAWN.z)
  state.camera.rotation.set(-0.16, -0.62, 0)
}

function setupHeldItem() {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const uv = geometry.attributes.uv
  const faceTiles = [2, 2, 0, 1, 2, 2]
  for (let f = 0; f < 6; f++) {
    const tile = state.hotbar[0]
    const block = BLOCKS[tile]
    const tileIndex = block.tiles[faceTiles[f]]
    const col = tileIndex % 16
    const row = Math.floor(tileIndex / 16)
    const u0 = col / 16 + 0.0015
    const u1 = (col + 1) / 16 - 0.0015
    const v1 = 1 - row / 16 - 0.0015
    const v0 = 1 - (row + 1) / 16 + 0.0015
    const coords = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    for (let i = 0; i < 4; i++) {
      uv.setXY(f * 4 + i, coords[i][0], coords[i][1])
    }
  }
  uv.needsUpdate = true
  const shades = [0.86, 0.7, 1.12, 0.5, 0.98, 0.76]
  const colors = []
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) colors.push(shades[f], shades[f], shades[f])
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  heldMaterial = new THREE.MeshBasicMaterial({
    map: state.world.atlas,
    alphaTest: 0.35,
    vertexColors: true,
  })
  const mesh = new THREE.Mesh(geometry, heldMaterial)
  heldGroup = new THREE.Group()
  heldGroup.add(mesh)
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x121d0c, transparent: true, opacity: 0.5 }),
  )
  heldGroup.add(outline)
  heldGroup.position.set(0.48, -0.34, -1.0)
  heldGroup.rotation.set(0.28, -0.5, 0.03)
  heldGroup.scale.setScalar(0.24)
  heldGroup.visible = false
  state.camera.add(heldGroup)
}

function updateHeldTexture() {
  if (!heldGroup) return
  const geometry = heldGroup.children[0].geometry
  const uv = geometry.attributes.uv
  const block = BLOCKS[state.hotbar[state.selected]]
  const faceTiles = [2, 2, 0, 1, 2, 2]
  for (let f = 0; f < 6; f++) {
    const tileIndex = block.tiles[faceTiles[f]]
    const col = tileIndex % 16
    const row = Math.floor(tileIndex / 16)
    const u0 = col / 16 + 0.0015
    const u1 = (col + 1) / 16 - 0.0015
    const v1 = 1 - row / 16 - 0.0015
    const v0 = 1 - (row + 1) / 16 + 0.0015
    const coords = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, coords[i][0], coords[i][1])
  }
  uv.needsUpdate = true
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function setupUI() {
  $('playBtn').addEventListener('click', () => startGame())
  $('pauseBtn').addEventListener('click', () => pauseGame())
  $('resumeBtn').addEventListener('click', () => resumeGame())
  $('quitBtn').addEventListener('click', () => location.reload())
  $('newWorldBtn').addEventListener('click', () => {
    const next = Math.floor(Math.random() * 900000) + 100000
    location.search = `?seed=${next}`
  })
  $('bagBtn').addEventListener('click', () => toggleInventory())
  $('inventoryClose').addEventListener('click', () => closeInventory())
  $('soundBtn').addEventListener('click', () => toggleSound())
  $('pauseSettingsBtn').addEventListener('click', () => openSettings())
  $('settingsBtn').addEventListener('click', () => openSettings())
  $('controlsBtn').addEventListener('click', () => openControls())
  $('pauseControlsBtn').addEventListener('click', () => openControls())
  $('aboutBtn').addEventListener('click', () => openAbout())
  $('modalClose').addEventListener('click', () => closeModal())
  $('modalScreen').addEventListener('click', (event) => {
    if (event.target === $('modalScreen')) closeModal()
  })

  buildHotbar()
  buildInventory()
  updateHotbarUI()
  renderSoundButton()
  $('splash').textContent = pickSplash()
}

function pickSplash() {
  const splashes = [
    'Also try 3D!',
    'Now with 100% more cubes!',
    'Punch a tree!',
    'Bedrock, but in a browser!',
    'One block at a time.',
    'The lake is lovely today.',
    'No creepers. Probably.',
    'Made with 0 textures downloaded.',
    'Terraria who?',
  ]
  return splashes[Math.floor(Math.random() * splashes.length)]
}

function buildHotbar() {
  const hotbar = $('hotbar')
  hotbar.innerHTML = ''
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement('button')
    slot.className = 'slot'
    slot.dataset.slot = String(i)
    slot.setAttribute('aria-label', `Hotbar slot ${i + 1}`)
    const num = document.createElement('span')
    num.className = 'num'
    num.textContent = String(i + 1)
    const icon = createBlockIcon(state.hotbar[i], 96)
    if (icon) {
      icon.style.width = '82%'
      icon.style.height = '82%'
      slot.appendChild(icon)
    }
    slot.appendChild(num)
    slot.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      selectSlot(i)
    })
    hotbar.appendChild(slot)
  }
}

function refreshHotbarIcons() {
  const slots = $('hotbar').children
  for (let i = 0; i < slots.length; i++) {
    const old = slots[i].querySelector('canvas')
    if (old) old.remove()
    const icon = createBlockIcon(state.hotbar[i], 96)
    if (icon) {
      icon.style.width = '82%'
      icon.style.height = '82%'
      slots[i].insertBefore(icon, slots[i].firstChild)
    }
  }
}

function updateHotbarUI() {
  const slots = $('hotbar').children
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('selected', i === state.selected)
  }
  const grid = $('inventoryGrid')
  if (grid) {
    for (const item of grid.children) {
      item.classList.toggle('selected', Number(item.dataset.block) === state.hotbar[state.selected])
    }
  }
}

function selectSlot(index) {
  if (index < 0 || index > 8) return
  state.selected = index
  updateHotbarUI()
  updateHeldTexture()
  showBlockLabel(BLOCKS[state.hotbar[index]].name)
  state.sound.click()
}

function buildInventory() {
  const grid = $('inventoryGrid')
  grid.innerHTML = ''
  for (const block of PLACEABLE) {
    const item = document.createElement('button')
    item.className = 'inv-item'
    item.dataset.block = String(block.id)
    const icon = createBlockIcon(block.id, 88)
    if (icon) item.appendChild(icon)
    const label = document.createElement('span')
    label.textContent = block.name
    item.appendChild(label)
    item.addEventListener('click', () => {
      state.hotbar[state.selected] = block.id
      refreshHotbarIcons()
      updateHotbarUI()
      updateHeldTexture()
      state.sound.pickup()
      closeInventory()
      showBlockLabel(block.name)
      showToast(`${block.name} → slot ${state.selected + 1}`)
    })
    grid.appendChild(item)
  }
}

function setupStatusIcons() {
  const hearts = $('hearts')
  const hunger = $('hunger')
  hearts.innerHTML = ''
  hunger.innerHTML = ''
  for (let i = 0; i < 10; i++) {
    hearts.appendChild(makeStatusIcon('heart'))
    hunger.appendChild(makeStatusIcon('food'))
  }
}

function makeStatusIcon(type) {
  const canvas = document.createElement('canvas')
  canvas.width = 18
  canvas.height = 18
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  if (type === 'heart') {
    const pixels = [
      [3, 2], [4, 2], [5, 2], [9, 2], [10, 2], [11, 2],
      [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
      [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
      [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
      [5, 7], [6, 7], [7, 7], [8, 7], [9, 7],
      [6, 8], [7, 8], [8, 8],
      [7, 9],
    ]
    ctx.fillStyle = '#4a0d0d'
    for (const [x, y] of pixels) ctx.fillRect(x + 1, y + 2, 1, 1)
    ctx.fillStyle = '#e63b32'
    for (const [x, y] of pixels) ctx.fillRect(x + 1, y + 1, 1, 1)
    ctx.fillStyle = '#ff7a72'
    ctx.fillRect(4 + 1, 3 + 1, 2, 1)
    ctx.fillRect(3 + 1, 4 + 1, 1, 1)
  } else {
    ctx.fillStyle = '#3a1d0c'
    ctx.fillRect(3 + 1, 8 + 1, 6, 5)
    ctx.fillRect(8 + 1, 6 + 1, 5, 6)
    ctx.fillRect(11 + 1, 5 + 1, 3, 4)
    ctx.fillStyle = '#d9873f'
    ctx.fillRect(3 + 1, 8, 6, 5)
    ctx.fillRect(8 + 1, 6, 5, 6)
    ctx.fillStyle = '#f2c58c'
    ctx.fillRect(12 + 1, 4, 3, 4)
    ctx.fillRect(13 + 1, 3, 2, 2)
    ctx.fillStyle = '#fff0cf'
    ctx.fillRect(13 + 1, 4, 1, 1)
    ctx.fillStyle = '#a2571f'
    ctx.fillRect(4 + 1, 12, 4, 1)
  }
  return canvas
}

function showBlockLabel(text) {
  const label = $('blockLabel')
  label.textContent = text
  label.classList.add('show')
  state.blockLabelTimer = 1.7
}

function showToast(text, seconds = 2.6) {
  const toast = $('toast')
  toast.textContent = text
  toast.classList.add('show')
  state.toastTimer = seconds
}

function renderSoundButton() {
  const btn = $('soundBtn')
  btn.style.opacity = state.soundEnabled ? '1' : '0.52'
  const wave = btn.querySelector('.sound-wave')
  if (wave) wave.style.display = state.soundEnabled ? '' : 'none'
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled
  state.sound.setEnabled(state.soundEnabled)
  renderSoundButton()
  if (state.soundEnabled) state.sound.click()
  showToast(`Sound ${state.soundEnabled ? 'on' : 'off'}`)
}

function startGame() {
  if (state.playing) return
  state.menu = false
  state.playing = true
  state.paused = false
  $('titleScreen').classList.add('hidden')
  $('hud').classList.remove('hidden')
  $('pauseScreen').classList.add('hidden')
  document.body.classList.add('playing')
  document.body.classList.toggle('touch', isTouchDevice())
  state.player.respawn()
  state.player.fov = state.baseFov
  state.sound.init()
  state.sound.click()
  showBlockLabel(BLOCKS[state.hotbar[state.selected]].name)
  heldGroup.visible = true
}

function pauseGame() {
  if (!state.playing || state.paused) return
  state.paused = true
  state.breaking = false
  state.breaking = false
  state.keys = Object.create(null)
  $('pauseScreen').classList.remove('hidden')
  document.body.classList.remove('pointer-locked')
  if (document.pointerLockElement) document.exitPointerLock()
  state.sound.click()
}

function resumeGame() {
  if (!state.playing) return
  state.paused = false
  $('pauseScreen').classList.add('hidden')
  if (!isTouchDevice()) requestPointerLock()
  state.sound.click()
}

function toggleInventory() {
  if (!state.playing || state.paused || state.modalOpen) return
  if (state.inventoryOpen) closeInventory()
  else openInventory()
}

function openInventory() {
  state.inventoryOpen = true
  state.breaking = false
  state.keys = Object.create(null)
  $('inventoryScreen').classList.remove('hidden')
  updateHotbarUI()
  if (document.pointerLockElement) document.exitPointerLock()
  state.sound.click()
}

function closeInventory() {
  state.inventoryOpen = false
  $('inventoryScreen').classList.add('hidden')
  if (state.playing && !state.paused && !isTouchDevice()) requestPointerLock()
}

function openModal(title, sub, html) {
  state.modalOpen = true
  $('modalTitle').textContent = title
  $('modalSub').textContent = sub
  $('modalBody').innerHTML = html
  $('modalScreen').classList.remove('hidden')
  if (document.pointerLockElement) document.exitPointerLock()
  state.keys = Object.create(null)
  wireModal()
}

function closeModal() {
  state.modalOpen = false
  $('modalScreen').classList.add('hidden')
  state.keys = Object.create(null)
  if (state.playing && !state.paused && !state.inventoryOpen && !isTouchDevice()) requestPointerLock()
}

function openControls() {
  openModal(
    'Controls',
    'Move like a block person.',
    `
    <div class="control-grid">
      <kbd>W A S D</kbd><span>Walk and strafe</span>
      <kbd>Space</kbd><span>Jump · fly upward · swim upward</span>
      <kbd>Shift</kbd><span>Sneak slowly · fly downward</span>
      <kbd>Ctrl</kbd><span>Sprint</span>
      <kbd>LMB</kbd><span>Break the highlighted block (hold to keep mining)</span>
      <kbd>RMB</kbd><span>Place the selected block</span>
      <kbd>1 – 9</kbd><span>Pick a hotbar slot · scroll wheel also cycles</span>
      <kbd>E</kbd><span>Open the creative block palette</span>
      <kbd>F</kbd><span>Toggle creative flight</span>
      <kbd>R</kbd><span>Respawn at the lakeside</span>
      <kbd>M</kbd><span>Toggle sound</span>
      <kbd>Esc</kbd><span>Pause · release the mouse</span>
    </div>
    <p class="panel-sub" style="margin-top:18px">On a phone or tablet: drag the left stick to move, drag the world to look, then use the jump, break, and place buttons. Tap a hotbar slot to switch blocks.</p>
  `,
  )
}

function openSettings() {
  openModal(
    'Settings',
    'Fine-tune how the world feels.',
    `
    <div class="setting-row">
      <div><span class="setting-label">Look sensitivity</span><span class="setting-help">Mouse and touch drag speed.</span></div>
      <input id="sensitivityRange" type="range" min="0.8" max="5" step="0.1" value="${state.sensitivity}" />
    </div>
    <div class="setting-row">
      <div><span class="setting-label">Field of view</span><span class="setting-help">A wider view shows more of the valley.</span></div>
      <input id="fovRange" type="range" min="60" max="95" step="1" value="${state.baseFov}" />
    </div>
    <div class="setting-row">
      <div><span class="setting-label">Sound</span><span class="setting-help">Footsteps, block taps, and birdsong.</span></div>
      <button id="settingsSound" class="toggle ${state.soundEnabled ? 'on' : ''}">${state.soundEnabled ? 'ON' : 'OFF'}</button>
    </div>
    <div class="setting-row">
      <div><span class="setting-label">World seed</span><span class="setting-help">Share this seed with a friend.</span></div>
      <span class="setting-label" style="font-family:ui-monospace,monospace">${state.seed}</span>
    </div>
    <p class="panel-sub" style="margin-top:16px">Rendering: Three.js · procedural 16×16 textures · 9×9 chunk world. Every texture is painted at runtime.</p>
  `,
  )
}

function openAbout() {
  openModal(
    'About',
    'A small love letter to a very blocky game.',
    `
    <div class="about-body">
      <p class="tagline">MINECRAFT · BEDROCK STYLE is a fan-made, from-scratch browser tribute built with Three.js.</p>
      <p>There are no downloaded textures, models, or sound files. The grass, stone, oaks, clouds, water ripples, animals, and every little pixel are generated in code when the page loads.</p>
      <ul>
        <li>144 × 144 voxel world with lakes, caves, forests, ore, and snow-capped mountains</li>
        <li>First-person creative sandbox: walk, sprint, jump, swim, and fly</li>
        <li>Break and place 30+ blocks, with a creative palette and nine-slot hotbar</li>
        <li>Mobile touch controls, procedural animals, particles, and ambient sound</li>
      </ul>
      <p class="tagline">Not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Synergies AB.</p>
    </div>
  `,
  )
}

function wireModal() {
  const sensitivity = $('sensitivityRange')
  if (sensitivity) {
    sensitivity.addEventListener('input', () => {
      state.sensitivity = Number(sensitivity.value)
    })
  }
  const fov = $('fovRange')
  if (fov) {
    fov.addEventListener('input', () => {
      state.baseFov = Number(fov.value)
    })
  }
  const sound = $('settingsSound')
  if (sound) {
    sound.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled
      state.sound.setEnabled(state.soundEnabled)
      sound.textContent = state.soundEnabled ? 'ON' : 'OFF'
      sound.classList.toggle('on', state.soundEnabled)
      renderSoundButton()
      if (state.soundEnabled) state.sound.click()
    })
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function setupInput() {
  const canvas = $('game')

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      if (state.modalOpen) {
        closeModal()
        return
      }
      if (state.inventoryOpen) {
        closeInventory()
        return
      }
      if (state.playing && !state.paused) pauseGame()
      else if (state.paused) resumeGame()
      return
    }

    if (!state.playing || state.paused) return
    if (state.modalOpen || state.inventoryOpen) return

    if (event.code === 'KeyE') {
      event.preventDefault()
      toggleInventory()
      return
    }
    if (event.code === 'KeyF') {
      const flying = state.player.toggleFly()
      showToast(flying ? 'Creative flight: on' : 'Creative flight: off')
      state.sound.click()
      return
    }
    if (event.code === 'KeyR') {
      state.player.respawn()
      showToast('Returned to the lakeside')
      return
    }
    if (event.code === 'KeyM') {
      toggleSound()
      return
    }
    if (event.code === 'F3') {
      event.preventDefault()
      $('fps').classList.toggle('hidden')
      $('coords').classList.toggle('hidden')
      return
    }
    if (/^Digit[1-9]$/.test(event.code)) {
      selectSlot(Number(event.code.slice(5)) - 1)
      return
    }

    state.keys[event.code] = true
    if (['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault()
    }
  })

  window.addEventListener('keyup', (event) => {
    state.keys[event.code] = false
  })

  window.addEventListener('blur', () => {
    state.keys = Object.create(null)
    state.breaking = false
    state.touchJump = false
  })

  canvas.addEventListener('mousedown', (event) => {
    if (!state.playing || state.paused || state.inventoryOpen || state.modalOpen) return
    if (event.pointerType === 'touch') return
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.()
      return
    }
    if (event.button === 0) {
      state.breaking = true
      doBreak()
    } else if (event.button === 2) {
      doPlace()
    } else if (event.button === 1) {
      pickBlock()
      event.preventDefault()
    }
  })

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.breaking = false
  })

  canvas.addEventListener('contextmenu', (event) => event.preventDefault())

  document.addEventListener('mousemove', (event) => {
    if (!state.playing || state.paused || state.inventoryOpen || state.modalOpen) return
    if (document.pointerLockElement !== canvas) return
    const s = state.sensitivity * 0.001
    state.player.yaw -= event.movementX * s
    state.player.pitch -= event.movementY * s
    state.player.pitch = clamp(state.player.pitch, -Math.PI / 2 + 0.005, Math.PI / 2 - 0.005)
  })

  canvas.addEventListener('wheel', (event) => {
    if (!state.playing || state.paused) return
    event.preventDefault()
    const dir = Math.sign(event.deltaY)
    selectSlot((state.selected + (dir > 0 ? 1 : -1) + 9) % 9)
  }, { passive: false })

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas
    document.body.classList.toggle('pointer-locked', locked)
    if (!locked) state.breaking = false
    state.wasLocked = locked
  })

  canvas.addEventListener('click', () => {
    if (state.playing && !state.paused && !state.inventoryOpen && !state.modalOpen && document.pointerLockElement !== canvas && !isTouchDevice()) {
      canvas.requestPointerLock?.()
    }
  })

  window.addEventListener('resize', () => {
    state.renderer.setSize(innerWidth, innerHeight, false)
    state.camera.aspect = innerWidth / innerHeight
    state.camera.updateProjectionMatrix()
    document.body.classList.toggle('touch', isTouchDevice())
  })

  setupTouchControls()
}

function requestPointerLock() {
  if (isTouchDevice()) return
  const canvas = $('game')
  if (document.pointerLockElement !== canvas) {
    try {
      const result = canvas.requestPointerLock?.()
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      // Pointer lock is a nice-to-have; dragging still works on touch.
    }
  }
}

function setupTouchControls() {
  const joystick = $('joystick')
  const knob = $('joystickKnob')
  let joyPointer = null
  let joyCenter = { x: 0, y: 0 }

  const updateJoystick = (event) => {
    const dx = event.clientX - joyCenter.x
    const dy = event.clientY - joyCenter.y
    const len = Math.hypot(dx, dy)
    const max = 42
    const scale = len > max ? max / len : 1
    const nx = dx * scale
    const ny = dy * scale
    knob.style.transform = `translate(${nx}px, ${ny}px)`
    state.touchMove.x = clamp(nx / max, -1, 1)
    state.touchMove.y = clamp(ny / max, -1, 1)
  }

  joystick.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    joyPointer = event.pointerId
    joystick.setPointerCapture(event.pointerId)
    const rect = joystick.getBoundingClientRect()
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    updateJoystick(event)
  })

  joystick.addEventListener('pointermove', (event) => {
    if (joyPointer !== event.pointerId) return
    event.preventDefault()
    updateJoystick(event)
  })

  const endJoystick = (event) => {
    if (joyPointer !== event.pointerId) return
    joyPointer = null
    state.touchMove.x = 0
    state.touchMove.y = 0
    knob.style.transform = 'translate(0px, 0px)'
  }
  joystick.addEventListener('pointerup', endJoystick)
  joystick.addEventListener('pointercancel', endJoystick)

  const canvas = $('game')
  let lookPointer = null
  let lastLook = null
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !state.playing || state.paused || state.inventoryOpen || state.modalOpen) return
    lookPointer = event.pointerId
    lastLook = { x: event.clientX, y: event.clientY }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (lookPointer !== event.pointerId || !lastLook) return
    const dx = event.clientX - lastLook.x
    const dy = event.clientY - lastLook.y
    lastLook = { x: event.clientX, y: event.clientY }
    const s = state.sensitivity * 0.00135
    state.player.yaw -= dx * s
    state.player.pitch -= dy * s
    state.player.pitch = clamp(state.player.pitch, -Math.PI / 2 + 0.005, Math.PI / 2 - 0.005)
  })
  const endLook = (event) => {
    if (lookPointer !== event.pointerId) return
    lookPointer = null
    lastLook = null
  }
  canvas.addEventListener('pointerup', endLook)
  canvas.addEventListener('pointercancel', endLook)

  const holdButton = (id, onDown, onUp) => {
    const el = $(id)
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      el.setPointerCapture(event.pointerId)
      el.classList.add('held')
      onDown()
    })
    const up = (event) => {
      event.preventDefault()
      el.classList.remove('held')
      if (onUp) onUp()
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  holdButton('touchJump', () => { state.touchJump = true }, () => { state.touchJump = false })
  holdButton('touchBreak', () => { state.touchBreakHeld = true; doBreak() }, () => { state.touchBreakHeld = false })
  holdButton('touchPlace', () => { state.touchPlaceHeld = true; doPlace() }, () => { state.touchPlaceHeld = false })
  $('touchFly').addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const flying = state.player.toggleFly()
    showToast(flying ? 'Creative flight: on' : 'Creative flight: off')
    state.sound.click()
  })
}

function readInput() {
  const keys = state.keys
  let forward = 0
  let strafe = 0
  if (keys.KeyW) forward += 1
  if (keys.KeyS) forward -= 1
  if (keys.KeyD) strafe += 1
  if (keys.KeyA) strafe -= 1
  if (isTouchDevice()) {
    forward += -state.touchMove.y
    strafe += state.touchMove.x
  }
  return {
    forward: clamp(forward, -1, 1),
    strafe: clamp(strafe, -1, 1),
    jump: Boolean(keys.Space || state.touchJump),
    sneak: Boolean(keys.ShiftLeft || keys.ShiftRight),
    sprint: Boolean(keys.ControlLeft || keys.ControlRight || Math.hypot(strafe, forward) > 1.35),
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function raycast(origin, direction, maxDistance) {
  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)
  const stepX = Math.sign(direction.x)
  const stepY = Math.sign(direction.y)
  const stepZ = Math.sign(direction.z)
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / direction.x)
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / direction.y)
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / direction.z)
  let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(direction.x))
  let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(direction.y))
  let tMaxZ = stepZ === 0 ? Infinity : ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(direction.z))
  let normal = { x: 0, y: 0, z: 0 }
  let t = 0
  while (t <= maxDistance) {
    const block = BLOCKS[state.world.getBlock(x, y, z)]
    if (block && block.id !== 10) {
      return { x, y, z, id: block.id, nx: normal.x, ny: normal.y, nz: normal.z }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      normal = { x: -stepX, y: 0, z: 0 }
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      normal = { x: 0, y: -stepY, z: 0 }
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      normal = { x: 0, y: 0, z: -stepZ }
    }
  }
  return null
}

function updateTarget() {
  if (!state.playing || state.paused || state.inventoryOpen || state.modalOpen) {
    state.target = null
    highlight.visible = false
    return
  }
  const hit = raycast(state.camera.position, state.player.lookDirection, 6.2)
  state.target = hit
  if (hit) {
    highlight.visible = true
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
  } else {
    highlight.visible = false
  }
}

function doBreak() {
  const hit = state.target
  if (!hit) return
  const block = BLOCKS[hit.id]
  if (!block) return
  if (block.unbreakable) {
    showToast('Bedrock cannot be broken')
    return
  }
  const color = blockAverageColor(hit.id)
  state.world.setBlock(hit.x, hit.y, hit.z, 0)
  const above = state.world.getBlock(hit.x, hit.y + 1, hit.z)
  if (BLOCKS[above] && BLOCKS[above].cross) state.world.setBlock(hit.x, hit.y + 1, hit.z, 0)
  state.particles.spawnBlockBreak(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, color)
  state.sound.breakBlock()
  startSwing()
  state.target = null
  highlight.visible = false
}

function doPlace() {
  const hit = state.target
  if (!hit) return
  const id = state.hotbar[state.selected]
  const block = BLOCKS[id]
  if (!block) return
  const x = hit.x + hit.nx
  const y = hit.y + hit.ny
  const z = hit.z + hit.nz
  if (y < 0 || y >= 64) return
  const existing = state.world.getBlock(x, y, z)
  if (existing !== 0 && existing !== 10 && !(BLOCKS[existing] && BLOCKS[existing].cross)) return

  const p = state.player
  const half = p.width / 2
  const overlap = (
    x + 1 > p.position.x - half && x < p.position.x + half &&
    y + 1 > p.position.y && y < p.position.y + p.height &&
    z + 1 > p.position.z - half && z < p.position.z + half
  )
  if (overlap) {
    showToast('That block would hit you')
    return
  }

  state.world.setBlock(x, y, z, id)
  state.particles.spawnPlace(x + 0.5, y + 0.5, z + 0.5, blockAverageColor(id))
  state.sound.place()
  startSwing()
  state.target = null
  highlight.visible = false
}

function pickBlock() {
  const hit = state.target
  if (!hit) return
  const id = hit.id
  const index = state.hotbar.indexOf(id)
  if (index >= 0) {
    selectSlot(index)
  } else {
    state.hotbar[state.selected] = id
    refreshHotbarIcons()
    updateHotbarUI()
    updateHeldTexture()
    showBlockLabel(BLOCKS[id].name)
    showToast(`${BLOCKS[id].name} → slot ${state.selected + 1}`)
  }
}

function startSwing() {
  state.swingActive = true
  state.swing = 0
  state.lastAction = performance.now()
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let last = performance.now()
function loop(now) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000))
  last = now
  state.time += dt

  const { player, camera } = state

  if (state.menu) {
    camera.position.set(SPAWN.x, SPAWN.y + player.eyeHeight, SPAWN.z)
    camera.rotation.set(-0.16, -0.62 + Math.sin(state.time * 0.06) * 0.055, 0)
    camera.fov = state.baseFov
    camera.updateProjectionMatrix()
  } else if (state.playing && !state.paused && !state.inventoryOpen && !state.modalOpen) {
    const input = readInput()
    player.baseFov = state.baseFov
    player.update(dt, input, camera)

    if (!state.paused) updateTarget()

    if (state.breaking || state.touchBreakHeld) {
      if (now - state.lastAction > 210) {
        state.lastAction = now
        doBreak()
      }
    }
    if (state.touchPlaceHeld && now - state.lastAction > 260) {
      state.lastAction = now
      doPlace()
    }

    if (player.stepped) {
      player.stepped = false
      state.sound.step()
    }
    if (player.jumped) {
      player.jumped = false
      state.sound.jump()
    }
    if (player.landed) {
      state.sound.step()
      player.landed = false
    }
    if (player.headInWater !== state.headInWater) {
      state.headInWater = player.headInWater
      $('waterOverlay').classList.toggle('active', player.headInWater)
      if (player.headInWater) state.sound.splash()
    }
    document.body.classList.toggle('pointer-locked', document.pointerLockElement === $('game'))
  }

  // Water sparkle animation.
  state.world.waterNormal.offset.x = state.time * 0.017
  state.world.waterNormal.offset.y = state.time * 0.009

  state.sky.update(dt, camera)
  state.mobs.update(dt, camera.position)
  state.particles.update(dt)
  updateHeld(dt)

  if (state.playing) {
    state.coordsTimer += dt
    if (state.coordsTimer > 0.18) {
      state.coordsTimer = 0
      const p = state.player.position
      $('coords').textContent = `X ${Math.floor(p.x)} · Y ${Math.floor(p.y)} · Z ${Math.floor(p.z)}`
    }
    state.fpsFrames++
    state.fpsTime += dt
    if (state.fpsTime > 0.5) {
      state.fps = Math.round(state.fpsFrames / state.fpsTime)
      $('fps').textContent = `${state.fps} FPS`
      state.fpsFrames = 0
      state.fpsTime = 0
    }
  }

  if (state.blockLabelTimer > 0) {
    state.blockLabelTimer -= dt
    if (state.blockLabelTimer <= 0) $('blockLabel').classList.remove('show')
  }
  if (state.toastTimer > 0) {
    state.toastTimer -= dt
    if (state.toastTimer <= 0) $('toast').classList.remove('show')
  }

  state.sound.update(dt)
  state.renderer.render(state.scene, state.camera)
}

function updateHeld(dt) {
  if (!heldGroup) return
  heldGroup.visible = state.playing && !state.paused && !state.inventoryOpen && !state.modalOpen
  if (!heldGroup.visible) return
  const speed = Math.hypot(state.player.velocity.x, state.player.velocity.z)
  const walk = state.player.onGround ? speed : 0
  state.player.heldBob = (state.player.heldBob || 0) + dt * (4.5 + walk * 2.2)
  const bobX = Math.sin(state.player.heldBob) * 0.012 * Math.min(1, walk / 4)
  const bobY = Math.cos(state.player.heldBob * 2) * 0.012 * Math.min(1, walk / 4)
  let swing = 0
  if (state.swingActive) {
    state.swing += dt * 7.5
    if (state.swing >= 1) {
      state.swing = 0
      state.swingActive = false
    } else {
      swing = Math.sin(state.swing * Math.PI)
    }
  }
  heldGroup.position.set(
    0.48 + bobX - swing * 0.13,
    -0.34 + bobY - swing * 0.17,
    -1.0 - swing * 0.1,
  )
  heldGroup.rotation.set(0.28 - swing * 1.0, -0.5 + swing * 0.4, 0.03 - swing * 0.2)
}
