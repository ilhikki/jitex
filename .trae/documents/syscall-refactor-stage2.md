# 阶段 2+3：需求 + 设计

> **命名约定**：所有 syscall key 一律带前缀 —— lowering 产出 `lowering.*`，rewrite 产出 `runtime.*`。

---

# 第一部分 · 需求

## 0. 三层分工

| 层 | 职责 | 明确不做 |
|---|---|---|
| **lowering** | 机械地把 Pascal 原生过程/函数转成「携带类型参数」的 syscall | 不理解语义、不按类型选 key |
| **rewrite** | 只做**类型翻译**：读类型参数，产出 `runtime.*` 原语的 jsoncode 组合 | 不理解语义、不做流程组合 |
| **runtime** | 执行**原子原语**，按对象自身状态行事 | 不理解 Pascal 类型 |

## 1. 类型模型

### 1.1 三种 JS 表示

| JS 表示 | Pascal 元素 | 依据 |
|---|---|---|
| `number` | integer / real / boolean / char / enum / subrange | boolean 取序数值 0/1（ISO 6.4.2.2）；char 取 ord 值（ISO 6.4.2.3） |
| `Uint8Array` | array / record / set | 字节布局；`subarray` 表达嵌套引用 |
| `object` | file / pointer / cell | 有状态或纯引用机制 |

- **char 用 ord 值** → `ord` / `chr` 退化为 identity
- **boolean 用 0/1** → 逻辑运算保短路：`and` → `a ? b : 0`，`or` → `a ? 1 : b`，`not` → `a ? 0 : 1`

### 1.2 字符串（ISO 7185 6.1.7）

string-literal 的类型是 `packed array[1..n] of char` → 即 `Uint8Array`。
写出 / 读入都是**零转换**；不存在独立的字符串表示。

### 1.3 类型的存放位置（核心）

| 表示 | 类型在哪 | 操作时是否传类型 |
|---|---|---|
| `object`（file） | **对象里**（创建时写入） | **否** —— runtime 按句柄状态行事 |
| `Uint8Array`（array/record/set） | **编译期**（rewrite 算） | **是** —— 在 get/set 那一刻传（offset + codec / size） |

**推论**：array/record 是裸 `Uint8Array`，类型只在 get/set 时由 rewrite 给出；file 操作一律不接类型参数，
text / 二进制的差异由 runtime 读句柄处理（**不拆 `file.rec.*`**）。

### 1.4 各表示的操作

| 表示 | 操作 | runtime 原语 |
|---|---|---|
| `number` | 算术 / 比较 / 位运算 / 逻辑 | `runtime.i32.*` `runtime.f32.*` `runtime.cmp.*` `runtime.bool.*` |
| `Uint8Array` | 分配 / 拷贝 / 标量读写 / 取子视图 | `runtime.mem.new` `runtime.mem.copy` `runtime.num.get` `runtime.num.set` `runtime.view.sub` |
| `Uint8Array`（set） | 集合运算 | `runtime.set.*` |
| `object` | 文件 / 指针 / cell | `runtime.file.*` `runtime.ptr.*` `runtime.cell.*` |

## 2. 文件过程的多态分类

- **多态① 文件参数可选**（write/read 等首参）：不产生类型转换，只需判断 target
- **多态② 值参数类型**：**只有这一类需要类型转换**
- **非多态**（reset/rewrite/get/put/eof/eoln/page/f^）：无值参数、无转换、不传类型

## 3. 类型转换原语（只覆盖多态②）

| 写 | 文本 | 二进制 |
|---|---|---|
| i32 / enum / subrange | `runtime.convert.i32.To.str(n, w?)` | `runtime.convert.i32.To.bytes(n)` |
| f32 | `runtime.convert.f32.To.str(n, w?, p?)` | `runtime.convert.f32.To.bytes(n)` |
| boolean | `runtime.convert.bool.To.str(b)` | `runtime.convert.bool.To.bytes(b)` |
| char | `runtime.convert.i32.To.char(c)` | 同 |
| char 数组 | — 直接写 `Uint8Array`（零转换） | 同 |

| 读 | 文本 | 二进制 |
|---|---|---|
| i32 / enum / subrange | `runtime.convert.str.To.i32(s)` | `runtime.convert.bytes.To.i32(b)` |
| f32 | `runtime.convert.str.To.f32(s)` | `runtime.convert.bytes.To.f32(b)` |
| boolean | `runtime.convert.str.To.bool(s)` | `runtime.convert.bytes.To.bool(b)` |
| char | `runtime.convert.char.To.i32(c)` | 同 |
| char 数组 | — 直接得到 `Uint8Array`（零转换） | 同 |

## 4. 内存模型

| 类型 | 字节宽度 | codec |
|---|---|---|
| `i32` | 4 | `i32` |
| `f64`（real） | 4 | `f32` |
| `boolean` | 1 | `u8` |
| `char` | 1 | `u8` |
| **带 `low`/`high` 的序数类型**（子界 / enum） | 按 `low..high` → 1/2/4 | `i8` / `u8` / `i16` / `u16` / `i32` |
| `array` | `Π元素数 × sizeOf(elem)` | — |
| `record` | `Σ字段`；variant 取各分支 `max` | — |
| `set` | `ceil((high - low + 1) / 8)`（取自 `elem`） | — |
| `pointer` | 4 | `i32` |

多维数组扁平化：`offset = Σ (idx_i - low_i) × stride_i`。

语义：子视图共享底层（`subarray`）→ 嵌套引用；唯一拷贝点是 `a := b` → `runtime.mem.copy`；
variant 不保护 a 写 b 读（ISO 未定义行为）。

## 5. runtime 原语总表

### 文件（不接类型参数）

`runtime.file.reset/rewrite/get/peek/put/read/write/readln/writeln/eof/eoln/page(f, …)`、
`runtime.file.create(type)`、`runtime.program.fileUrl(f, name)`。
`f = null` → 默认 input / output。

### 内存（类型在 get/set 时传入）

`runtime.mem.new(size)`、`runtime.mem.copy(dst, dstOff, src, size)`、
`runtime.num.get(view, offset, codec)` / `runtime.num.set(view, offset, codec, v)`、
`runtime.view.sub(view, offset, size)`、
`runtime.cell.new/get/set`、`runtime.ptr.deref/assign/dispose.check`、
`runtime.set.*`（均带 `size`）。

## 6. Pascal io 过程覆盖核对

| Pascal 过程 | runtime syscall |
|---|---|
| `write(f, x…)` | `runtime.file.write`（每值一条） |
| `writeln(f, x…)` | `runtime.file.write` × N + `runtime.file.writeln` |
| `read(f, a…)` | `runtime.file.read` + `runtime.convert.*` |
| `readln(f, a…)` | `runtime.file.read` × N + `runtime.file.readln` |
| `reset` / `rewrite` / `get` / `put` / `page` / `eof` / `eoln` / `f^` | `runtime.file.{reset,rewrite,get,put,page,eof,eoln,peek}` |

## 7. rewrite 翻译表

| lowering key | runtime 产出 |
|---|---|
| `lowering.io.write[target, targetType, value, valueType, width, prec]` | `runtime.file.write(target, runtime.convert.{vt}.To.{u}[value, width, prec])` |
| `lowering.io.writeln[target, targetType]` | `runtime.file.writeln(target)` |
| `lowering.io.read[target, targetType, valueType]` | `runtime.convert.{u}.To.{vt}[ runtime.file.read(target) ]` |
| `lowering.io.readln.skip[target, targetType]` | `runtime.file.readln(target)` |
| `lowering.io.page[target, targetType]` | `runtime.file.page(target)` |
| `lowering.io.eof` / `.eoln` | `runtime.file.eof(null)` / `runtime.file.eoln(null)` |
| `lowering.file.create[type]` | `runtime.file.create(type)` |
| `lowering.file.reset/rewrite/get/put/peek/eof/eoln[f]` | `runtime.file.*(f)` |
| `lowering.program.fileUrl[f, name]` | `runtime.program.fileUrl(f, name)` |
| `lowering.mem.default[typeDesc]` | `runtime.mem.new(sizeOf(typeDesc))` |
| `lowering.array.access[arr, idx…, typeDesc]` | 标量 `runtime.num.get(arr, off, codec)`；复合 `runtime.view.sub(arr, off, size)` |
| `lowering.array.assign[arr, idx…, v, typeDesc]` | 标量 `runtime.num.set(arr, off, codec, v)`；复合 `runtime.mem.copy(arr, off, v, size)` |
| `lowering.rec.access[rec, name, typeDesc]` | 同 array.access |
| `lowering.rec.assign[rec, name, v, typeDesc]` | 同 array.assign |
| `lowering.rec.copy[rec, typeDesc]` | `runtime.mem.copy(runtime.mem.new(size), 0, rec, size)` |
| `lowering.set.empty/range/elem/literal` | `runtime.mem.new(setSize)` / `runtime.set.range/elem/literal` |
| 阶段 1 的 `lowering.add/eq/...`（type 为 set） | `runtime.set.union/intersect/diff/eq/ne/le/ge` |
| `lowering.in[v, vt, s, st]` | `runtime.set.in(v, s, size)` |
| `lowering.cell.create/get/set` | `runtime.cell.new/get/set` |
| `lowering.range.check` | `runtime.range.check` |

## 8. lowering 产出规范

- 变长过程**每个值实参一条 syscall**，参数按 `(expr, type)` 排布
- `x:width:precision` → 拆成 `(value, type, width, prec)`，缺失用 `litNull()`
- file 首参连同 typeDesc 作为 `target`；无 file 传 `litNull()`
- 数组/记录访问：`indices` / `field name` 与 `typeDesc` 一起传入
- 字符串字面量 → `Uint8Array` 字面量

---

# 第二部分 · 设计（怎么改）

## 9. 代码结构（新增为主，尽量不动原文件）

### 9.1 新增文件（4 个）

| 文件 | 内容 |
|---|---|
| `middle/rewrite/type-layout.ts` | `sizeOf` / `codecOf` / `setSize` / `fieldSlot` / `arraySlot`（移植 boot-tex 的 `codecTable` + `selectCodec` + `buildLayout`） |
| `backend/runtime/sys/convert.ts` | `runtime.convert.*`（文本 / 二进制两套转换） |
| `backend/runtime/sys/mem.ts` | `runtime.mem.*` / `num.*` / `view.*` / `set.*` / `cell.*` |
| `backend/runtime/sys/file-runtime.ts` | `runtime.file.*`（新原语，**不接类型参数**，按句柄分派） |

### 9.2 原地追加（只增不改原有内容）

| 文件 | 追加 |
|---|---|
| `middle/rewrite/runtime-keys.ts` | 新的 `runtime.*` 常量 |
| `middle/rewrite/pascal-rewriters.ts` | io / file / array / rec / set / cell 的翻译规则 |
| `backend/runtime/runtime.ts` | `getDefaultSyscalls()` 里合并 `convertSyscalls()` + `memSyscalls()` + `fileRuntimeSyscalls()`（**一行**） |

### 9.3 原地修改（少数，必须）

| 文件 | 改动 |
|---|---|
| `middle/lowering/helpers.ts` | key 表换成 `lowering.*` |
| `middle/lowering/io.ts` | write / read 机械产 `(value, type, width, prec)` |
| `middle/lowering/statements.ts` | 文件过程 / 数组记录赋值 |
| `middle/lowering/expressions.ts` | 数组记录访问 / set 构造 / eof·eoln |
| `middle/lowering/type.ts` | `serializeTypeInfo` 展平；`defaultExpr` 改产 `lowering.mem.default`；删 `typeSuffix` / `isRecordFile` |
| `middle/lowering/lowering.ts` | `program.fileUrl` |
| `backend/runtime/sys/pascal-semantic-compiler.ts` | **只改 `literalToJs`**：`bool` → `'1'`/`'0'`；新增 `bytes` case（`Uint8Array`） |
| `backend/runtime/sys/arith.ts` | **只改 `boolNot`**：`a ? 0 : 1`（`boolAnd`/`boolOr` 用 `&&`/`\|\|` 对 0/1 已正确） |
| `boot-tex/src/utils.ts`、`src/tex/build-tex.ts` | 换新 key |

### 9.4 不动（旧 key 失去上游 → 死代码，暂留）

`backend/runtime/sys/file.ts`（旧 IO/file handler）、`runtime-util.ts`（handler 工厂）、
`runtime-type.ts`（对象模型类型）、`memory-text-file.ts` / `memory-record-file.ts`（旧接口）。

> 待新链路稳定后，可在后续 commit 里一次性删除。

## 10. 关键数据结构

### 10.1 TypeDescriptor（`lowering/type.ts` + `runtime-type.ts` 同步）

**`tag` 就是类型本身，`elem` 是唯一的泛型参数** —— 不再有 `baseTag` / `setBase` / `enumCount`：

```ts
interface TypeDescriptor {
  tag: string            // i32 / f64 / bool / char / array / rec / set / file / pointer
  low?: number           // 序数类型的下界（存在即子界）
  high?: number
  dims?: { low: number; high: number }[]
  elem?: TypeDescriptor  // 泛型参数：array 的元素 / set 的基类型
  fields?: { name: string; type: TypeDescriptor }[]
  variant?: VariantPartDescriptor
}
```

序列化时把 `analysis` 侧的复合形态**展平**：

| TypeInfo（analysis） | TypeDescriptor（rewrite 消费） |
|---|---|
| `{ tag: 'subrange', low, high, baseTag }` | `{ tag: <baseTag>, low, high }` |
| `{ tag: 'enum', enumCount }` | `{ tag: 'i32', low: 0, high: enumCount - 1 }` |
| `{ tag: 'set', setBase }` | `{ tag: 'set', elem: <setBase> }` |

好处：`codecOf` 只有一条规则 —— **带 `low`/`high` 的序数类型按范围选宽度**，
不必先判 `subrange` 再读 `baseTag`。

### 10.2 type-layout.ts 接口

```ts
export type Codec = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'f32'

export function sizeOf(td: TypeDescriptor): number
export function codecOf(td: TypeDescriptor): Codec          // 仅标量
export function setSize(td: TypeDescriptor): number
export function fieldSlot(td: TypeDescriptor, name: string):
  { offset: number; size: number; type: TypeDescriptor; scalarCodec?: Codec }
export function arraySlot(td: TypeDescriptor, indices: Expr[]):
  { offset: (lowConstants: number[]) => Expr; size: number; elemType: TypeDescriptor }
```

`sizeOf` / `codecOf` 的算法**直接搬运 boot-tex `utils.ts` 的 `selectCodec` + `buildLayout`**，
保证二进制布局逐字节一致。

### 10.3 新 FileStore 接口（定义在新增的 `file-runtime.ts` 内，不动 `runtime-type.ts`）

```ts
type Unit = number | Uint8Array     // text: number(char)；record: Uint8Array

interface FileStore {
  reset(): void; rewrite(): void
  get(): void; peek(): Unit; put(u: Unit): void
  read(): Unit; write(u: Unit): void
  readln(): void; writeln(): void
  eof(): boolean; eoln(): boolean; page(): void
}
```

句柄复用现有 `runtime-type.ts` 的 `PascalFile`（它已带 `type: TypeDescriptor`）：
runtime 据 `f.type.elem.tag` 决定 text / record 行为。新 handler 内部把 `f.value` 断言为新 `FileStore`。

### 10.4 暂时保留的旧类型

`PascalArray` / `PascalRecord` / `PascalSet` / `ArrayHandler` / `RecordHandler` / `TypeHandler` /
`ArrayValue` / `RecordValue` / `DefaultRecordValue` / `VariantState` / `DimsLink`

新链路只用 `Uint8Array` + `number` + `object`（file/pointer/cell）；这些旧类型随之成为死代码，
留到 Step 5 一次性删除。

## 11. 改动清单（逐文件）

### 11.1 `middle/rewrite/type-layout.ts`（新建）

搬运 boot-tex 的 `codecTable` / `selectCodec` / `buildLayout` / `buildVariantFields`，
改为纯函数（输入 `TypeDescriptor`，输出 size/codec/offset），去掉 handler 构建逻辑。

### 11.2 `middle/rewrite/pascal-rewriters.ts`

保留阶段 1 的算术/比较/转换 rewriter；新增：

```
lowering.io.write / writeln / read / readln.skip / page / eof / eoln
lowering.file.create / reset / rewrite / get / put / peek / eof / eoln
lowering.program.fileUrl
lowering.mem.default
lowering.array.access / assign
lowering.rec.access / assign / copy
lowering.set.empty / range / elem / literal
lowering.in
lowering.cell.create / get / set
```
每个 rewriter 用 `type-layout.ts` 算 `off` / `codec` / `size`。

### 11.3 `backend/runtime/sys/file-runtime.ts`（新建）

- 新 key `runtime.file.*`，**不接类型参数**
- 每个 handler 内部按句柄 `f.type.elem.tag` 决定 text / record 行为
- 原 `file.ts` 保持不动（其 key 失去上游后成为死代码）

### 11.4 `backend/runtime/sys/convert.ts`（新建）

实现第一节 §3 的 8+ 个转换 handler（文本 / 二进制两套），复用 `formatReal` / `formatField` / `encodeUtf8`。

### 11.5 `backend/runtime/sys/mem.ts`（新建）

`runtime.mem.new`（`new Uint8Array(size)`）、`runtime.mem.copy`（`dst.set(src.subarray(...), off)`）、
`runtime.num.get/set`（按 codec 选 `DataView` 方法）、`runtime.view.sub`（`subarray`）、
`runtime.set.*`（位图）、`runtime.cell.*`。

### 11.6 `backend/runtime/sys/pascal-semantic-compiler.ts`（只改 `literalToJs`）

- `bool` key → `'1'` / `'0'`（原来产 JS 的 `true` / `false`）
- 新增 `bytes` key → `Uint8Array` 字面量（字符串字面量用）
- `char` literal 由 lowering 直接产 `i32`（编码 ord 值），`char` case 不再被使用
- `syscallToJs` 保持「全走 dispatcher」，不动

### 11.7 `backend/runtime/sys/arith.ts`（只改 `boolNot`）

- `bool.and` / `.or` **不改**：`&&` / `||` 对 0/1 输入结果仍是 0/1，且保短路
- `bool.not` 改为 `a ? 0 : 1`（原 `!a` 产 JS boolean）

### 11.8 codegen 的 bool inline（不改）

`pascal-semantic-compiler.ts` 里 `bool.and` / `bool.or` 的 inline 保持 `a && b` / `a || b` —— 对 0/1 输入已正确且短路。

### 11.9 `middle/lowering/*`

按 §8 规范改写；`helpers.ts` 的 key 表整体替换。

### 11.10 boot-tex

`extraSyscalls` → 新 key；binary record 逻辑迁到 `syscallRewriters`；`texExtraSyscalls` 同步。

## 12. 实施步骤（不删旧，全程可回退）

**Step 1｜新增 type-layout（不动链路）**
- 新建 `type-layout.ts` + 单测（对照 boot-tex 布局结果）

**Step 2｜新增 runtime 原语（新旧并存）**
- 新建 `convert.ts` / `mem.ts` / `file-runtime.ts`
- `runtime.ts` 追加合并（一行）
- `pascal-semantic-compiler.ts` 的 `literalToJs` 小改；`arith.ts` 的 `boolNot` 小改
- 旧 key 仍在 → `deno test` 应保持 1120 全绿

**Step 3｜切换（关键一步）**
- `lowering/*` 改产 `lowering.*` 新 key；`serializeTypeInfo` 展平
- `runtime-keys.ts` + `pascal-rewriters.ts` 追加翻译
- 跑通 1120 用例

**Step 4｜boot-tex 同步 + 端到端**
- 换新 key；binary record 逻辑迁到 `syscallRewriters`
- `deno task boot-tangle` + `deno task boot-tex`

**Step 5｜（后续 commit）删旧**
- 旧 `file.ts` / `runtime-util.ts` / 对象模型类型 / `memory-*-file.ts` 的旧接口

## 13. 验证

- Step 1：`type-layout` 单测（与 boot-tex 布局逐字节比对）
- Step 2：`deno test --allow-read` 保持 1120 全绿
- Step 3/4：`deno test --allow-read` 全绿
- Step 5：`deno task boot-tangle`（6 stages）+ `deno task boot-tex`（8 stages，trip.log / trip.dvi 逐字节比对）
