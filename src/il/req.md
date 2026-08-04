# IL 编译器需求清单（req.md）

本文件汇总 `tests/integration/compiler/` 下 20 个测试文件覆盖的 Pascal 特性，
作为新 lowering 层（`analysis.ts` + `compiler.ts` → JsonCode）必须支持的需求基线。
来源标注采用 `[文件名]` 形式，便于回溯。

纯解析测试（`tests/integration/parser/`）不在此清单内——它们只验证 parser
不验证执行，新编译器无需关心。

---

## 0. 总体约束

- **黑盒集成测试**：输入 Pascal 源码，校验执行结果（output / error / files 内容）。
  不直接断言 JsonCode 结构。
- **复用现有用例**：不修改任何 `*.test.ts`，只改 `_helper.ts` 切换执行管线。
- **运行时选项兼容**：必须保留 `input` / `files` / `programFileUrls` /
  `sysCalls` / `extensions` / `maxSteps` 全部 6 个选项的语义。
- **Pascal82 子集**：默认 ISO 7185 语义；`extensions=['string']` 启用字符串类型。

---

## 1. 词法与字面量

### 1.1 字面量
- 整数字面量：零值、负数、大整数、20 位超大数、十六进制 `$1A2B`、前导零 `[p01-basics][p10-conformance][p01-parser-boundary]`
- 实数字面量：`3.14`、`1e10` 等浮点形式 `[p01-basics]`
- 字符串字面量：空串、单字符、长字符串、转义引号（双写单引号 `''`）、特殊字符 `[p01-io][p10-conformance]`
- 字符字面量：`'a'` 单字符 `[p01-basics]`
- 布尔字面量：`true` / `false` `[p01-basics]`

### 1.2 标识符
- 单字母、长标识符（128 字符）、大小写不敏感、数字结尾 `[p10-conformance][p00-parser-fuzz]`

### 1.3 注释
- 花括号 `{ ... }`、星号括号 `(* ... *)`、空注释、多行注释 `[p10-conformance]`

---

## 2. 类型系统

### 2.1 简单类型
- `integer`（32 位有符号，含溢出：`2147483647 + 1 → -2147483648`）`[p01-basics]`
- `real`（科学计数法输出 `5.00000000000000E+000`）`[p01-basics]`
- `boolean` `[p01-basics]`
- `char` `[p01-basics]`
- 非标扩展 `string` 类型（仅 `extensions=['string']` 时启用；否则 `var s: string` 报错）`[p01-basics][p10-conformance][p15-nonstandard]`

### 2.2 子界类型 `[p03-range]`
- 整数子界、字符子界、布尔子界、负数边界 `-10..10`
- 单值子界 `5..5`、`0..255` BYTE 范围
- 边界为常量表达式：`1..n*2`、`1+2..5*2`
- 边界为 const 标识符
- **边界检查**：赋值越界（上/下）、算术结果越界（`8+5=13 > 10` 报错）
- **下界 > 上界报错**（Pascal82 §6.4.3.2）
- **默认值为下界**
- 子界 → integer 隐式拓宽；integer → 子界（范围内成功，范围外报错）
- 不同子界互赋（值在目标范围内才成功）
- 子界作数组下标、FOR 变量、记录字段、函数返回类型、值参/var 参
- 局部 const 与全局 const 同名不影响全局子界边界

### 2.3 枚举类型 `[p01-basics][p04-parameters][p10-conformance][p13-pascal82-conformance]`
- 声明、作数组下标（`ARRAY[COLOR]`）、作 CASE 分支标签、作函数参数
- `ord` 取枚举序号

### 2.4 数组类型 `[p03-array-record][p13-pascal82-conformance]`
- 一维 / 多维（`array[1..2, 1..2]`）、嵌套数组（`array[1..2] of array[1..2] of Point`）
- `ARRAY[CHAR]`（覆盖 0..255）、`ARRAY[BOOLEAN]`（0..1）、`ARRAY[ENUM]`
- 数组元素为记录（`array of records`）
- **边界检查**：越界访问报错
- 数组作值参（拷贝）、var 参（修改原数组）
- 数组整体赋值（`mem.copy` 语义）
- 多维下标访问 `a[i, j]` 与 `a[i][j]` 等价

### 2.5 记录类型 `[p03-array-record][p11-knuth-pascal]`
- 字段访问 / 赋值、嵌套记录（`c.center.x`）
- 记录字段为数组
- 记录作值参 / var 参
- 记录整体赋值
- WITH 语句字段简写

### 2.6 变体记录 `[p03-variant-record]`
- **解析支持即可**（测试只调 `parse()` 不执行）
- 带 tag 名 `CASE K: SHAPE OF`
- 无 tag 名 `CASE NODETYPE OF`
- 嵌套变体记录（CASE 内嵌 CASE）

### 2.7 文件类型 `[p03-file][p11-knuth-pascal]`
- `FILE OF CHAR`、`PACKED FILE OF CHAR`（等价于 text）
- 多个 text 文件变量
- `PROGRAM COPYFILE(INFILE, OUTFILE)` 头声明文件参数 → 需 `programFileUrls`

### 2.8 集合类型 `[p01-basics]`
- `set of` 声明
- 集合构造器：单元素 `[1, 2, 3]`、范围 `[1..5]`、混合 `[1, 3..5, 10]`、空集 `[]`
- 并集 `+`、交集 `*`、差集 `-`、成员运算 `IN`
- 集合赋值、集合比较

---

## 3. 运算符

### 3.1 算术 `[p01-basics]`
- `+ - * / div mod`
- `/` 总是实数除（结果为 real）
- `div` 整数除、`mod` 取模
- 一元负号 `-x`、一元正号 `+x`（无操作）
- 优先级：`* / div mod` > `+ -`，括号改变优先级
- **除零 / MOD 零报错**
- **32 位整数溢出**

### 3.2 关系 `[p01-basics]`
- `= <> < > <= >=`
- 优先级低于算术

### 3.3 逻辑 `[p01-basics]`
- `AND OR NOT`（布尔）
- `AND` / `OR` 在 integer 上为**位运算**（`12 AND 10 = 8`）
- `NOT` 优先级高于 `AND` 高于 `OR`
- **短路求值**：AND 第一假不执行第二；OR 第一真不执行第二（用于避免 div 0）

### 3.4 集合运算 `[p01-basics]`
- 并集 `+`、交集 `*`（优先级高于 `+`）、差集 `-`、`IN`

---

## 4. 控制流

### 4.1 IF `[p01-control-flow]`
- `IF-THEN`、`IF-THEN-ELSE`、嵌套 IF、`ELSEIF` 链（嵌套模拟）
- 条件为表达式（含算术/关系/逻辑混合）

### 4.2 WHILE `[p01-control-flow]`
- 初始 false 不执行、多迭代、嵌套、布尔 flag 控制
- WHILE 中用 GOTO 实现 break

### 4.3 FOR `[p01-control-flow]`
- `FOR-TO` / `FOR-DOWNTO`
- 负数范围 `-2 downto -5`
- 起始 > 结束时零次迭代
- 循环后变量值、嵌套
- 子界作循环变量

### 4.4 REPEAT-UNTIL `[p01-control-flow]`
- 至少执行一次（条件一开始就满足也执行）
- 多迭代、嵌套

### 4.5 CASE `[p01-control-flow][p11-knuth-pascal]`
- 单值分支、多值分支（`1, 3, 5:`）
- `OTHERWISE` 默认分支（ISO）
- `OTHERS:` 默认分支（UCSD/Knuth 风格）
- 无匹配：无 OTHERWISE 时无操作
- 嵌套 CASE、CASE 在循环/过程中

### 4.6 WITH `[p01-control-flow][p03-array-record]`
- 单记录、多记录（`with p1, p2 do`）
- 嵌套 WITH（访问嵌套记录字段）
- WITH 内调用过程、修改字段
- **字段名与外层变量同名时字段优先**

### 4.7 GOTO 与标号 `[p04-goto][p04-goto-advanced][p04-goto-critical][p04-goto-fix][p04-goto-label-in-block][p04-goto-scope-repro]`

#### 4.7.1 基础
- 标号声明 `LABEL N;`、单个/多个、最大值 9999、值 0 合法、值 10000 报错
- 标号与变量同名
- 前向 / 后向 goto、跳过多语句
- 后向 goto 创建循环（需 `maxSteps` 防死循环）

#### 4.7.2 跨控制结构
- **跳出** IF / WHILE / FOR / REPEAT / CASE / 嵌套循环
- **跳入** WHILE / FOR / IF / REPEAT 体内部 label → **编译报错**（标准 Pascal 不允许）
- 透明块（compound / with / case 分支）内的 label 可被同块 goto
- 深层嵌套透明块中的 label（递归 flatten）

#### 4.7.3 跨过程 goto（ISO 7185 6.8.1, 6.8.2.4）
- 过程 → 主程序 label：**允许**（终止中间激活）
- 函数 → 主程序 label：**允许**
- 内层过程 → 外层过程 label：**允许**
- 过程 → 另一过程 label：**禁止**
- 主程序 → 过程 label：**禁止**
- 外层 → 内层过程 label：**禁止**
- 嵌套两层过程 goto 到主程序，中间激活都被终止

#### 4.7.4 标号作用域
- 过程内 label、主程序内 label
- 不同作用域中相同 label 编号（互不冲突）
- 内层 label 遮蔽外层同名 label（ISO 6.2.2.5）
- 标号声明未使用：允许
- 使用未声明标号：报错

#### 4.7.5 递归与 goto
- 递归过程 / 递归函数中 goto
- 跨过程递归 goto：禁止
- 相互递归 goto：禁止
- 深层嵌套 goto：禁止

#### 4.7.6 特殊场景
- `goto-triple-nested-mixed-blocks`：for→while→if→repeat 四层嵌套跨层 goto
- tangle DEBUGHELP 结构：while true + if-else + 同 compound 内 goto+label
- 循环体末尾 label（continue 优化场景）

### 4.8 空语句 `[p01-control-flow]`
- 连续分号 `;;`、`begin end` 空体

---

## 5. 过程与函数

### 5.1 声明与调用 `[p01-procedures][p04-parameters]`
- 无参 / 单参 / 多参 / 同类型多参 / 不同类型参数
- 参数顺序、参数名与全局/局部变量同名（应报错）

### 5.2 参数传递 `[p04-parameters]`
- 值参：不修改原变量、传表达式、传函数调用结果、传数组元素、传记录字段、传负数/零/最大整数
- var 参：修改原变量、必须为变量（传常量报错）、多 var 参（Swap）、值/var 混合
- 嵌套过程中 var 参、递归过程中 var 参
- 数组 / 记录作值参（拷贝）和 var 参（修改原对象）
- 类型组合：integer / char / boolean / 子界 / 枚举 / 数组 / 记录

### 5.3 函数返回值 `[p01-procedures][p04-parameters]`
- 函数名作返回值变量赋值
- 返回值在表达式中使用
- 嵌套函数返回、递归函数返回
- 函数返回数组类型

### 5.4 嵌套过程 / 函数 `[p01-procedures][p04-scope][p10-conformance]`
- 一层 / 两层 / 三层嵌套
- 嵌套过程访问外层变量
- 嵌套函数调用嵌套函数
- 同级过程互调
- 过程中定义函数、函数中定义过程

### 5.5 递归 `[p01-procedures][p04-parser-recursion][p10-conformance]`
- 直接递归过程 / 函数（阶乘、斐波那契、Ackermann）
- 相互递归（需 FORWARD）
- 三过程链式递归
- 深层五过程链递归
- 嵌套递归（递归过程内定义嵌套过程）

### 5.6 FORWARD 声明 `[p10-conformance][p04-parser-procedure]`
- 过程 / 函数 FORWARD
- FORWARD 后再定义实现体
- FORWARD 实现相互递归
- 多个 FORWARD

---

## 6. 作用域 `[p04-scope]`

- 全局变量：主程序 / 过程 / 嵌套过程 / 函数中可见
- 局部变量：遮蔽全局、内层遮蔽外层、兄弟过程独立、局部不可外用
- 参数遮蔽全局 / 局部
- 函数名作返回值变量
- 嵌套函数访问外层参数
- 常量：全局 / 局部 / 局部遮蔽全局 / 嵌套过程可见
- 类型：全局 / 局部类型，记录字段跨作用域访问
- 局部变量间接修改全局

---

## 7. 内置函数与过程

### 7.1 数学函数 `[p01-basics][p01-io]`
- `abs`（integer / real）
- `sqr`（integer / real）
- `sqrt` / `sin` / `cos` / `exp` / `ln` / `arctan`（返回 real）
- `trunc` / `round`（real → integer）

### 7.2 顺序函数 `[p01-io]`
- `ord`（char/枚举 → integer）
- `chr`（integer → char）
- `pred` / `succ`（integer / char / 枚举）

### 7.3 布尔函数 `[p01-io]`
- `odd`（integer → boolean）

### 7.4 字符串函数 `[p01-basics]`
- `length`（仅 extensions=['string'] 时）
- 字符串 `+` 拼接（非标扩展）

---

## 8. IO

### 8.1 标准输出 `[p01-io]`
- `writeln`：无参、integer、string、多参数、负数、real、boolean
- `write`：同上但不换行
- **多参数连续输出无分隔符**（Pascal82 行为）
- 格式化：`writeln(x:width)`、`writeln(x:width:precision)`
  - real 宽度/精度
  - integer 宽度
  - char 宽度
  - boolean 输出（`TRUE` / `FALSE` 或 `true` / `false`？以现有用例 expectedOutput 为准）

### 8.2 标准输入 `[p01-io]`
- `readln`：integer、多值、空输入默认 0、多行、混合类型（integer + real）
- `read`：integer
- `while not eof do readln` 读到输入结束
- `eoln` 行末检测

---

## 9. 文件操作 `[p03-file][p11-knuth-pascal]`

### 9.1 文件写入
- `ASSIGN(f, 'name')` 绑定内存文件名
- `REWRITE(f)` 打开写
- `WRITELN(f, ...)` / `WRITE(f, ...)` 写入
- `CLOSE(f)` 关闭
- 文件内容可通过 `expectedFileContains` 校验

### 9.2 文件读取
- `RESET(f)` 打开读
- `EOF(f)` 空文件 / 非空文件
- `EOLN(f)` 行尾检测
- `F^` 缓冲区访问（读首字符）
- `GET(f)` 推进 offset
- `READ(f, n)` 从文件读整数（含多整数）
- `READ(f, c)` 读 char **不跳过空格**（ISO 7185 §14.4.4，ISSUE-034）
- `READLN(f)` 跳行
- `WHILE NOT EOLN(F) DO` 逐字符循环（Knuth INPUTLN 风格）

### 9.3 文件复制
- `PROGRAM COPYFILE(INFILE, OUTFILE)` 头声明文件参数
- 通过 `programFileUrls` 映射到内存文件

### 9.4 Knuth 扩展 `[p11-knuth-pascal]`
- `BREAK` 过程（刷新输出缓冲区，带/不带参数，简化为 no-op 也可）
- `PAGE` 过程（输出换页符 `\f`，带/不带文件参数）
- `PUT`（简化为 no-op）

---

## 10. 错误处理

### 10.1 运行时错误
- 除零、MOD 零
- 数组越界
- 子界越界（赋值 / 算术结果）
- `new` / `dispose` 未实现须友好报错
- `ord` 无括号报错
- var 参传常量报错
- 局部变量外部访问报错
- 标号值超 0..9999 报错
- 标号跳入非透明块报错
- 跨过程 goto 到禁止目标报错

### 10.2 死循环防护
- `maxSteps` 选项（默认 1e5，可覆盖）
- 后向 goto 死循环
- 互相 goto 死循环
- 前向 goto 跳过无限 while 安全退出

---

## 11. 非标扩展与合规性

### 11.1 `extensions=['string']` `[p01-basics][p10-conformance]`
- 启用 `string` 类型
- 字符串 `+` 拼接
- `length` 函数

### 11.2 默认合规性 `[p15-nonstandard]`
- 不启用 `string` 扩展时，`var s: string` **必须报错**
- 解释器默认不应支持非标特性

---

## 12. 测试用例分布速查

| 文件 | 用例数 | 关键特性 |
|------|-------|---------|
| p01-basics | 多 | 算术/关系/逻辑/集合/类型转换/内置函数/字符串扩展 |
| p01-control-flow | 多 | IF/WHILE/FOR/REPEAT/CASE/WITH/递归 |
| p01-io | 多 | writeln/write/readln/read/格式化/文件 IO/内置函数 |
| p01-procedures | 6 | 过程/函数/参数/递归 |
| p03-array-record | 多 | 数组/记录/WITH/组合 |
| p03-file | 多 | FILE OF CHAR/ASSIGN/RESET/REWRITE/F^/GET/EOLN |
| p03-range | 多 | 子界/边界检查/类型兼容 |
| p03-variant-record | 3 | 变体记录（仅解析） |
| p04-goto-advanced | 多 | 嵌套 goto/防死循环 |
| p04-goto-critical | 多 | 跨过程 goto/标号作用域/标号值范围 |
| p04-goto-fix | 5 | 嵌套循环 goto 跳出 |
| p04-goto-label-in-block | 4 | 跳入非透明块报错 |
| p04-goto-scope-repro | 3 | tangle DEBUGHELP 复现 |
| p04-goto | 多 | 基础 goto/跨结构/递归/透明块 |
| p04-parameters | 多 | 值参/var 参/类型组合/边界 |
| p04-scope | 多 | 全局/局部/参数/函数/常量/类型作用域 |
| p10-conformance | 多 | 解析边界/运算符/作用域/过程/递归/类型/控制流 |
| p11-knuth-pascal | 多 | Knuth 风格/FILE/OTHERS/BREAK/PAGE/F^ |
| p13-pascal82-conformance | 多 | ARRAY[CHAR/BOOLEAN/ENUM] |
| p15-nonstandard | 1 | string 类型拒绝 |
