<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRetroAudio } from './composables/useRetroAudio'

// 1. TypeScript 型別定義
type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover' | 'win'
type BrickType = 'normal' | 'hard' | 'power_ball' | 'power_wide'

interface Brick {
  x: number
  y: number
  w: number
  h: number
  color: string
  hp: number
  type: BrickType
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  speed: number
}

interface Paddle {
  x: number
  y: number
  w: number
  h: number
  speed: number
}

// 2. 引入 Web Audio 復古音效
const {
  isMuted,
  toggleMute,
  playWallHit,
  playPaddleHit,
  playBrickDamage,
  playBrickBreak,
  playLoseLife,
  playWin,
  playGameOver,
} = useRetroAudio()

// 3. Vue 響應式 UI 狀態
const canvasRef = ref<HTMLCanvasElement | null>(null)
const status = ref<GameStatus>('idle')
const score = ref(0)
const lives = ref(3)

const formattedScore = computed(() => String(score.value).padStart(5, '0'))

// 畫布尺寸（接近圖片的復古比例）
const CANVAS_W = 420
const CANVAS_H = 420

// 遊戲內部物理物件（不放進 ref，避免每秒 60 次觸發 Vue 響應式開銷）
const paddle: Paddle = {
  x: CANVAS_W / 2 - 40,
  y: CANVAS_H - 32,
  w: 80,
  h: 8,
  speed: 340,
}

const ball: Ball = {
  x: CANVAS_W / 2,
  y: paddle.y - 7,
  vx: 0,
  vy: 0,
  radius: 6,
  speed: 280,
}

let bricks: Brick[] = []
let combo = 0
let brickAlpha = 0.38 // 待機時較暗 (0.38)，開始後會漸變到全亮 (1)
const keys = { left: false, right: false }
let animationId = 0
let lastTime = 0

// 4. 初始化關卡磚塊（4 排 x 7 列，使用亮色系為基底）
function initBricks() {
  const colors = ['#4f82e3', '#cc433e', '#e3b53b', '#3c8947']
  const cols = 7
  const rows = 4
  const brickW = 44
  const brickH = 20
  const gap = 4
  const offsetX = (CANVAS_W - (cols * brickW + (cols - 1) * gap)) / 2
  const offsetY = 20

  bricks = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isHardBrick = r === 0 && c === 3
      bricks.push({
        x: offsetX + c * (brickW + gap),
        y: offsetY + r * (brickH + gap),
        w: brickW,
        h: brickH,
        color: colors[r] ?? '#4f82e3',
        hp: isHardBrick ? 2 : 1, // 範例：第一排中間設為 2 滴血硬磚
        type: isHardBrick ? 'hard' : 'normal',
      })
    }
  }
}

function resetBallAndPaddle() {
  paddle.x = CANVAS_W / 2 - paddle.w / 2
  ball.x = CANVAS_W / 2
  ball.y = paddle.y - ball.radius - 1
  ball.vx = 0
  ball.vy = 0
}

function launchBall() {
  if (status.value !== 'idle') return
  status.value = 'playing'
  // 隨機往左上方或右上方發射
  const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25)
  ball.vx = Math.cos(angle) * ball.speed
  ball.vy = Math.sin(angle) * ball.speed
}

function restartGame() {
  score.value = 0
  lives.value = 3
  combo = 0
  status.value = 'idle'
  initBricks()
  resetBallAndPaddle()
}

// 5. 物理更新邏輯 (使用 deltaTime 確保不同螢幕更新率速度一致)
function update(dt: number) {
  // 遊戲中或過關時磚塊全亮 (1)，待機或結束時調暗 (0.38)
  const targetAlpha = status.value === 'playing' || status.value === 'win' ? 1 : 0.38
  brickAlpha += (targetAlpha - brickAlpha) * Math.min(1, dt * 10)

  // 移動板子
  if (keys.left) paddle.x -= paddle.speed * dt
  if (keys.right) paddle.x += paddle.speed * dt
  paddle.x = Math.max(8, Math.min(CANVAS_W - paddle.w - 8, paddle.x))

  if (status.value === 'idle') {
    // 還沒發球前，球跟著板子移動
    ball.x = paddle.x + paddle.w / 2
    return
  }

  if (status.value !== 'playing') return

  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // 牆壁碰撞
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius
    ball.vx = Math.abs(ball.vx)
    playWallHit()
  } else if (ball.x + ball.radius > CANVAS_W) {
    ball.x = CANVAS_W - ball.radius
    ball.vx = -Math.abs(ball.vx)
    playWallHit()
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius
    ball.vy = Math.abs(ball.vy)
    playWallHit()
  }

  // 球掉落底部
  if (ball.y - ball.radius > CANVAS_H) {
    combo = 0
    lives.value -= 1
    if (lives.value <= 0) {
      status.value = 'gameover'
      playGameOver()
    } else {
      status.value = 'idle'
      playLoseLife()
      resetBallAndPaddle()
    }
    return
  }

  // 板子碰撞（依擊中位置改變反彈角度）
  if (
    ball.vy > 0 &&
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.h &&
    ball.x >= paddle.x - ball.radius &&
    ball.x <= paddle.x + paddle.w + ball.radius
  ) {
    combo = 0 // 球回到板子就重置連擊數
    playPaddleHit()

    const hitPoint = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2) // -1 ~ 1
    const maxBounceAngle = Math.PI / 3 // 最大 60 度
    const bounceAngle = hitPoint * maxBounceAngle

    ball.vx = ball.speed * Math.sin(bounceAngle)
    ball.vy = -ball.speed * Math.cos(bounceAngle)
    ball.y = paddle.y - ball.radius
  }

  // 磚塊碰撞 (圓形 vs 矩形)
  for (const brick of bricks) {
    if (brick.hp <= 0) continue

    const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w))
    const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h))
    const dx = ball.x - closestX
    const dy = ball.y - closestY

    if (dx * dx + dy * dy < ball.radius * ball.radius) {
      // 判斷反彈方向
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = -ball.vx
      } else {
        ball.vy = -ball.vy
      }

      brick.hp -= 1
      if (brick.hp === 0) {
        score.value += 100
        playBrickBreak(combo)
        combo += 1
      } else {
        score.value += 50
        playBrickDamage()
      }
      break // 單幀只處理一次磚塊碰撞較穩定
    }
  }

  // 檢查是否全清
  if (bricks.every((b) => b.hp <= 0)) {
    status.value = 'win'
    playWin()
  }
}

// 6. Canvas 繪製邏輯
function draw(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  // 畫磚塊（只對磚塊套用 brickAlpha，不影響板子與球）
  ctx.save()
  ctx.globalAlpha = brickAlpha
  for (const b of bricks) {
    if (b.hp <= 0) continue
    ctx.fillStyle = b.color
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, 3)
    ctx.fill()

    // 若是硬磚塊，畫上簡單的斜線標記
    if (b.type === 'hard' && b.hp > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(b.x + 8, b.y + b.h)
      ctx.lineTo(b.x + 18, b.y)
      ctx.moveTo(b.x + 22, b.y + b.h)
      ctx.lineTo(b.x + 32, b.y)
      ctx.stroke()
    }
  }
  ctx.restore() // 恢復透明度為 1

  // 畫板子（維持亮白色）
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4)
  ctx.fill()

  // 畫球（維持亮白色）
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
  ctx.fill()
}

// 7. 遊戲主迴圈與鍵盤事件
function loop(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05) // 限制最大 dt 防止切分頁暴衝
  lastTime = now

  const ctx = canvasRef.value?.getContext('2d')
  if (ctx) {
    update(dt)
    draw(ctx)
  }
  animationId = requestAnimationFrame(loop)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    keys.left = true
    if (status.value === 'idle') launchBall()
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    keys.right = true
    if (status.value === 'idle') launchBall()
  }
  if (e.key === ' ' && status.value === 'idle') {
    launchBall()
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false
}

onMounted(() => {
  initBricks()
  resetBallAndPaddle()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  lastTime = performance.now()
  animationId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<template>
  <div
    class="game-container"
    :class="{ 'is-bright': status === 'playing' || status === 'win' }"
  >
    <!-- 頂部 HUD -->
    <header class="hud">
      <div class="lives">
        <span
          v-for="n in 3"
          :key="n"
          class="life-dot"
          :class="{ active: n <= lives }"
        />
      </div>

      <div class="score">{{ formattedScore }}</div>

      <div class="actions">
        <button @click="toggleMute" :title="isMuted ? '取消靜音' : '靜音'">
          {{ isMuted ? '🔇' : '🔊' }}
        </button>
        <button @click="restartGame" title="重新開始">↻</button>
      </div>
    </header>

    <!-- 遊戲區域 -->
    <div class="stage">
      <canvas ref="canvasRef" :width="CANVAS_W" :height="CANVAS_H" />

      <!-- 中央鍵盤提示遮罩 -->
      <div v-if="status === 'idle'" class="overlay-hint" @click="launchBall">
        <div class="key-box">
          <div class="key-row"><span class="key" /></div>
          <div class="key-row">
            <span class="key">&lt;</span>
            <span class="key" />
            <span class="key">&gt;</span>
          </div>
        </div>
      </div>

      <!-- 結束 / 勝利遮罩 -->
      <div v-if="status === 'gameover' || status === 'win'" class="overlay-hint">
        <div class="result-box">
          <p>{{ status === 'win' ? 'YOU WIN!' : 'GAME OVER' }}</p>
          <button @click="restartGame">再玩一次</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  width: 420px;
  background: #1f1b20;
  color: #fff;
  font-family: monospace;
  user-select: none;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
.hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}
.lives,
.score {
  opacity: 0.38;
  transition: opacity 0.25s ease;
}
.is-bright .lives,
.is-bright .score {
  opacity: 1;
}
.lives {
  display: flex;
  gap: 6px;
}
.life-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #ffffff;
}
.life-dot.active {
  background: #ffffff;
}
.score {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 2px;
  color: #ffffff;
}
.actions {
  display: flex;
  gap: 4px;
}
.actions button {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}
.stage {
  position: relative;
}
.overlay-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}
.key-box {
  border: 2px solid #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.key-row {
  display: flex;
  gap: 4px;
}
.key {
  width: 24px;
  height: 24px;
  border: 2px solid #fff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}
.result-box {
  background: rgba(0, 0, 0, 0.85);
  padding: 24px 36px;
  border: 2px solid #fff;
  border-radius: 8px;
  text-align: center;
}
.result-box p {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 2px;
}
.result-box button {
  background: #fff;
  color: #1f1b20;
  border: none;
  padding: 8px 18px;
  border-radius: 4px;
  font-family: inherit;
  font-weight: bold;
  cursor: pointer;
}
</style>