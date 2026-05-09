const randCodeMode2 = 'abcdefghijklmnopqrstuvwxyz0123456789'

const md5ShiftAmounts = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const md5Table = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
)

function add32(a: number, b: number) {
  return (a + b) >>> 0
}

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

export function md5(input: string) {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  let paddedLength = bytes.length + 1
  while (paddedLength % 64 !== 56)
    paddedLength++

  const message = new Uint8Array(paddedLength + 8)
  message.set(bytes)
  message[bytes.length] = 0x80

  const view = new DataView(message.buffer)
  view.setUint32(paddedLength, bitLength >>> 0, true)
  view.setUint32(paddedLength + 4, Math.floor(bitLength / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < message.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true))

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f = 0
      let g = 0

      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      }
      else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      }
      else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      const nextD = d
      d = c
      c = b
      b = add32(b, rotateLeft(add32(add32(a, f), add32(md5Table[i], words[g])), md5ShiftAmounts[i]))
      a = nextD
    }

    a0 = add32(a0, a)
    b0 = add32(b0, b)
    c0 = add32(c0, c)
    d0 = add32(d0, d)
  }

  const output = new Uint8Array(16)
  const outputView = new DataView(output.buffer)
  outputView.setUint32(0, a0, true)
  outputView.setUint32(4, b0, true)
  outputView.setUint32(8, c0, true)
  outputView.setUint32(12, d0, true)

  return Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function passwordEncryption(password: string) {
  return md5(md5(md5(password)))
}

export function randomCode(length: number, alphabet = randCodeMode2) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}
