import * as THREE from 'three'

const MAX_PARTICLES = 420

export class Particles {
  constructor(scene) {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = MAX_PARTICLES
    this.mesh.renderOrder = 5
    this.items = []
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.items.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.1, spin: 0, spinVel: 0, rot: new THREE.Euler() })
      dummy.position.set(0, -1000, 0)
      dummy.scale.setScalar(0.0001)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
      color.setRGB(1, 1, 1)
      this.mesh.setColorAt(i, color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor.needsUpdate = true
    scene.add(this.mesh)
    this.cursor = 0
    this.dummy = dummy
  }

  spawnBurst(x, y, z, colorHex, count = 16, spread = 0.28) {
    const color = new THREE.Color(colorHex)
    for (let i = 0; i < count; i++) {
      const item = this.items[this.cursor]
      this.cursor = (this.cursor + 1) % MAX_PARTICLES
      item.active = true
      item.pos.set(x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.7, z + (Math.random() - 0.5) * 0.7)
      item.vel.set((Math.random() - 0.5) * 4.4, 1.2 + Math.random() * 3.6, (Math.random() - 0.5) * 4.4)
      item.life = 0.45 + Math.random() * 0.55
      item.maxLife = item.life
      item.size = 0.055 + Math.random() * 0.075
      item.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)
      item.spin = Math.random() * 8 - 4
      item.color = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12)
      void spread
    }
  }

  spawnBlockBreak(x, y, z, colorHex) {
    this.spawnBurst(x, y, z, colorHex, 22, 0.4)
  }

  spawnPlace(x, y, z, colorHex) {
    this.spawnBurst(x, y, z, colorHex, 7, 0.2)
  }

  update(dt) {
    const dummy = this.dummy
    let changed = false
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const item = this.items[i]
      if (!item.active) continue
      item.life -= dt
      if (item.life <= 0) {
        item.active = false
        dummy.position.set(0, -1000, 0)
        dummy.scale.setScalar(0.0001)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        this.mesh.setMatrixAt(i, dummy.matrix)
        changed = true
        continue
      }
      item.vel.y -= 17 * dt
      item.pos.addScaledVector(item.vel, dt)
      if (item.pos.y < 0.05) {
        item.pos.y = 0.05
        item.vel.y *= -0.25
        item.vel.x *= 0.6
        item.vel.z *= 0.6
      }
      item.rot.x += item.spin * dt
      item.rot.y += item.spin * 0.7 * dt
      const t = item.life / item.maxLife
      const s = item.size * (0.45 + t * 0.75)
      dummy.position.copy(item.pos)
      dummy.rotation.copy(item.rot)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
      this.mesh.setColorAt(i, item.color)
      changed = true
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }
  }
}

export class Sky {
  constructor(scene, sunDir) {
    this.scene = scene
    this.sunDir = sunDir.clone().normalize()
    const geometry = new THREE.SphereGeometry(420, 24, 16)
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: this.sunDir },
        uTop: { value: new THREE.Color(0x3f87d6) },
        uHorizon: { value: new THREE.Color(0xcfe7f7) },
        uBottom: { value: new THREE.Color(0x94b6c9) },
        uSunColor: { value: new THREE.Color(0xfff1c9) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform vec3 uSunColor;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          float h = dir.y;
          vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.72, h), 0.7));
          col = mix(uBottom, col, smoothstep(-0.28, 0.02, h));
          float sunDot = max(dot(dir, uSunDir), 0.0);
          float disc = smoothstep(0.9991, 0.99965, sunDot);
          float glow = pow(sunDot, 42.0) * 0.42 + pow(sunDot, 7.0) * 0.08;
          col += uSunColor * (disc * 1.6 + glow);
          float haze = (1.0 - smoothstep(0.0, 0.2, abs(h + 0.015))) * 0.14;
          col = mix(col, uHorizon * 1.04, haze);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    scene.add(this.mesh)

    this.clouds = []
    this.addCloudLayer(0xffffff, 0.82, 690, 0.0025, 86)
    this.addCloudLayer(0xffffff, 0.38, 900, 0.0013, 102)
  }

  addCloudLayer(color, opacity, size, speed, height) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    const image = ctx.createImageData(128, 128)
    const random = mulberry32Local(12345)
    const grid = 32
    const values = new Float32Array(grid * grid)
    for (let i = 0; i < values.length; i++) values[i] = random()
    const sample = (x, y) => {
      const xi = Math.floor(x) & (grid - 1)
      const yi = Math.floor(y) & (grid - 1)
      const xf = x - Math.floor(x)
      const yf = y - Math.floor(y)
      const v00 = values[yi * grid + xi]
      const v10 = values[yi * grid + ((xi + 1) & (grid - 1))]
      const v01 = values[((yi + 1) & (grid - 1)) * grid + xi]
      const v11 = values[((yi + 1) & (grid - 1)) * grid + ((xi + 1) & (grid - 1))]
      const u = xf * xf * (3 - 2 * xf)
      const v = yf * yf * (3 - 2 * yf)
      return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v
    }
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const n = sample(x / 16, y / 16) * 0.62 + sample(x / 7 + 31, y / 7 + 17) * 0.28 + sample(x / 3.4 + 9, y / 3.4 + 51) * 0.1
        const edge = smoothstepLocal(0.53, 0.63, n)
        const bright = 0.86 + Math.max(0, n - 0.58) * 0.55
        const i = (y * 128 + x) * 4
        image.data[i] = 255 * bright
        image.data[i + 1] = 255 * bright
        image.data[i + 2] = 255 * Math.min(1, bright + 0.03)
        image.data[i + 3] = edge * 230
      }
    }
    ctx.putImageData(image, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.repeat.set(3.5, 3.5)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      color,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = height
    plane.renderOrder = -900
    plane.frustumCulled = false
    this.scene.add(plane)
    this.clouds.push({ plane, texture, speed })
  }

  update(dt, camera) {
    this.mesh.position.copy(camera.position)
    for (const cloud of this.clouds) {
      cloud.texture.offset.x += cloud.speed * dt
      cloud.texture.offset.y += cloud.speed * 0.37 * dt
    }
  }
}

function smoothstepLocal(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mulberry32Local(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
