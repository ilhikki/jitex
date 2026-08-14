# boot-tex 迁移规划

> 目标：把 `E:\code\pascal-ts\tests\e2e`（18 阶段 TANGLE / TEX82 / PLAIN / XeTeX 流水线）
> 迁移到本模块，基于已完成的 `@jitex/integration` DSL 重写。
> 本文件是迁移计划 + 进度清单；迁移完成后收敛进 `README.md`。

---

## 1. 背景

旧 e2e（`pascal-ts/tests/e2e`）是一套命令式流水线：

- `stages.ts`（2600 行）：18 个阶段 + 共享可变 `PipelineContext` + 自建 reporter/CLI。
- `_helper.ts`：资源读取、`runTangle`、`compileTeX`、`runTeXCompiled`、格式化工具。
- `tie.ts`：WEB change file 合并（web2c `tie -m` 行为）。
- `dvi-extract.ts`：DVI 解析 / JSON / HTML / 文本提取。
- `reporter.ts` / `run.ts`：报告 + CLI——**无需迁移**，integration 已提供等价能力。

集成部分已由 `@jitex/integration` 完成（suite/stage/cache/assert/attach/log + 报告 + CLI），
本模块只负责 TeX 侧的流水线定义与纯函数移植。

---

## 2. 迁移映射

| 旧文件（pascal-ts/tests/e2e） | 新位置（boot-tex）           | 说明 |
| --- | --- | --- |
| `stages.ts` | `src/stages/*.ts` + `src/pipeline.ts` | 用 DSL 重写；Context → 依赖流 + 扁平返回值 |
| `_helper.ts` | `src/helper.ts` | Deno 化（`fs/path/Buffer` → `Deno`/`TextEncoder`） |
| `tie.ts` | `src/tie.ts` | 纯函数，近乎原样 |
| `dvi-extract.ts` | `src/dvi.ts` | `Buffer.*` → `TextDecoder`（latin1） |
| `reporter.ts` | — | 由 integration runner/reporter 取代 |
| `run.ts` | — | 由 integration CLI 取代 |
| `resources/*`（含 `fonts/`） | `resources/` | 字节级复制，注意 `.gitignore`（见 §5） |

---

## 3. 架构差异（Context → 依赖流）

旧模型：共享 `ctx` 大对象，阶段副作用写入，失败后 `failedAt` 短路后续。

新模型（integration DSL）：

- 每个 stage 的 `fn(results)` 返回**扁平 `CacheableRecord`**（`string | number | Uint8Array`）。
- 下游通过 `deps` 数组拿上游返回值；**不允许嵌套对象**。
- 失败自动跳过其全部后继（`failedIds` 检查）→ 与旧 `failedAt` 语义对齐。
- 需要传给下游的数据放返回值；只需展示的放 `attach*()`（落报告，不参与结果流）。
- **断言语义差异（重要）**：DSL 的 `assert(cond, msg)` 失败即抛 `AssertionError` → stage 变 failed；
  旧 e2e 的 assert 只是"记录"，成败由单独的 `ok` 变量决定。
  → 迁移时**只对硬性条件用 assert**（如"trip 100% 匹配"、"banner 存在"），
  其余旧断言降级为 `log()` + metrics（在返回值/attachJson 中记录）。

---

## 4. 阶段设计（18 个 stage，单 suite `boot-tex`）

命名稳定（`--filter` 靠 name 匹配）；`cache()` 标记的是贵且可复用的大步骤。
大字符串（tex.pas ≈ 500KB、js ≈ 1-2MB）随返回值流到下游并进缓存——本地可接受，不另行落盘。

### TANGLE 流水线
| # | stage | deps | cache | 返回要点 | attach |
| --- | --- | --- | --- | --- | --- |
| 1 | `parse-tangle` | — | ✅ | `{ok, lines, size}` | tangle-official.pas |
| 2 | `compile-tangle` | parse-tangle | ✅ | `{ok, size}` | .compiled.js |
| 3 | `tangle-v1` | compile-tangle | ✅ | `{status, banner, modules, pascal, pool, output}` | v1.pas/.pool/.out |
| 4 | `parse-v1` | tangle-v1 | — | `{ok}` | — |
| 5 | `tangle-v2` | tangle-v1, parse-v1 | ✅ | `{status, banner, pascal, pool, output}` | v2.pas/.pool/.out |
| 6 | `tangle-v3` | tangle-v2 | ✅ | `{status, banner, pascal, pool, output}` | v3.pas/.pool/.out |
| 7 | `verify-bootstrap` | tangle-v2, tangle-v3 | — | `{equal}` | — |

### TEX82 流水线
| # | stage | deps | cache | 返回要点 | attach |
| --- | --- | --- | --- | --- | --- |
| 8 | `tangle-tex` | tangle-v3（失败回退 v2） | ✅ | `{pascal, pool, pascalFull, poolFull, output, tangleSource}` | tex.pas/.pool/.tangle.out/trip.ch |
| 9 | `parse-tex` | tangle-tex | — | `{ok, lines}` | — |
| 10 | `compile-tex` | tangle-tex, parse-tex | ✅ | `{js, jsFull, size}` | tex.js（+ tex-full.js） |
| 11 | `tex-hello` | compile-tex | ✅ | `{status, steps, output, dviName, dviSize, dviValid, dviHasContent}` | hello.log + dvi + plain-dvi.txt + .dvi.html/.json |
| 12 | `tex-trip` | compile-tex | ✅ | `{status, steps, output, logFile, pass1Output, fmtFound}` | trip.log/actual/pass1 + dvi + html/json |
| 13 | `verify-trip-banner` | tex-trip | — | `{bannerMatch}` | — |
| 14 | `compare-trip-fot` | tex-trip | — | `{matchRate, matchCount, totalLines, markersPass}` | trip.compare.txt |

> 保留旧 s12 的 **pass2 回退 pass1** 逻辑：`&trip` 二段运行若 fatal/失败，回退 INITEX 一段输出。
> `trip.log`/`tripin.log` 是 tripman.tex 的**输入**资源，不是本流水线产物。

### PLAIN TeX 流水线
| # | stage | deps | cache | 返回要点 | attach |
| --- | --- | --- | --- | --- | --- |
| 15 | `generate-plain-fmt` | compile-tex | ✅ | `{status, steps, fmtSize, beginDump, dumpedMem, hasHyphen}` | plain.fmt（二进制）+ .log + .debug.txt |
| 16 | `compile-tripman` | generate-plain-fmt | ✅ | `{status, steps, dviSize, dviTextLen, dviPages, dviFonts}` | tripman.log/.dvi/.dvi.html/.dvi.json/dvi.txt |

### XeTeX 流水线
| # | stage | deps | cache | 返回要点 | attach |
| --- | --- | --- | --- | --- | --- |
| 17 | `tangle-v4` | —（读 tangle-official.pas 直编译） | ✅ | `{status, pascal, pool, output, hasBufSize1000, hasZz5}` | tangle.pas.v4/.pool.v4/.out + tangle-xetex.ch |
| 18 | `compile-xetex` | tangle-v4 | ✅ | `{status, banner, pascal, pool, output, noErrors}` | xetex.pas/.pool/.tangle.out |

---

## 5. 资源处理

- 从 `E:\code\pascal-ts\tests\e2e\resources` **字节级复制**（不能经文本工具改写）：
  `tangle-official.pas`、`tangle.web`、`tangle-xetex.ch`、`tex.web`、`tex.trip.ch`、
  `trip.{tex,tfm,fot,log,pl,typ}`、`tripin.log`、`tripos.tex`、`tripman.tex`、
  `plain.tex`、`hyphen.tex`、`hello.tex`、`xetex.web`、11 个 `xetex-*.ch`、`fonts/`（76 个 .tfm）。
- `texbook.tex`（1.4MB）：当前流水线**未引用**，不复制（未来 TeXbook 测试再说）。
- **决策点（默认选 A）**：
  - A. 复制进仓库并提交（约 3MB，git 无压力）——自包含、可复现。**推荐**。
  - B. 外部路径 + env 注入——省仓库体积但脆弱、破坏可复现性。
- `.gitignore` 问题：全局 `*.log` 会吞掉资源 `trip.log` / `tripin.log`，必须加例外：
  ```gitignore
  !boot-tex/resources/**/*.log
  ```
- 资源读取用 `Deno.readTextFileSync(new URL('resources/<name>', import.meta.url))`
  （文本）与 `Deno.readFileSync`（二进制/tfm），**不做行尾转换**——CRLF 是 tex.web / trip.fot 的字节语义。

---

## 6. Deno 适配清单

| 旧 API | 新 API |
| --- | --- |
| `__dirname` + `path.join` | `import.meta.url` + `new URL(...)` |
| `fs.readFileSync` / `readdirSync` | `Deno.readFileSync` / `Deno.readTextFileSync` / `Deno.readDirSync` |
| `Buffer.from(s, 'utf-8')` | `new TextEncoder().encode(s)` |
| `Buffer.byteLength(s, 'utf-8')` | `new TextEncoder().encode(s).length` |
| `Buffer.from(seg).toString('utf-8'/'ascii')` | `new TextDecoder('utf-8').decode(seg)` |
| `Buffer.from(seg).toString('latin1')`（DVI xxx） | `new TextDecoder('latin1').decode(seg)` |
| `os` / `process` / `path` | 删除（integration runner 负责 env/报告） |

---

## 7. 目录结构（目标态）

```
boot-tex/
├─ PLAN.md                ← 本文件
├─ README.md              ← 迁移完成后写（用法 + 维护）
├─ deno.json              ← tasks：check/run/run:cache/purge
├─ mod.ts                 ← export { default as bootTexSuite } from './src/pipeline.ts'
├─ resources/             ← §5（含 fonts/）
├─ src/
│  ├─ pipeline.ts         ← export default suite('boot-tex', () => { 组合各 section })
│  ├─ helper.ts           ← 资源读取 + runTangle + compileTeX + runTeXCompiled + 格式化
│  ├─ tie.ts              ← WEB change file 合并
│  ├─ dvi.ts              ← DVI 解析/JSON/HTML/文本
│  ├─ validate.ts         ← findDviFile / findFile / validateDvi
│  └─ stages/
│     ├─ tangle.ts        ← stage 1-7 的构建函数
│     ├─ tex.ts           ← stage 8-14
│     ├─ plain.ts         ← stage 15-16
│     └─ xetex.ts         ← stage 17-18
└─ tests/                 ← 纯函数单测（deno test 可跑，不跑 TeX）
   ├─ tie.test.ts
   ├─ dvi.test.ts
   └─ validate.test.ts
```

> `stages/*.ts` 各自导出 `buildXxxStages()`，在 `suite()` 体内调用（DSL 依赖全局声明上下文），
> 用返回的 `Stage` 引用互相传 deps。

---

## 8. 命令与缓存工作流

`boot-tex/deno.json` tasks（相对 boot-tex 目录执行；报告统一落根 `reports/boot-tex`，已被 `/reports/` 忽略）：

```jsonc
{
  "tasks": {
    "check": "deno check mod.ts src/pipeline.ts tests/",
    "run":     "deno run -A ../integration/src/cli.ts run src/pipeline.ts --report-dir ../reports/boot-tex",
    "run:cache": "deno run -A ../integration/src/cli.ts run src/pipeline.ts --with-cache --report-dir ../reports/boot-tex",
    "purge":   "deno run -A ../integration/src/cli.ts run src/pipeline.ts --purge --report-dir ../reports/boot-tex"
  }
}
```

工作流（沿用 integration README §3）：
1. 新代码/改前段 → `deno task purge`（全量跑，写缓存）。
2. 调末段 → `deno task run:cache -- --filter "compare-trip-fot"`（前段从缓存取）。
3. 资源是静态输入：改资源后必须 `--purge`（不指望自动失效）。

已知差距：integration CLI 无 `--list`。需要时可加一个 `deno task list`（小脚本打印 stage name），非阻塞。

---

## 9. 实施顺序（每步独立提交）

- [ ] 1. 资源落地：建 `resources/` 复制文件 + `.gitignore` 加 `!boot-tex/resources/**/*.log`。
- [ ] 2. 纯函数移植：`src/tie.ts`、`src/dvi.ts`、`src/validate.ts` + `tests/{tie,dvi,validate}.test.ts`；`deno check` + `deno test` 通过。
- [ ] 3. `src/helper.ts`（Deno 化）。
- [ ] 4. `src/stages/tangle.ts`（stage 1-7）+ `src/pipeline.ts` 骨架。
- [ ] 5. `src/stages/tex.ts`（stage 8-14，含 hello/trip/compare）。
- [ ] 6. `src/stages/plain.ts` + `xetex.ts`（stage 15-18）。
- [ ] 7. `deno.json` tasks、`mod.ts` 导出、`README.md`。
- [ ] 8. 端到端：`deno task purge` 全量跑通；逐段修 bug；`deno test` / `deno check` / `deno lint` / `deno fmt --check`。
- [ ] 9. 更新 AGENTS.md：boot-tex 行状态（占位→完成）、说明段落、常用命令表补 boot-tex 命令。
- [ ] 10. 删除/收敛本 PLAN.md（内容并入 README）。

---

## 10. 风险与注意

1. **耗时**：TANGLE 自举 + tex.web 编译 + TRIP + plain.fmt 全量约 10-60 分钟（maxSteps 最高 5e9）。
   靠 cache 分段迭代；单次调试用 `--with-cache --filter`。
2. **大返回值**：tex.pas ≈ 500KB、js ≈ 1-2MB 随结果流 + 缓存 → cache/report 体积增大，本地可接受。
   若后续过大再考虑拆 stage 或压缩。
3. **CRLF 语义**：tex.web / trip.fot 为 CRLF；资源必须字节级复制、按需对齐（旧 s8 对 trip.ch 做行尾对齐，保留）。
4. **assert 语义变更**：只对硬性条件 assert（§3），其余记录。
5. **trip 100% 匹配**：`compare-trip-fot` 必须 `assert(matchCount === totalLines)`（TRIP 是 diabolical test）。
6. **`*.log` 资源被 gitignore**：见 §5，提交时留意 `git status` 确认 `trip.log`/`tripin.log` 已入库。
7. **集成边界**：不改 `integration/`；所有新逻辑放本模块。`deno test` 只跑纯函数，TeX 长任务走 CLI 流水线。
