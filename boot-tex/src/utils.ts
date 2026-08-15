export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}
