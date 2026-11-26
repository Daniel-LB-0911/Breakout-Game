// src/composables/useRetroAudio.ts
import { ref, onUnmounted } from 'vue'

type WaveType = OscillatorType // 'sine' | 'square' | 'sawtooth' | 'triangle'

interface ToneOptions {
  freq: number
  endFreq?: number
  duration: number
  type?: WaveType
  volume?: number
  delay?: number
}



export function useRetroAudio() {
  const isMuted = ref(false)
  let audioCtx: AudioContext | null = null

  // 取得或初始化 AudioContext（延遲到有操作時才建立，符合瀏覽器規範）
  function getContext(): AudioContext | null {
    if (isMuted.value || typeof window === 'undefined') return null

    if (!audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        audioCtx = new AudioCtx()
      }
    }

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume()
    }

    return audioCtx
  }

  // 底層發聲函式
  function playTone({
    freq,
    endFreq,
    duration,
    type = 'square',
    volume = 0.12,
    delay = 0,
  }: ToneOptions) {
    const ctx = getContext()
    if (!ctx) return

    const startTime = ctx.currentTime + delay
    const endTime = startTime + duration

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, startTime)

    // 如果有設定結束頻率，就做滑音效果（例如掉命時的下滑音）
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), endTime)
    }

    // 音量包絡線：瞬間響起後快速衰減，聽起來才像復古電玩音效
    gain.gain.setValueAtTime(volume, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, endTime)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(startTime)
    osc.stop(endTime)
  }

  // --- 以下是各種遊戲事件的專屬音效 ---

  /** 撞到牆壁：短促低沉的方波 */
  function playWallHit() {
    playTone({ freq: 220, duration: 0.05, type: 'square', volume: 0.08 })
  }

  /** 撞到板子：清脆的中高音 */
  function playPaddleHit() {
    playTone({ freq: 360, endFreq: 480, duration: 0.07, type: 'triangle', volume: 0.16 })
  }

  /** 打到硬磚塊但還沒碎：金屬感敲擊聲 */
  function playBrickDamage() {
    playTone({ freq: 180, endFreq: 120, duration: 0.08, type: 'sawtooth', volume: 0.1 })
  }

  /** 敲碎磚塊：高音叮咚（可傳入連擊數 combo 讓音高越打越高！） */
  function playBrickBreak(combo = 0) {
    const baseFreq = 520 + Math.min(combo, 10) * 45
    playTone({
      freq: baseFreq,
      endFreq: baseFreq * 1.35,
      duration: 0.09,
      type: 'square',
      volume: 0.1,
    })
  }

  /** 球掉出底部（失去一條命）：經典下滑音 */
  function playLoseLife() {
    playTone({ freq: 320, endFreq: 75, duration: 0.35, type: 'sawtooth', volume: 0.14 })
  }

  /** 過關勝利：上行琶音 (C5 - E5 - G5 - C6) */
  function playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, idx) => {
      playTone({
        freq,
        duration: 0.12,
        type: 'square',
        volume: 0.12,
        delay: idx * 0.09,
      })
    })
  }

  /** Game Over：悲傷的下行音階 */
  function playGameOver() {
    const notes = [330, 293.66, 261.63, 196]
    notes.forEach((freq, idx) => {
      playTone({
        freq,
        duration: 0.18,
        type: 'sawtooth',
        volume: 0.11,
        delay: idx * 0.16,
      })
    })
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  // 元件卸載時釋放音訊資源
  onUnmounted(() => {
    if (audioCtx) {
      audioCtx.close()
      audioCtx = null
    }
  })

  return {
    isMuted,
    toggleMute,
    playWallHit,
    playPaddleHit,
    playBrickDamage,
    playBrickBreak,
    playLoseLife,
    playWin,
    playGameOver,
  }
}