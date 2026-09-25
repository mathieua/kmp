import * as fs from 'fs'
import * as path from 'path'
import type { Track } from './audio'

// Generated alarm sounds: small synthesized loops written once to the data
// dir as WAV files, so they need no downloads and work even with an empty
// music library. Each is a short pattern that ffplay loops (Track.loop).

const RATE = 44100

type Wave = (t: number) => number

interface NoteEvent {
  at: number      // start, seconds
  dur: number     // audible length, seconds
  wave: Wave      // gets time since note start, returns -1..1
}

/** Additive tone with a fast attack and exponential decay. */
function tone(freq: number, dur: number, decay: number, harmonics = [1, 0.35, 0.15]): Wave {
  return t => {
    const attack = Math.min(1, t / 0.006)
    const release = Math.min(1, Math.max(0, (dur - t) / 0.02))
    const env = attack * release * Math.exp(-decay * t)
    let s = 0
    harmonics.forEach((a, i) => { s += a * Math.sin(2 * Math.PI * freq * (i + 1) * t) })
    return env * s
  }
}

/** Bird-like chirp: pitch sweeps f0 -> f1 with a little vibrato. */
function chirp(f0: number, f1: number, dur: number): Wave {
  return t => {
    const u = t / dur
    const phase = 2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * dur))
    const env = Math.sin(Math.PI * Math.min(1, u)) ** 0.7
    return env * Math.sin(phase + 0.6 * Math.sin(2 * Math.PI * 38 * t))
  }
}

function render(totalSec: number, events: NoteEvent[]): Buffer {
  const samples = new Float32Array(Math.round(totalSec * RATE))
  for (const { at, dur, wave } of events) {
    const start = Math.round(at * RATE)
    const n = Math.round(dur * RATE)
    for (let i = 0; i < n && start + i < samples.length; i++) {
      samples[start + i] += wave(i / RATE)
    }
  }

  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const gain = peak > 0 ? 0.85 / peak : 1

  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * gain * 32767), i * 2))

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)          // fmt chunk size
  header.writeUInt16LE(1, 20)           // PCM
  header.writeUInt16LE(1, 22)           // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)    // byte rate
  header.writeUInt16LE(2, 32)           // block align
  header.writeUInt16LE(16, 34)          // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

interface SoundDef {
  id: string
  title: string
  seconds: number
  events: NoteEvent[]
}

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 }

const SOUNDS: SoundDef[] = [
  {
    id: 'beep',
    title: 'Beep Beep',
    seconds: 1.8,
    events: [0, 0.2, 0.4, 0.6].map(at => ({ at, dur: 0.11, wave: tone(1000, 0.11, 0, [1, 0.3]) })),
  },
  {
    id: 'chime',
    title: 'Morning Chime',
    seconds: 3.6,
    events: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].map((f, i) => ({ at: i * 0.4, dur: 1.4, wave: tone(f, 1.4, 2.6) })),
  },
  {
    id: 'bird',
    title: 'Little Bird',
    seconds: 2.6,
    events: [
      ...[0, 0.24, 0.48].map(at => ({ at, dur: 0.14, wave: chirp(2400, 3600, 0.14) })),
      ...[1.3, 1.5].map(at => ({ at, dur: 0.14, wave: chirp(3600, 2600, 0.14) })),
    ],
  },
  {
    id: 'musicbox',
    title: 'Music Box',
    seconds: 3.2,
    // "Twinkle twinkle little star"
    events: [NOTE.C5, NOTE.C5, NOTE.G5, NOTE.G5, NOTE.A5, NOTE.A5, NOTE.G5].map((f, i) => ({
      at: i * 0.38, dur: 0.9, wave: tone(f, 0.9, 5.5, [1, 0.2, 0.08]),
    })),
  },
]

/** Writes any missing sound files into `dir` and returns them as loopable tracks. */
export function ensureAlarmSounds(dir: string): Track[] {
  fs.mkdirSync(dir, { recursive: true })
  return SOUNDS.map(def => {
    const filepath = path.join(dir, `${def.id}.wav`)
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, render(def.seconds, def.events))
    }
    return {
      id: `alarm-sound:${def.id}`,
      filename: `${def.id}.wav`,
      filepath,
      title: def.title,
      artist: 'Alarm sounds',
      duration: def.seconds,
      loop: true,
    }
  })
}
