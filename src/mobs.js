import * as THREE from 'three'
import { SEA_LEVEL } from './world.js'

const materials = new Map()
function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }))
  return materials.get(color)
}

function box(parent, w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

export class MobManager {
  constructor(world, scene) {
    this.world = world
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)
    this.mobs = []
    this.time = 0

    this.spawn('sheep', 68, 74)
    this.spawn('sheep', 92, 94)
    this.spawn('sheep', 62, 100)
    this.spawn('pig', 84, 108)
    this.spawn('pig', 94, 76)
    this.spawn('chicken', 70, 62)
    this.spawn('chicken', 64, 86)
    this.spawn('cow', 58, 92)
  }

  spawn(type, x, z) {
    const spot = this.findSpot(x, z, type === 'chicken' ? 3 : 6)
    if (!spot) return
    let mesh
    if (type === 'sheep') mesh = buildSheep()
    else if (type === 'pig') mesh = buildPig()
    else if (type === 'chicken') mesh = buildChicken()
    else mesh = buildCow()
    mesh.group.position.set(spot.x, spot.y, spot.z)
    mesh.group.rotation.y = Math.random() * Math.PI * 2
    this.group.add(mesh.group)
    const mob = {
      type,
      ...mesh,
      home: new THREE.Vector2(spot.x, spot.z),
      target: new THREE.Vector2(spot.x, spot.z),
      heading: mesh.group.rotation.y,
      timer: 1 + Math.random() * 4,
      walking: false,
      speed: type === 'chicken' ? 0.92 : 0.62 + Math.random() * 0.2,
      phase: Math.random() * 10,
      groundY: spot.y,
    }
    this.mobs.push(mob)
  }

  findSpot(x, z, radius) {
    for (let attempt = 0; attempt < 22; attempt++) {
      const tx = Math.floor(x + (Math.random() - 0.5) * radius * 2)
      const tz = Math.floor(z + (Math.random() - 0.5) * radius * 2)
      if (tx < 3 || tz < 3 || tx > 140 || tz > 140) continue
      const h = this.world.surfaceHeight(tx, tz)
      if (h <= SEA_LEVEL) continue
      const top = this.world.getBlock(tx, h, tz)
      if (![1, 2, 5, 12].includes(top)) continue
      if (this.world.getBlock(tx, h + 1, tz) !== 0) continue
      return { x: tx + 0.5, y: h + 1.001, z: tz + 0.5 }
    }
    return null
  }

  update(dt, playerPos) {
    this.time += dt
    for (const mob of this.mobs) {
      mob.timer -= dt
      if (mob.timer <= 0) {
        if (mob.walking) {
          mob.walking = false
          mob.timer = 1.8 + Math.random() * 5
        } else {
          const angle = Math.random() * Math.PI * 2
          const dist = 2 + Math.random() * 9
          const tx = mob.home.x + Math.cos(angle) * dist
          const tz = mob.home.y + Math.sin(angle) * dist
          const h = this.world.surfaceHeight(Math.floor(tx), Math.floor(tz))
          const top = this.world.getBlock(Math.floor(tx), h, Math.floor(tz))
          const blocked = this.world.getBlock(Math.floor(tx), h + 1, Math.floor(tz)) !== 0
          if (h > SEA_LEVEL && [1, 2, 5, 12].includes(top) && !blocked) {
            mob.target.set(tx, tz)
            mob.walking = true
            mob.timer = 3 + Math.random() * 6
          } else {
            mob.walking = false
            mob.timer = 1.5 + Math.random() * 3
          }
        }
      }

      const g = mob.group
      if (mob.walking) {
        const dx = mob.target.x - g.position.x
        const dz = mob.target.y - g.position.z
        const d = Math.hypot(dx, dz)
        if (d < 0.35) {
          mob.walking = false
          mob.timer = 1.4 + Math.random() * 4
        } else {
          const sx = (dx / d) * mob.speed * dt
          const sz = (dz / d) * mob.speed * dt
          const nextX = g.position.x + sx
          const nextZ = g.position.z + sz
          const gh = this.world.surfaceHeight(Math.floor(nextX), Math.floor(nextZ))
          const top = this.world.getBlock(Math.floor(nextX), gh, Math.floor(nextZ))
          if (gh > SEA_LEVEL && [1, 2, 5, 12].includes(top) && this.world.getBlock(Math.floor(nextX), gh + 1, Math.floor(nextZ)) === 0) {
            g.position.x = nextX
            g.position.z = nextZ
            mob.groundY = gh + 1.001
            const targetHeading = Math.atan2(-sx, -sz)
            let diff = targetHeading - mob.heading
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            mob.heading += diff * Math.min(1, dt * 6)
            g.rotation.y = mob.heading
          } else {
            mob.walking = false
            mob.timer = 1 + Math.random() * 2
          }
        }
      }

      const bob = Math.sin(this.time * 2 + mob.phase) * 0.008
      g.position.y += (mob.groundY + bob - g.position.y) * Math.min(1, dt * 10)
      mob.phase += dt * (mob.walking ? mob.speed * 9 : 1.8)
      const swing = mob.walking ? Math.sin(mob.phase) * 0.55 : 0
      for (let i = 0; i < mob.legs.length; i++) {
        mob.legs[i].rotation.x = swing * (i % 2 === 0 ? 1 : -1)
      }
      if (mob.head) {
        const dx = playerPos.x - g.position.x
        const dz = playerPos.z - g.position.z
        if (Math.hypot(dx, dz) < 9) {
          let targetHeading = Math.atan2(-dx * 0.35, -dz * 0.35)
          let diff = targetHeading - mob.heading
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          mob.head.rotation.y += (diff * 0.7 - mob.head.rotation.y) * Math.min(1, dt * 3)
          mob.head.rotation.x += (0.06 - mob.head.rotation.x) * Math.min(1, dt * 2)
        } else {
          mob.head.rotation.y += (0 - mob.head.rotation.y) * Math.min(1, dt * 2)
        }
      }
    }
  }
}

function buildSheep() {
  const group = new THREE.Group()
  const wool = '#e8e4d8'
  const woolLight = '#f2eee3'
  const face = '#d1bda2'
  const horn = '#b7a58d'
  const body = box(group, 1.05, 0.68, 0.66, wool, 0, 0.94, 0)
  box(group, 0.7, 0.12, 0.5, woolLight, 0, 1.3, 0)
  box(group, 0.32, 0.16, 0.42, woolLight, -0.3, 1.33, 0.05)
  box(group, 0.34, 0.14, 0.38, woolLight, 0.28, 1.3, -0.06)
  const head = new THREE.Group()
  head.position.set(0, 1.03, -0.48)
  group.add(head)
  box(head, 0.48, 0.48, 0.48, face, 0, 0, -0.1)
  box(head, 0.5, 0.2, 0.18, wool, 0, 0.26, -0.02)
  box(head, 0.1, 0.12, 0.08, '#262421', -0.14, 0.08, -0.35)
  box(head, 0.1, 0.12, 0.08, '#262421', 0.14, 0.08, -0.35)
  box(head, 0.16, 0.08, 0.08, '#a58f75', 0, -0.08, -0.36)
  box(head, 0.16, 0.12, 0.14, horn, -0.27, 0.16, -0.04)
  box(head, 0.16, 0.12, 0.14, horn, 0.27, 0.16, -0.04)
  const legs = []
  for (const [x, z] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.22], [0.32, 0.22]]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.58, z)
    box(leg, 0.18, 0.58, 0.18, '#d9d4c7', 0, -0.28, 0)
    box(leg, 0.2, 0.1, 0.2, '#b9b3a5', 0, -0.55, 0)
    group.add(leg)
    legs.push(leg)
  }
  void body
  return { group, legs, head, body }
}

function buildPig() {
  const group = new THREE.Group()
  const skin = '#e8949a'
  const skinDark = '#d67f87'
  const body = box(group, 1.12, 0.62, 0.66, skin, 0, 0.85, 0)
  box(group, 0.52, 0.18, 0.44, skinDark, 0, 1.18, 0.05)
  const head = new THREE.Group()
  head.position.set(0, 0.92, -0.48)
  group.add(head)
  box(head, 0.56, 0.5, 0.5, skin, 0, 0, -0.08)
  box(head, 0.3, 0.22, 0.16, skinDark, 0, -0.05, -0.36)
  box(head, 0.06, 0.08, 0.03, '#7f464c', -0.08, -0.03, -0.45)
  box(head, 0.06, 0.08, 0.03, '#7f464c', 0.08, -0.03, -0.45)
  box(head, 0.1, 0.12, 0.06, '#262421', -0.17, 0.13, -0.32)
  box(head, 0.1, 0.12, 0.06, '#262421', 0.17, 0.13, -0.32)
  box(head, 0.16, 0.2, 0.08, skinDark, -0.26, 0.3, -0.1)
  box(head, 0.16, 0.2, 0.08, skinDark, 0.26, 0.3, -0.1)
  const legs = []
  for (const [x, z] of [[-0.34, -0.2], [0.34, -0.2], [-0.34, 0.22], [0.34, 0.22]]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.56, z)
    box(leg, 0.2, 0.56, 0.2, skin, 0, -0.27, 0)
    box(leg, 0.22, 0.12, 0.22, skinDark, 0, -0.52, 0)
    group.add(leg)
    legs.push(leg)
  }
  void body
  return { group, legs, head, body }
}

function buildChicken() {
  const group = new THREE.Group()
  const feather = '#f3f0e4'
  const featherShade = '#e2ddcb'
  const body = box(group, 0.56, 0.48, 0.46, feather, 0, 0.62, 0)
  box(group, 0.4, 0.14, 0.36, featherShade, -0.04, 0.84, 0.04)
  const head = new THREE.Group()
  head.position.set(0, 0.88, -0.18)
  group.add(head)
  box(head, 0.3, 0.32, 0.3, feather, 0, 0.08, -0.04)
  box(head, 0.08, 0.16, 0.08, '#c9413c', 0, 0.29, -0.03)
  box(head, 0.08, 0.14, 0.08, '#c9413c', 0, 0.26, 0.09)
  box(head, 0.1, 0.06, 0.14, '#e8b13b', 0, 0.04, -0.26)
  box(head, 0.065, 0.09, 0.05, '#262421', -0.1, 0.12, -0.18)
  box(head, 0.065, 0.09, 0.05, '#262421', 0.1, 0.12, -0.18)
  box(group, 0.2, 0.34, 0.12, featherShade, 0, 0.62, 0.32)
  const legs = []
  for (const [x, z] of [[-0.13, 0.04], [0.13, 0.04]]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.33, z)
    box(leg, 0.06, 0.33, 0.06, '#d19a3c', 0, -0.16, 0)
    box(leg, 0.16, 0.04, 0.18, '#d19a3c', 0, -0.33, -0.03)
    group.add(leg)
    legs.push(leg)
  }
  void body
  return { group, legs, head, body }
}

function buildCow() {
  const group = new THREE.Group()
  const hide = '#3b3833'
  const patch = '#ece8db'
  const body = box(group, 1.36, 0.78, 0.72, hide, 0, 1.04, 0)
  box(group, 0.72, 0.2, 0.44, patch, -0.12, 1.46, 0.05)
  box(group, 0.4, 0.5, 0.5, patch, 0.42, 1.06, -0.18)
  const head = new THREE.Group()
  head.position.set(0, 1.08, -0.52)
  group.add(head)
  box(head, 0.52, 0.52, 0.52, hide, 0, 0, -0.06)
  box(head, 0.34, 0.2, 0.2, '#b9aa93', 0, -0.12, -0.33)
  box(head, 0.1, 0.08, 0.04, '#5b4a3b', -0.07, -0.09, -0.42)
  box(head, 0.1, 0.08, 0.04, '#5b4a3b', 0.07, -0.09, -0.42)
  box(head, 0.11, 0.12, 0.06, '#161514', -0.15, 0.12, -0.33)
  box(head, 0.11, 0.12, 0.06, '#161514', 0.15, 0.12, -0.33)
  box(head, 0.12, 0.22, 0.12, '#ddd5bf', -0.22, 0.29, -0.05)
  box(head, 0.12, 0.22, 0.12, '#ddd5bf', 0.22, 0.29, -0.05)
  const legs = []
  for (const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.25], [0.42, 0.25]]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.7, z)
    box(leg, 0.22, 0.72, 0.22, hide, 0, -0.34, 0)
    box(leg, 0.24, 0.12, 0.24, '#2c2925', 0, -0.66, 0)
    group.add(leg)
    legs.push(leg)
  }
  void body
  return { group, legs, head, body }
}
