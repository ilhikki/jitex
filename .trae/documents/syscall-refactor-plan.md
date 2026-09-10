# Syscall 体系重构规划

## 原则

### 1. lowering 产泛型 syscall + type 参数，rewrite 消费 type 产出 runtime.syscall

**为什么**：

- lowering 不应做类型判断。现在 lowering 通过 `typeSuffix(ti)` 选 6×4 个 io key、按 `lt.tag` 选 i32/f64/bool
  算术——类型分发逻辑散落在 lowering 各处。类型是编译期信息，应在 rewrite 统一消费。
- lowering 产 `lowering.add[left, leftType, right, rightType]`，rewrite 看 type 分发到 `runtime.i32.add` 等。lowering
  简化为纯结构翻译。

### 2. 重构后一律 `lowering.` / `runtime.` 前缀，不保留任何旧 key

**为什么**：

- 旧 key 无命名空间（`io.write.i32`/`i32.add`/`array.get` 混在一起），lowering 与 runtime 耦合。
- 新 key 分两层：`lowering.*`（泛型，含 type 参数）由 lowering 产，rewrite 消费后产 `runtime.*`（终态）。两层职责清晰。

### 3. 统一 Uint8Array 内存模型（三种 JS 类型）

**为什么**：

- 现状 PascalArray/PascalRecord/ArrayHandler/RecordHandler 包装对象开销大，且 boot-tex 的 binary record 已证明
  Uint8Array 布局可行且更高效。
- 嵌套引用语义（`a[0]` 返回内部数组、对它改动体现在 `a`）天然由 subarray 共享底层实现。包装对象需要额外 handler
  层才能实现。
- 统一模型让 boot-tex binary record 不再特殊——它的 `buildLayout/selectCodec` 就是本模型的一部分。

### 4. 变体 record 的 a 写 b 读统一为不保护

**为什么**：

- ISO 7185 规定变体字段访问在非活跃分支是未定义行为。
- 现状 pascal-to-js 默认实现抛错（a 写 b 读保护），boot-tex binary record 不保护（允许跨分支读写）。
- 统一为不保护：变体区所有分支 union 共用同一段 buffer，切分支不清空，读写不检查 tag。符合未定义行为规范，与 boot-tex
  一致，简化实现。

### 5. 不做 inline 优化，一切走 runtime.syscall dispatch

**为什么**：

- 本版目标是行为正确（通过单元测试 + boot-tex 测试），性能后续优化。
- 现有 `syscallToJs` 的 48 个 inline case 全部改为 `runtime.*` dispatch，codegen 只产 `__sys(key, args)` 调用。
- 减少重构面：codegen 的 inline 逻辑全部移除，统一走 dispatcher。优化阶段再加回 inline。

### 6. cell 与 pointer 用对象，文件用特殊对象

**为什么**：

- cell（var 参数传递）和 pointer 是引用机制，不参与 buffer 布局，用 `{value}` 对象最简单。
- 文件是有状态 runtime 对象（TextFile/RecordFile），底层 RecordFile 用 Uint8Array 存块，但外部是特殊对象，不叫
  `mem.*`（便于扩展如保存到本地）。

---

## 内存模型

### 三种 JS 类型

| 类型            | JS 表示                   | 用途                                          |
| --------------- | ------------------------- | --------------------------------------------- |
| number          | JS number                 | 所有标量（i32/f32/bool/char/enum/subrange）   |
| Uint8Array 视图 | Uint8Array（含 subarray） | array/record/set 的底层存储                   |
| object          | JS 对象                   | cell（`{value}`）、pointer（`{value}`）、file |

### 标量（number）

- i32/subrange/enum：number，`| 0` 截断
- f32（原名 f64，实际是 f32）：number，`Math.fround`
- bool：number（1/0，非 JS boolean，统一便于 DataView）
- char：number（charCode）

### array

- `array[lo..hi] of elemType` → Uint8Array，大小 `(hi-lo+1) * elemSize`
- `a[i]` → 视图偏移 `(i-lo) * elemSize`，长度 `elemSize`
- 标量元素：读写用 DataView（`getInt32`/`getFloat32` 等）
- 复合元素（嵌套 array/record）：`a[i]` 返回 subarray（共享底层），改动体现在 `a` 上
- 多维数组扁平化为一维 Uint8Array，索引计算 `(i-a)*(dim2Size)*elemSize + (j-c)*elemSize`
- 子数组 `a[i]` 返回 subarray 覆盖内层那段连续字节——天然引用语义

### record

- 固定字段按布局顺序排列，每字段有 offset 和 size
- 标量字段：`r.f` → `view.getInt32(offset)` / `view.setFloat32(offset, v)`
- 复合字段（嵌套 record/array）：`r.f` → `view.subarray(offset, offset+size)`，共享底层
- 变体部分：所有分支 union 共用同一段 buffer（取最大分支 size），不保护 a 写 b 读
- tag 字段：存 buffer 中固定 offset
- `r := r2`（整体赋值）→ `dst.set(src)` 字节拷贝

### set

- 位图：每个元素 1 bit
- `set of 0..N` → `Math.ceil((N+1)/8)` 字节
- 运算：位或（union）、位与（intersect）、位异或（diff）、位测试（in）

### pointer / cell

- `{value: number | Uint8Array | object}` JS 对象
- nil = null
- `new` → 分配 buffer，`{value: view}`
- `p^` → `p.value`（视图或标量）
- var 参数：传 cell 对象，读写 `.value`

### file

- 特殊对象（TextFile/RecordFile），不叫 mem
- TextFile：字节流读写
- RecordFile：底层用 Uint8Array 存块，但外部是 file 对象
- `file.rec.*` 操作 RecordFile，buffer 是 Uint8Array

---

## 翻译表：旧 syscall → 新 runtime.syscall

### 算术/逻辑（类型分发从 lowering 移入 rewrite）

| 旧 key                         | 新 lowering key              | rewrite 产 runtime.syscall          | runtime 语义                      |
| ------------------------------ | ---------------------------- | ----------------------------------- | --------------------------------- |
| i32.add                        | `lowering.add[l, lt, r, rt]` | `runtime.i32.add[l, r]`             | `(a+b)\|0`                        |
| f64.add（实为 f32）            | 同上                         | `runtime.f32.add[l, r]`             | `Math.fround(a+b)`                |
| i32.sub/f64.sub                | `lowering.sub`               | `runtime.i32.sub`/`runtime.f32.sub` | 减法                              |
| i32.mul/f64.mul                | `lowering.mul`               | `runtime.i32.mul`/`runtime.f32.mul` | 乘法                              |
| i32.div                        | `lowering.div`               | `runtime.i32.div`                   | `Math.trunc(a/b)\|0`，除零检查    |
| f64.div                        | 同上                         | `runtime.f32.div`                   | `Math.fround(a/b)`                |
| i32.mod                        | `lowering.mod`               | `runtime.i32.mod`                   | `a - Math.trunc(a/b)*b`，除零检查 |
| i32.neg/f64.neg                | `lowering.neg`               | `runtime.i32.neg`/`runtime.f32.neg` | 取负                              |
| i32.abs/f64.abs                | `lowering.abs`               | `runtime.i32.abs`/`runtime.f32.abs` | 绝对值                            |
| i32.odd                        | `lowering.odd`               | `runtime.i32.odd`                   | `(a%2)!==0`                       |
| f64.sqrt/sin/cos/exp/ln/arctan | `lowering.sqrt` 等           | `runtime.f32.sqrt` 等               | Math 函数，sqrt/ln 域检查         |
| i32.and/i32.or/i32.not         | `lowering.and/or/not`        | `runtime.i32.and/or/not`            | 位运算，按 i32 vs bool 分发       |
| bool.and/or/not                | （并入上）                   | `runtime.bool.and/or/not`           | 逻辑运算                          |

### 比较

| 旧 key          | 新 lowering key             | rewrite 产                                      | runtime 语义    |
| --------------- | --------------------------- | ----------------------------------------------- | --------------- |
| cmp.eq          | `lowering.eq[l, lt, r, rt]` | set → `runtime.set.eq`；标量 → `runtime.cmp.eq` | `a===b`（标量） |
| cmp.ne          | `lowering.ne`               | 同上分发                                        | `a!==b`         |
| cmp.lt/le/gt/ge | `lowering.lt/le/gt/ge`      | `runtime.cmp.lt/le/gt/ge`                       | 比较            |

### 转换

| 旧 key                      | 新 lowering key                      | rewrite 产                      | runtime 语义          |
| --------------------------- | ------------------------------------ | ------------------------------- | --------------------- |
| cast.char.to.i32            | `lowering.cast[v, fromType, toType]` | `runtime.cast.char.to.i32`      | charCode              |
| cast.bool.to.i32            | 同上                                 | `runtime.cast.bool.to.i32`      | `a?1:0`               |
| cast.i32.to.char            | 同上                                 | `runtime.cast.i32.to.char`      | `String.fromCharCode` |
| cast.f64.to.i32（实为 f32） | 同上                                 | `runtime.cast.f32.to.i32`       | `Math.trunc`          |
| cast.f64.to.i32.round       | 同上                                 | `runtime.cast.f32.to.i32.round` | ISO round             |

### 指针

| 旧 key            | 新 lowering key                 | rewrite 产                  | runtime 语义             |
| ----------------- | ------------------------------- | --------------------------- | ------------------------ |
| ptr.deref         | `lowering.ptr.deref[p]`         | `runtime.ptr.deref`         | nil 检查 + `p.value`     |
| ptr.assign        | `lowering.ptr.assign[p, v]`     | `runtime.ptr.assign`        | nil 检查 + `p.value = v` |
| ptr.dispose.check | `lowering.ptr.dispose.check[p]` | `runtime.ptr.dispose.check` | nil 检查                 |

### IO 写入

| 旧 key（24 个）                           | 新 lowering key                                              | rewrite 产                             | runtime 语义    |
| ----------------------------------------- | ------------------------------------------------------------ | -------------------------------------- | --------------- |
| io.write.i32/f64/bool/char/char.array/set | `lowering.io.write[value, typeDesc, fmt?, prec?]`            | 按 type 分发 `runtime.io.write.i32` 等 | 写 OUTPUT       |
| io.write.*.file（6 个）                   | `lowering.io.write.file[file, value, typeDesc, fmt?, prec?]` | 同上                                   | 写指定文件      |
| io.write.*.fmt（6 个）/ .fmt.file（6 个） | （并入上，fmt 参数）                                         | 同上                                   | 格式化写        |
| io.writeln                                | `lowering.io.writeln`                                        | `runtime.io.writeln`                   | 写换行到 OUTPUT |
| io.writeln.file                           | `lowering.io.writeln.file[file]`                             | `runtime.io.writeln.file`              | 写换行到文件    |
| io.page                                   | `lowering.io.page[file?]`                                    | `runtime.io.page`                      | 分页            |

### IO 读取

| 旧 key（12 个）                          | 新 lowering key                         | rewrite 产                            | runtime 语义    |
| ---------------------------------------- | --------------------------------------- | ------------------------------------- | --------------- |
| io.read.i32/f64/bool/char/char.array/set | `lowering.io.read[typeDesc]`            | 按 type 分发 `runtime.io.read.i32` 等 | 从 INPUT 读     |
| io.read.*.file（6 个）                   | `lowering.io.read.file[file, typeDesc]` | 同上                                  | 从文件读        |
| io.readln.skip/.skip.file                | `lowering.io.readln.skip`/`.file[file]` | `runtime.io.readln.skip` 等           | 跳过行          |
| io.eof/eoln                              | `lowering.io.eof`/`.eoln`               | `runtime.io.eof`/`.eoln`              | 查询 INPUT 状态 |

### 数组

| 旧 key            | 新 lowering key                                  | rewrite 产                                                         | runtime 语义          |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------ | --------------------- |
| mem.default.array | `lowering.mem.default[typeDesc]`                 | `runtime.array.new[sizeLit, elemSizeLit, defaultExpr?]`            | 分配 Uint8Array       |
| array.get         | `lowering.array.access[arr, idx, typeDesc]`      | `runtime.array.get[arr, idx, lowLit, elemSizeLit, codecLit?]`      | 读标量或返回 subarray |
| array.set         | `lowering.array.assign[arr, idx, val, typeDesc]` | `runtime.array.set[arr, idx, lowLit, elemSizeLit, val, codecLit?]` | 写标量或 set subarray |
| str.to.char.array | `lowering.str.to.array[strLit]`                  | `runtime.array.fromStr[strLit]`                                    | 字符串 → char 数组    |
| array.char.resize | `lowering.array.char.resize[low, high, src]`     | `runtime.array.char.resize[low, high, src]`                        | 边界调整              |

### 记录

| 旧 key          | 新 lowering key                                      | rewrite 产                                                                                               | runtime 语义    |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| mem.default.rec | `lowering.mem.default[typeDesc]`                     | `runtime.rec.new[sizeLit, defaultExpr?]`                                                                 | 分配 Uint8Array |
| rec.field       | `lowering.rec.access[obj, fieldName, typeDesc]`      | `runtime.rec.get[obj, offsetLit, codecLit]`（标量）或 `runtime.rec.sub[obj, offsetLit, sizeLit]`（复合） | 读字段          |
| rec.set         | `lowering.rec.assign[obj, fieldName, val, typeDesc]` | `runtime.rec.set[obj, offsetLit, codecLit, val]` 或 `runtime.rec.copy[obj, offsetLit, src, sizeLit]`     | 写字段          |
| rec.copy        | `lowering.rec.copy[obj, typeDesc]`                   | `runtime.rec.copy[obj, sizeLit]`                                                                         | 深拷贝          |

### 集合

| 旧 key        | 新 lowering key                           | rewrite 产                 | runtime 语义 |
| ------------- | ----------------------------------------- | -------------------------- | ------------ |
| set.empty     | `lowering.set.empty[typeDesc]`            | `runtime.set.new[sizeLit]` | 新建空位图   |
| set.union     | `lowering.set.union[a, b, sizeLit]`       | `runtime.set.union`        | 位或         |
| set.intersect | `lowering.set.intersect`                  | `runtime.set.intersect`    | 位与         |
| set.diff      | `lowering.set.diff`                       | `runtime.set.diff`         | 位异或       |
| set.eq/ne     | `lowering.set.eq[a, b, sizeLit]`          | `runtime.set.eq`/`.ne`     | 位图比较     |
| set.le/ge     | `lowering.set.le`/`.ge`                   | `runtime.set.le`/`.ge`     | 子集/超集    |
| set.range     | `lowering.set.range[start, end, sizeLit]` | `runtime.set.range`        | 范围集合     |
| set.elem      | `lowering.set.elem[v]`                    | `runtime.set.elem`         | 单元素集     |
| set.literal   | `lowering.set.literal[...elems, sizeLit]` | `runtime.set.literal`      | 字面量集合   |
| set.in        | `lowering.set.in[v, set, sizeLit]`        | `runtime.set.in`           | 位测试       |

### cell

| 旧 key      | 新 lowering key                | rewrite 产         | runtime 语义       |
| ----------- | ------------------------------ | ------------------ | ------------------ |
| cell.create | `lowering.cell.create[value]`  | `runtime.cell.new` | `{value: v}`       |
| cell.get    | `lowering.cell.get[cell]`      | `runtime.cell.get` | `cell.value`       |
| cell.set    | `lowering.cell.set[cell, val]` | `runtime.cell.set` | `cell.value = val` |

### 文件

| 旧 key                   | 新 lowering key                                     | rewrite 产                    | runtime 语义         |
| ------------------------ | --------------------------------------------------- | ----------------------------- | -------------------- |
| program.fileUrl          | `lowering.program.fileUrl[f, name]`                 | `runtime.program.fileUrl`     | 绑定文件 URL         |
| file.create              | `lowering.file.create[typeDesc]`                    | `runtime.file.create`         | 创建文件对象         |
| file.reset               | `lowering.file.reset[file, fileName?, typeDesc?]`   | `runtime.file.reset`          | seek(0) + inspection |
| file.rewrite             | `lowering.file.rewrite[file, fileName?, typeDesc?]` | `runtime.file.rewrite`        | clear + generation   |
| file.get/get.char        | `lowering.file.get[file, typeDesc?]`                | `runtime.file.get`/`.char`    | 推进/读字符          |
| file.put                 | `lowering.file.put[file, value?]`                   | `runtime.file.put`            | 写入                 |
| file.peek/peek.char      | `lowering.file.peek[file, typeDesc?]`               | `runtime.file.peek`/`.char`   | 查看                 |
| file.eof/eoln            | `lowering.file.eof[file]`/`.eoln`                   | `runtime.file.eof`/`.eoln`    | 查询                 |
| file.rec.reset/rewrite   | `lowering.file.rec.reset[file, typeDesc?]` 等       | `runtime.file.rec.reset` 等   | 记录文件操作         |
| file.rec.get/put         | `lowering.file.rec.get[file]` 等                    | `runtime.file.rec.get` 等     | 记录读写             |
| file.rec.setbuf/peek/eof | 同上                                                | `runtime.file.rec.setbuf` 等  | 缓冲区操作           |
| hook.function.enter      | `lowering.hook.function.enter[name]`                | `runtime.hook.function.enter` | no-op（可配置删除）  |

### factory（消失）

| 旧 key                     | 处理                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| factory.createHandler      | 消失。`lowering.mem.default` 由 rewrite 直接产 `runtime.array.new`/`runtime.rec.new` |
| factory.createRecHandler   | 同上                                                                                 |
| factory.createArrayHandler | 同上                                                                                 |

### boot-tex 扩展（并入相应阶段）

| 旧 key                                                        | 处理                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| extra.break/close/breakIn/erStat                              | boot-tex `syscallRewriters` 处理                                                                               |
| file.rewrite/reset（覆盖，带 fileName）                       | 阶段 2 并入，boot-tex 通过 `syscallRewriters` 覆盖 `runtime.file.reset` 等                                     |
| io.write.i32.file（覆盖，binary）                             | 阶段 2 并入                                                                                                    |
| file.rec.rewrite/reset（覆盖）                                | 阶段 3 并入                                                                                                    |
| factory.createHandler/createRecHandler（覆盖，binary record） | 阶段 3 迁入 boot-tex `syscallRewriters`，覆盖 `lowering.mem.default`/`lowering.rec.access` 等，产 binary codec |

### 检查/控制

| 旧 key      | 新 lowering key                       | rewrite 产                          | runtime 语义 |
| ----------- | ------------------------------------- | ----------------------------------- | ------------ |
| steps.check | `lowering.steps.check`                | `runtime.steps.check`（可配置删除） | 步数限制     |
| range.check | `lowering.range.check[idx, min, max]` | `runtime.range.check`（可配置删除） | 边界检查     |

---

## runtime.syscall 语义表

所有 runtime.syscall 走 dispatcher（`__sys(key, args)`），本版不 inline。

### mem（内存分配/拷贝）

| key                 | args                           | 语义                               |
| ------------------- | ------------------------------ | ---------------------------------- |
| `runtime.array.new` | [size, elemSize, defaultExpr?] | 分配 size*elemSize 字节 Uint8Array |
| `runtime.rec.new`   | [size, defaultExpr?]           | 分配 size 字节 Uint8Array          |
| `runtime.mem.copy`  | [dst, src, size]               | `dst.set(src)` 字节拷贝（:= 赋值） |

### num（标量读写）

| key               | args                       | 语义                                       |
| ----------------- | -------------------------- | ------------------------------------------ |
| `runtime.num.get` | [view, offset, codec]      | `view.getInt32(offset)` 等，codec 决定方法 |
| `runtime.num.set` | [view, offset, codec, val] | `view.setInt32(offset, val)` 等            |

### view（视图操作）

| key                     | args               | 语义                        |
| ----------------------- | ------------------ | --------------------------- |
| `runtime.view.subarray` | [view, start, end] | `view.subarray(start, end)` |

### array（数组）

| key                         | args                                   | 语义                                                        |
| --------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `runtime.array.get`         | [arr, idx, low, elemSize, codec?]      | 标量：`arr.getNum((idx-low)*elemSize)`；复合：返回 subarray |
| `runtime.array.set`         | [arr, idx, low, elemSize, val, codec?] | 标量写或 `arr.set(sub)`                                     |
| `runtime.array.fromStr`     | [str]                                  | 字符串 → char 数组                                          |
| `runtime.array.char.resize` | [low, high, src]                       | 边界调整                                                    |

### rec（记录）

| key                | args                      | 语义                |
| ------------------ | ------------------------- | ------------------- |
| `runtime.rec.get`  | [rec, offset, codec]      | 读标量字段          |
| `runtime.rec.set`  | [rec, offset, codec, val] | 写标量字段          |
| `runtime.rec.sub`  | [rec, offset, size]       | 取复合字段 subarray |
| `runtime.rec.copy` | [rec, size]               | 深拷贝（字节拷贝）  |

### set（集合）

| key                     | args               | 语义       |
| ----------------------- | ------------------ | ---------- |
| `runtime.set.new`       | [size]             | 新建空位图 |
| `runtime.set.union`     | [a, b, size]       | 位或       |
| `runtime.set.intersect` | [a, b, size]       | 位与       |
| `runtime.set.diff`      | [a, b, size]       | 位异或     |
| `runtime.set.eq`/`.ne`  | [a, b, size]       | 位图比较   |
| `runtime.set.le`/`.ge`  | [a, b, size]       | 子集/超集  |
| `runtime.set.range`     | [start, end, size] | 范围集合   |
| `runtime.set.elem`      | [v]                | 单元素集   |
| `runtime.set.literal`   | [elems, size]      | 字面量集合 |
| `runtime.set.in`        | [v, set, size]     | 位测试     |

### i32 / f32 / bool（算术）

| key                                                     | args          | 语义                      |
| ------------------------------------------------------- | ------------- | ------------------------- |
| `runtime.i32.add`/`.sub`/`.mul`                         | [a, b]        | 算术，`\| 0` 截断         |
| `runtime.i32.div`/`.mod`                                | [a, b]        | 除零检查                  |
| `runtime.i32.neg`/`.abs`/`.odd`                         | [a]           |                           |
| `runtime.i32.and`/`.or`/`.not`                          | [a, b] 或 [a] | 位运算                    |
| `runtime.f32.add`/`.sub`/`.mul`/`.div`                  | [a, b]        | `Math.fround`             |
| `runtime.f32.neg`/`.abs`                                | [a]           |                           |
| `runtime.f32.sqrt`/`.sin`/`.cos`/`.exp`/`.ln`/`.arctan` | [a]           | Math 函数，sqrt/ln 域检查 |
| `runtime.bool.and`/`.or`/`.not`                         | [a, b] 或 [a] | 逻辑运算                  |

### cmp（比较）

| key                                            | args         | 语义     |
| ---------------------------------------------- | ------------ | -------- |
| `runtime.cmp.eq`/`.ne`/`.lt`/`.le`/`.gt`/`.ge` | [a, b]       | 标量比较 |
| `runtime.set.eq`/`.ne`/`.le`/`.ge`             | [a, b, size] | 集合比较 |

### cast（转换）

| key                             | args | 语义                  |
| ------------------------------- | ---- | --------------------- |
| `runtime.cast.char.to.i32`      | [v]  | charCode              |
| `runtime.cast.bool.to.i32`      | [v]  | `v?1:0`               |
| `runtime.cast.i32.to.char`      | [v]  | `String.fromCharCode` |
| `runtime.cast.f32.to.i32`       | [v]  | `Math.trunc`          |
| `runtime.cast.f32.to.i32.round` | [v]  | ISO round             |

### ptr / cell（引用）

| key                         | args      | 语义                     |
| --------------------------- | --------- | ------------------------ |
| `runtime.ptr.deref`         | [p]       | nil 检查 + `p.value`     |
| `runtime.ptr.assign`        | [p, v]    | nil 检查 + `p.value = v` |
| `runtime.ptr.dispose.check` | [p]       | nil 检查                 |
| `runtime.cell.new`          | [v]       | `{value: v}`             |
| `runtime.cell.get`          | [cell]    | `cell.value`             |
| `runtime.cell.set`          | [cell, v] | `cell.value = v`         |

### io（输入输出）

| key                                                                | args                     | 语义       |
| ------------------------------------------------------------------ | ------------------------ | ---------- |
| `runtime.io.write.i32`/`.f32`/`.bool`/`.char`/`.char.array`/`.set` | [value] 或 [file, value] | 写值       |
| `runtime.io.write.*.fmt`                                           | [value, width, prec?]    | 格式化写   |
| `runtime.io.writeln`/`.file`                                       | [file?]                  | 写换行     |
| `runtime.io.read.i32`/`.f32`/`.bool`/`.char`/`.char.array`/`.set`  | [file?]                  | 读值       |
| `runtime.io.readln.skip`/`.file`                                   | [file?]                  | 跳过行     |
| `runtime.io.eof`/`.eoln`                                           | []                       | 查询 INPUT |
| `runtime.io.page`                                                  | [file?]                  | 分页       |

### file（文件）

| key                                 | args                     | 语义         |
| ----------------------------------- | ------------------------ | ------------ |
| `runtime.program.fileUrl`           | [f, name]                | 绑定 URL     |
| `runtime.file.create`               | [type]                   | 创建文件对象 |
| `runtime.file.reset`/`.rewrite`     | [file, fileName?, type?] | 打开模式     |
| `runtime.file.get`/`.get.char`      | [file]                   | 推进/读      |
| `runtime.file.put`                  | [file, value?]           | 写           |
| `runtime.file.peek`/`.peek.char`    | [file]                   | 查看         |
| `runtime.file.eof`/`.eoln`          | [file]                   | 查询         |
| `runtime.file.rec.reset`/`.rewrite` | [file, type?]            | 记录文件模式 |
| `runtime.file.rec.get`/`.put`       | [file]                   | 记录读写     |
| `runtime.file.rec.setbuf`           | [file, rec]              | 设缓冲区     |
| `runtime.file.rec.peek`             | [file]                   | 查看记录     |
| `runtime.file.rec.eof`              | [file]                   | 记录 EOF     |

### hook / check（调试，可配置）

| key                           | args            | 语义     |
| ----------------------------- | --------------- | -------- |
| `runtime.hook.function.enter` | [name]          | no-op    |
| `runtime.steps.check`         | []              | 步数限制 |
| `runtime.range.check`         | [idx, min, max] | 边界检查 |

---

## 规划

### 阶段顺序调整

四个阶段，按依赖关系排序。阶段 1 和 2 可并行，但建议 1 先（验证 rewrite 通路）。

### 阶段 1：算术/逻辑/比较/转换

**范围**：把 lowering 里按类型选 i32/f32/bool/cmp/cast 的分发逻辑移入 rewrite。约 40 个 key。

**为什么先**：这些 key 数量最多、逻辑最清晰，不涉及内存模型改动。验证 rewrite 消费 type 参数、产出 runtime.syscall
的通路是否工作。runtime 实现基本搬现有 inline 逻辑改为 dispatch。

**涉及文件**：

- `src/middle/lowering/expressions.ts`：`loweringBinary`/`loweringUnary` 去掉类型分支，产泛型 key + type
- `src/middle/lowering/type.ts`：`typeSubCall`/`typeAddCall` 改泛型
- `src/middle/rewrite/pascal-rewriters.ts`：加算术/比较/转换的 rewriter
- `src/backend/runtime/sys/pascal-semantic-compiler.ts`：`syscallToJs` 的 48 个 inline case 移除，改为 `runtime.*`
  dispatch handler
- `src/backend/runtime/runtime.ts`：dispatcher 注册新 handler

### 阶段 2：IO 读写（含文件）

**范围**：io.write/read 的 typeSuffix 分发移入 rewrite。文件操作并入。约 50 个 key。boot-tex 的 file 覆盖并入。

**为什么其次**：IO 依赖阶段 1 的 rewrite 通路，但不依赖内存模型（标量读写仍是 number）。文件操作虽然操作 record
buffer，但通过 file 对象间接，本阶段可保留 file.rec.* 现状。

**涉及文件**：

- `src/middle/lowering/io.ts`：`ioWriteSyscall`/`ioReadSyscall` 去分发，产泛型 key + type
- `src/middle/lowering/type.ts`：`typeSuffix` 移除
- `src/middle/lowering/expressions.ts`：`ioEof`/`ioEoln` 等改前缀
- `src/middle/lowering/statements.ts`：文件操作 syscall 改前缀
- `src/middle/rewrite/pascal-rewriters.ts`：加 IO rewriter
- `src/backend/runtime/sys/file.ts`：handler 改 key 名
- `boot-tex/src/utils.ts`：file 覆盖迁入 `syscallRewriters`

### 阶段 3：复合类型去对象化（array + record + set + cell，统一 Uint8Array）

**范围**：去掉 PascalArray/PascalRecord/PascalSet/ArrayHandler/RecordHandler，统一 Uint8Array 模型。约 30 个
key。**必须整体改**，因为 array/record/set 互相嵌套。

**为什么最后**：依赖阶段 1（rewrite 通路）和 2（io.char.array 用数组）。这是最大的改动，涉及内存模型重构。binary record
的布局逻辑从 boot-tex 迁入 rewrite。

**涉及文件**：

- `src/middle/lowering/type.ts`：`defaultExpr` 改产泛型 `lowering.mem.default`
- `src/middle/lowering/expressions.ts`：`recField`/`arrayAccess`/`setConstructor` 改泛型 + type
- `src/middle/lowering/statements.ts`：`arraySet`/`recSet`/`recCopy` 改泛型
- `src/middle/rewrite/pascal-rewriters.ts`：加 array/rec/set/cell rewriter，消费 type 产布局
- `src/backend/runtime/sys/pascal-semantic-compiler.ts`：`basicSyscall` 改新 runtime.syscall，去包装对象
- `src/backend/runtime/runtime-type.ts`：移除 PascalArray/PascalRecord/ArrayHandler/RecordHandler，加 Uint8Array
  模型类型
- `src/backend/runtime/runtime-util.ts`：移除 `createRecHandler`/`createArrayHandler`/`defaultCreateHandler`，布局逻辑迁
  rewrite
- `src/backend/runtime/sys/file.ts`：`getPascalStringValue` 改操作 Uint8Array；file.rec.* buffer 改 Uint8Array
- `boot-tex/src/utils.ts`：`createBinaryRecordHandler` 布局逻辑迁入 `syscallRewriters`；binary record codec 选择覆盖默认

### 阶段 4：调试/检查（可配置生成）

**范围**：`hook.function.enter`/`steps.check`/`range.check` 加开关控制是否生成。约 3 个 key。

**为什么最后**：依赖前三阶段 key 体系稳定。

**涉及文件**：

- `src/middle/rewrite/pascal-rewriters.ts`：加开关逻辑（读 `TransformOptions.debugChecks`）
- `src/run.ts`：`TransformOptions` 加 `debugChecks?: boolean`

---

## 验证

- 阶段 1：Phase 1: Basics + Phase 7: Functions 测试
- 阶段 2：Phase 3: IO 测试
- 阶段 3：Phase 4: Arrays + Phase 5: Records + Phase 8: Sets + boot-tex tangle（binary record）
- 阶段 4：开/关两种模式全量测试
- 全程：`deno test --allow-read`（pascal-to-js，1120+ 测试）+ boot-tex 端到端

本版标准：通过单元测试和 boot-tex 测试，性能后续优化。
