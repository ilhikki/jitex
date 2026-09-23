// 构建：把 runtime 打包成单文件浏览器 ESM（零依赖）。
//
// 用法：deno task runtime:build
//
// 产物 dist/runtime.js 是标准 ES 模块，浏览器 <script type="module"> 或 import 直接可用；
// 不含任何 Deno / Node API，也不含编译器代码。
import { bundle } from 'jsr:@deno/emit@^0.46.0'

const entry = new URL('./mod.ts', import.meta.url)
const { code } = await bundle(entry)

// 产物统一落在仓库根 dist/（本脚本在 src/runtime/ 下，上两级即仓库根）
const distDir = new URL('../../dist/', import.meta.url)
await Deno.mkdir(distDir, { recursive: true })
await Deno.writeTextFile(new URL('runtime.js', distDir), code)
console.log(`built dist/runtime.js (${code.length} bytes)`)
