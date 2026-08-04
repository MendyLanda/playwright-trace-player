import { inflateSync, strFromU8 } from 'fflate'

interface ZipEntry {
  compressionMethod: number
  flags: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

interface CentralDirectory {
  entryCount: number
  offset: number
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR = 0x07064b50
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const ZIP64_EXTRA_FIELD = 0x0001

/** Reads selected ZIP entries without inflating the whole archive. */
export class ZipArchive {
  private bytes?: Uint8Array
  private readonly entries = new Map<string, ZipEntry>()

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    const centralDirectory = findCentralDirectory(bytes)
    let offset = centralDirectory.offset

    for (let index = 0; index < centralDirectory.entryCount; index += 1) {
      assertRange(bytes, offset, 46)
      if (readUint32(bytes, offset) !== CENTRAL_DIRECTORY_FILE_HEADER) {
        throw new Error('The ZIP central directory is invalid.')
      }

      const flags = readUint16(bytes, offset + 8)
      const compressionMethod = readUint16(bytes, offset + 10)
      let compressedSize = readUint32(bytes, offset + 20)
      let uncompressedSize = readUint32(bytes, offset + 24)
      const nameLength = readUint16(bytes, offset + 28)
      const extraLength = readUint16(bytes, offset + 30)
      const commentLength = readUint16(bytes, offset + 32)
      let localHeaderOffset = readUint32(bytes, offset + 42)
      const nameStart = offset + 46
      const extraStart = nameStart + nameLength
      const nextOffset = extraStart + extraLength + commentLength
      assertRange(bytes, nameStart, nameLength + extraLength + commentLength)

      const name = strFromU8(bytes.subarray(nameStart, nameStart + nameLength))
      if (
        compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff
      ) {
        const zip64 = readZip64Extra(
          bytes.subarray(extraStart, extraStart + extraLength),
          uncompressedSize === 0xffffffff,
          compressedSize === 0xffffffff,
          localHeaderOffset === 0xffffffff,
        )
        if (uncompressedSize === 0xffffffff) uncompressedSize = zip64.uncompressedSize!
        if (compressedSize === 0xffffffff) compressedSize = zip64.compressedSize!
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = zip64.localHeaderOffset!
      }

      this.entries.set(name, {
        compressionMethod,
        flags,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      })
      offset = nextOffset
    }
  }

  names(): string[] {
    this.assertOpen()
    return [...this.entries.keys()]
  }

  read(name: string): Uint8Array {
    const bytes = this.assertOpen()
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`The ZIP entry ${name} does not exist.`)
    if (entry.flags & 0x1) throw new Error(`The ZIP entry ${name} is encrypted.`)

    const offset = entry.localHeaderOffset
    assertRange(bytes, offset, 30)
    if (readUint32(bytes, offset) !== LOCAL_FILE_HEADER) {
      throw new Error(`The ZIP entry ${name} has an invalid local header.`)
    }
    const nameLength = readUint16(bytes, offset + 26)
    const extraLength = readUint16(bytes, offset + 28)
    const dataStart = offset + 30 + nameLength + extraLength
    assertRange(bytes, dataStart, entry.compressedSize)
    const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    let result: Uint8Array
    if (entry.compressionMethod === 0) result = compressed.slice()
    else if (entry.compressionMethod === 8) result = inflateSync(compressed)
    else throw new Error(`The ZIP entry ${name} uses an unsupported compression method.`)

    if (result.byteLength !== entry.uncompressedSize) {
      throw new Error(`The ZIP entry ${name} has the wrong size.`)
    }
    return result
  }

  dispose(): void {
    this.bytes = undefined
    this.entries.clear()
  }

  private assertOpen(): Uint8Array {
    if (!this.bytes) throw new Error('The ZIP archive has been disposed.')
    return this.bytes
  }
}

function findCentralDirectory(bytes: Uint8Array): CentralDirectory {
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557)
  let endOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (
      readUint32(bytes, offset) === END_OF_CENTRAL_DIRECTORY &&
      offset + 22 + readUint16(bytes, offset + 20) === bytes.byteLength
    ) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('The ZIP end record is missing.')

  const entryCount = readUint16(bytes, endOffset + 10)
  const centralOffset = readUint32(bytes, endOffset + 16)
  if (entryCount !== 0xffff && centralOffset !== 0xffffffff) {
    return { entryCount, offset: centralOffset }
  }

  const locatorOffset = endOffset - 20
  assertRange(bytes, locatorOffset, 20)
  if (readUint32(bytes, locatorOffset) !== ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR) {
    throw new Error('The ZIP64 locator is missing.')
  }
  const zip64EndOffset = readUint64(bytes, locatorOffset + 8)
  assertRange(bytes, zip64EndOffset, 56)
  if (readUint32(bytes, zip64EndOffset) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
    throw new Error('The ZIP64 end record is invalid.')
  }
  return {
    entryCount: readUint64(bytes, zip64EndOffset + 32),
    offset: readUint64(bytes, zip64EndOffset + 48),
  }
}

function readZip64Extra(
  extra: Uint8Array,
  needsUncompressedSize: boolean,
  needsCompressedSize: boolean,
  needsLocalHeaderOffset: boolean,
): {
  uncompressedSize?: number
  compressedSize?: number
  localHeaderOffset?: number
} {
  let offset = 0
  while (offset + 4 <= extra.byteLength) {
    const fieldId = readUint16(extra, offset)
    const fieldSize = readUint16(extra, offset + 2)
    const fieldStart = offset + 4
    assertRange(extra, fieldStart, fieldSize)
    if (fieldId === ZIP64_EXTRA_FIELD) {
      let valueOffset = fieldStart
      const result: {
        uncompressedSize?: number
        compressedSize?: number
        localHeaderOffset?: number
      } = {}
      if (needsUncompressedSize) {
        result.uncompressedSize = readUint64(extra, valueOffset)
        valueOffset += 8
      }
      if (needsCompressedSize) {
        result.compressedSize = readUint64(extra, valueOffset)
        valueOffset += 8
      }
      if (needsLocalHeaderOffset) {
        result.localHeaderOffset = readUint64(extra, valueOffset)
      }
      return result
    }
    offset = fieldStart + fieldSize
  }
  throw new Error('A ZIP64 entry is missing its size data.')
}

function readUint16(bytes: Uint8Array, offset: number): number {
  assertRange(bytes, offset, 2)
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  assertRange(bytes, offset, 4)
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x10000 +
    bytes[offset + 3]! * 0x1000000
  )
}

function readUint64(bytes: Uint8Array, offset: number): number {
  const value = readUint32(bytes, offset) + readUint32(bytes, offset + 4) * 0x1_0000_0000
  if (!Number.isSafeInteger(value)) throw new Error('The ZIP archive is too large to read safely.')
  return value
}

function assertRange(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new Error('The ZIP archive contains an invalid offset.')
  }
  if (offset > bytes.byteLength || length > bytes.byteLength - offset) {
    throw new Error('The ZIP archive ends before an entry is complete.')
  }
}
