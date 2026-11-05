import { Buffer } from "buffer"

// Node-compatible Buffer is required by TON core in browser builds.
const browserGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
}
browserGlobal.Buffer ??= Buffer
