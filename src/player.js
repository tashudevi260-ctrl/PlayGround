import * as THREE from 'three'
import { BLOCKS } from './blocks.js'
import { clamp } from './noise.js'

const EPS = 1e-4

export class Player {
  constructor(world, spawn) {
    this.world = world
    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z)
    this.velocity = new THREE.Vector3()
    this.yaw = -0.62
    this.pitch = -0.16
    this.width = 0.6
    this.height = 1.8
    this.eyeHeight = 1.62
    this.flying = false
    this.onGround = false
    this.inWater = false
    this.headInWater = false
    this.sneaking = false
    this.sprinting = false
    this.moveAmount = 0
    this.bobPhase = 0
    this.bob = 0
    this.stepTimer = 0
    this.jumpCooldown = 0
    this.baseFov = 72
    this.fov = 72
    this.fovTarget = 72
    this.lastLandSpeed = 0
    this.spawn = new THREE.Vector3(spawn.x, spawn.y + 0.2, spawn.z)
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight + this.bob, this.position.z)
  }

  get lookDirection() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize()
  }

  respawn() {
    this.position.copy(this.spawn)
    this.velocity.set(0, 0, 0)
    this.flying = false
    this.yaw = -0.62
    this.pitch = -0.16
  }

  toggleFly() {
    this.flying = !this.flying
    this.velocity.y = 0
    return this.flying
  }

  collides(x, y, z) {
    const r = this.width / 2
    const x0 = Math.floor(x - r + EPS)
    const x1 = Math.floor(x + r - EPS)
    const y0 = Math.floor(y + EPS)
    const y1 = Math.floor(y + this.height - EPS)
    const z0 = Math.floor(z - r + EPS)
    const z1 = Math.floor(z + r - EPS)
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          if (this.world.isSolid(bx, by, bz)) return true
        }
      }
    }
    return false
  }

  checkWater() {
    const r = this.width / 2
    const feet = this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + 0.1), Math.floor(this.position.z))
    const body = this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + 0.9), Math.floor(this.position.z))
    const head = this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + this.eyeHeight), Math.floor(this.position.z))
    this.inWater = feet === 10 || body === 10
    this.headInWater = head === 10
    void r
  }

  moveAxis(axis, amount) {
    if (!amount) return false
    const pos = this.position
    const old = pos[axis]
    pos[axis] += amount
    if (!this.collides(pos.x, pos.y, pos.z)) return false
    if (axis === 'x') {
      if (amount > 0) pos.x = Math.floor(pos.x + this.width / 2) - this.width / 2 - EPS
      else pos.x = Math.floor(pos.x - this.width / 2) + 1 + this.width / 2 + EPS
    } else if (axis === 'z') {
      if (amount > 0) pos.z = Math.floor(pos.z + this.width / 2) - this.width / 2 - EPS
      else pos.z = Math.floor(pos.z - this.width / 2) + 1 + this.width / 2 + EPS
    } else {
      if (amount > 0) {
        pos.y = Math.floor(pos.y + this.height) - this.height - EPS
      } else {
        pos.y = Math.floor(pos.y) + 1 + EPS
        if (!this.onGround && this.lastLandSpeed < -9) this.landed = true
        this.onGround = true
        this.lastLandSpeed = 0
      }
    }
    pos[axis] = old
    this.velocity[axis] = 0
    return true
  }

  update(dt, input, camera) {
    this.checkWater()
    const forward = input.forward || 0
    const strafe = input.strafe || 0
    const moving = forward !== 0 || strafe !== 0
    this.sneaking = Boolean(input.sneak) && !this.flying
    this.sprinting = Boolean(input.sprint) && moving && !this.sneaking

    let speed = this.flying ? 11.5 : this.sneaking ? 1.6 : this.sprinting ? 6.9 : 4.4
    if (this.inWater && !this.flying) speed *= 0.62

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    let wishX = (-sin * forward + cos * strafe)
    let wishZ = (-cos * forward - sin * strafe)
    const wishLen = Math.hypot(wishX, wishZ)
    if (wishLen > 1e-4) {
      wishX /= Math.max(1, wishLen)
      wishZ /= Math.max(1, wishLen)
    }
    this.moveAmount = Math.min(1, wishLen)

    const accel = this.flying ? 14 : this.onGround ? 34 : this.inWater ? 12 : 9
    const targetX = wishX * speed
    const targetZ = wishZ * speed
    const blend = 1 - Math.exp(-accel * dt)
    this.velocity.x += (targetX - this.velocity.x) * blend
    this.velocity.z += (targetZ - this.velocity.z) * blend

    if (this.flying) {
      const targetY = ((input.jump ? 1 : 0) - (input.sneak ? 1 : 0)) * (this.sprinting ? 16 : 10.5)
      this.velocity.y += (targetY - this.velocity.y) * (1 - Math.exp(-14 * dt))
      if (this.onGround && targetY < 0) {
        this.flying = false
      }
    } else if (this.inWater) {
      this.velocity.y -= 9 * dt
      if (input.jump) this.velocity.y += 26 * dt
      this.velocity.y *= Math.exp(-2.1 * dt)
      this.velocity.y = clamp(this.velocity.y, -4.5, 4.2)
      this.onGround = false
      if (this.collides(this.position.x, this.position.y - 0.05, this.position.z)) {
        this.velocity.y = Math.max(0, this.velocity.y)
      }
    } else {
      this.velocity.y -= 28 * dt
      if (input.jump && this.onGround && this.jumpCooldown <= 0) {
        this.velocity.y = 8.9
        this.onGround = false
        this.jumpCooldown = 0.16
        this.jumped = true
      }
      this.jumpCooldown = Math.max(0, this.jumpCooldown - dt)
    }

    const maxFall = this.flying ? 20 : 38
    this.velocity.y = clamp(this.velocity.y, -maxFall, 16)

    const dx = this.velocity.x * dt
    const dz = this.velocity.z * dt
    const beforeY = this.position.y
    const wasGround = this.onGround
    const oldGroundX = this.position.x
    const oldGroundZ = this.position.z
    this.onGround = false

    this.moveAxis('x', dx)
    this.moveAxis('z', dz)

    // Simple auto-step for one-block ledges while walking.
    const requested = Math.hypot(dx, dz)
    const actual = Math.hypot(this.position.x - oldGroundX, this.position.z - oldGroundZ)
    if (!this.flying && wasGround && requested > 0.0005 && actual < requested * 0.55) {
      const oldX = this.position.x
      const oldZ = this.position.z
      const testY = this.position.y + 1.02
      if (!this.collides(this.position.x, testY, this.position.z)) {
        this.position.y = testY
        this.moveAxis('x', dx)
        this.moveAxis('z', dz)
        if (this.collides(this.position.x, this.position.y, this.position.z)) {
          this.position.x = oldX
          this.position.z = oldZ
          this.position.y = beforeY
        } else {
          this.onGround = true
        }
      }
    }

    const fallSpeed = this.velocity.y
    this.onGround = false
    this.moveAxis('y', this.velocity.y * dt)
    if (this.onGround && fallSpeed < -8) this.landed = fallSpeed
    if (!this.onGround) {
      // Ground probe so we don't float a hair above blocks.
      if (this.velocity.y <= 0 && this.collides(this.position.x, this.position.y - 0.02, this.position.z)) {
        this.onGround = true
        this.velocity.y = 0
      }
    }

    // Keep the player inside the generated world.
    this.position.x = clamp(this.position.x, 2.5, this.world.constructor.WORLD_SIZE ? 141.5 : 141.5)
    this.position.z = clamp(this.position.z, 2.5, 141.5)
    if (this.position.y < -20) this.respawn()

    // Head bob and footsteps.
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.onGround && horizontalSpeed > 0.4) {
      this.bobPhase += dt * (this.sprinting ? 13.5 : 10.2)
      this.bob = Math.sin(this.bobPhase * 2) * (this.sprinting ? 0.055 : 0.04)
      this.stepTimer += dt * horizontalSpeed
      if (this.stepTimer > 2.35) {
        this.stepTimer = 0
        this.stepped = true
      }
    } else {
      this.bob += (0 - this.bob) * Math.min(1, dt * 10)
    }

    this.fovTarget = this.baseFov + (this.sprinting ? 6 : 0) + (this.flying ? 3 : 0)
    this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 7)
    if (camera) {
      camera.position.set(this.position.x, this.position.y + this.eyeHeight + this.bob, this.position.z)
      camera.rotation.order = 'YXZ'
      camera.rotation.y = this.yaw
      camera.rotation.x = this.pitch
      camera.fov = this.fov
      camera.updateProjectionMatrix()
    }
  }
}
