/*
 * JsonCode — 通用中间表示（IR）
 *
 * ============================================================
 * 0. 设计原则
 * ============================================================
 *
 * JsonCode 是纯 IR：
 *   - 不绑定任何上游源语言（如 Pascal、BASIC …）
 *   - 不绑定任何下游目标语言（如 JavaScript、字节码、WASM …）
 *   - 本文件注释只描述 JsonCode 自身语义，不引用外部语言概念。
 *
 * 定位：
 *     源语言 AST  ── lowering ──▶  JsonCode  ── codegen ──▶  目标代码
 *
 * JsonCode 本身 = 一组函数定义 + 每个函数里的低级语句序列 + 表达式。
 * 所有"高级语义"（结构化控制流、数组/记录访问、类型系统、运算符）
 * 一律 lowering 为：label / jump / jumpIf / longJump + assign / eval / return
 *                   + ref / literal / call / syscall
 *
 * ============================================================
 * 1. ID 约定（全局唯一）
 * ============================================================
 *
 * 同一次 lowering 产生的 JsonCode 图中，**所有 ID 全局唯一**。
 * 即：VarId、LabelId、Function.id 共用一个计数器空间。
 * 任何 ID 自解释，不需要"在哪个 function 里"的上下文。
 *
 *   - VarId   : 变量 / 函数本体 / 形参 / 编译期临时量，共用此空间。
 *   - LabelId : 跳转着陆点，共用此空间。
 *   - Function.id : 函数本体的 VarId（供 Call.functionId 引用）。
 *
 * 约定 ID > 0；0 保留给"初始 / 未引用"。
 *
 * ============================================================
 * 2. 作用域与可见性
 * ============================================================
 *
 * Function 构成嵌套作用域树：
 *
 *     Function_0 （顶层，无 parent）
 *      ├─ params  : [ ... ]
 *      ├─ locals  : [ ... ]
 *      └─ children: [ Function_1, Function_2, ... ]
 *                     ├─ params  : [ ... ]
 *                     ├─ locals  : [ ... ]
 *                     └─ children: [ ... ]
 *
 * 作用域规则：
 *   - 一个 Function.body / children.params / children.locals 里的 Ref.varId
 *     可以引用：
 *       a) 该 Function 自己的 params 或 locals；
 *       b) 任一祖先 Function（沿 children 链向上直到顶层）的 params 或 locals；
 *       c) 任一祖先 Function 的 children 中某个 Function.id（即子函数作为值
 *          被外层持有，因此内层可通过 Call 调用兄弟 / 侄子函数）。
 *   - 不能引用平级 Function 的 params / locals（即兄弟函数之间不能互相
 *     看对方的栈变量）。
 *   - 不能引用后代 Function 的 params / locals（即外层看不了内层）。
 *
 * 这与"闭包"语义等价，但后端可以用任意机制实现，JsonCode 只声明语义。
 */

export namespace JsonCode {
  // ------------------------------------------------------------
  // ID 类型
  // ------------------------------------------------------------

  /** 变量 / 形参 / 函数本体 id。全局唯一。 */
  type VarId = number
  /** 跳转标签 id。全局唯一。 */
  type LabelId = number

  // ------------------------------------------------------------
  // Function
  // ------------------------------------------------------------

  /**
   * 一个可调用单元。
   *
   * 嵌套在 children 里的 Function 即"内层函数"，享有对父作用域的访问权
   * （见 §2 作用域规则）。
   *
   * - id       : 本函数本体的 VarId（必须全局唯一；供 Call 引用）。
   * - params   : 形参 VarId 列表（调用时按序传入）。
   * - locals   : 本函数声明的局部变量 VarId（不含 params）。
   * - children : 嵌套定义的子函数。
   * - body     : 函数体语句序列（低级控制流 + 数据操作）。
   *
   * 函数结束的唯一方式是执行 Return；运行到 body 末尾而无 Return 是未定义。
   * "过程"与"函数"的区别仅在 Return 是否带 value，JsonCode 不区分。
   */
  export interface Function {
    id: VarId
    params: VarId[]
    locals: VarId[]
    children: Function[]
    body: Statement[]
  }

  // ------------------------------------------------------------
  // Statement
  // ------------------------------------------------------------

  /**
   * 语句联合。
   *
   * 控制流类：Label / Jmp / JumpIf / LongJump
   * 数据类  ：Assign / Eval
   * 退出类  ：Return
   */
  export type Statement = Label | Jmp | JumpIf | LongJump | Assign | Return | Eval

  /**
   * 标签声明：作为跳转的着陆点。
   *
   * labelId 全局唯一；同一 Function.body 内不应重复。
   * 无跳转体时 Label 不产生运行时效果。
   */
  export interface Label {
    kind: 'label'
    labelId: LabelId
  }

  /**
   * 函数内无条件跳转。
   *
   * 运行时行为：将控制流转到所属 Function 内 labelId 对应的 Label。
   * labelId 必须属于同一 Function（跨函数请用 LongJump）。
   */
  export interface Jmp {
    kind: 'jump'
    labelId: LabelId
  }

  /**
   * 条件二选一跳转。
   *
   * 运行时：
   *   1. 计算 condition。
   *   2. condition 为真 → 着陆到 thenLabel。
   *      condition 为假 → 着陆到 elseLabel。
   *
   * thenLabel / elseLabel 都必须属于同一 Function。
   * 注意：不存在"fall-through"或"下一条语句继续"。JumpIf 之后必然去某个 label。
   */
  export interface JumpIf {
    kind: 'jumpIf'
    condition: Expr
    then: LabelId
    else: LabelId
  }

  /**
   * 跨函数跳转（非局部退出 / goto 外层作用域标签）。
   *
   * 运行时：
   *   1. 立即退出当前 Function 及沿途所有调用帧，直到调用栈里出现
   *      指定 functionId 的那一帧。
   *   2. 在该帧内跳转到 labelId。
   *
   * 若 functionId 不在调用栈上（已返回 / 尚未调用），行为未定义。
   *
   * - labelId    : 目标 Function 内的标签。
   * - functionId : 目标 Function 的 VarId。
   */
  export interface LongJump {
    kind: 'longJump'
    labelId: LabelId
    functionId: VarId
  }

  /**
   * 赋值：把 value 写入 target 标识的变量。
   *
   * target 仅接受 Ref（简单变量引用）。任何"更复杂的写入目标"
   * （数组元素、记录字段、复合整体复制 …）必须通过 Syscall + Eval
   * 表达，不走 Assign。
   */
  export interface Assign {
    kind: 'assign'
    target: Ref
    value: Expr
  }

  /**
   * 从当前函数返回。
   *
   * - 有 value：作为返回值交给调用者。
   * - 无 value：调用者得到的值未定义。
   */
  export interface Return {
    kind: 'return'
    value?: Expr
  }

  /**
   * 求值一个表达式并丢弃其值。
   *
   * 用途：
   *   - 仅为副作用的 Call / Syscall（过程调用、IO 写入等）。
   *   - 任何"写入类"Syscall（数组元素赋值、记录字段赋值、复合类型复制 …）。
   */
  export interface Eval {
    kind: 'eval'
    expr: Expr
  }

  // ------------------------------------------------------------
  // Expr
  // ------------------------------------------------------------

  /**
   * 表达式联合。
   *
   * - Ref     : 读取一个变量的值。
   * - Literal : 编译期字面量常量。
   * - Call    : 调用用户定义的 Function。
   * - Syscall : 调用运行时提供的原语能力。
   *
   * JsonCode 不表达任何"高级运算符"或"内置函数"——加减法、比较、数组下标、
   * 记录字段访问一律走 Syscall。
   */
  export type Expr = Ref | Literal | Call | Syscall

  /**
   * 变量引用：读取一个变量的值。
   *
   * varId 必须能在当前作用域链（见 §2）中解析到。
   * 作为 Assign.target 使用时表示写入该变量。
   */
  export interface Ref {
    kind: 'ref'
    varId: VarId
  }

  /**
   * 编译期字面量：常量。
   *
   * 用字符串存储而非直接存 JS 值，是为了：
   *   - JsonCode 可序列化。
   *   - 不绑定到具体宿主语言的数值精度 / 字符串编码。
   *
   * key  分类；arg 具体内容。下游 codegen 负责按 key 解释 arg。
   *
   * 推荐但非强制的 key 集合：
   *   - 'i64'     : arg = 十进制整数字符串（有符号）。
   *   - 'f64'     : arg = 浮点数字符串。
   *   - 'str'     : arg = 字符串内容（不含边界引号，已还原转义）。
   *   - 'char'    : arg = 单个字符（已还原转义）。
   *   - 'bool'    : arg = 'true' 或 'false'。
   *   - 'unit'    : arg = ''。表示"无值"占位。
   */
  export interface Literal {
    kind: 'literal'
    key: string
    arg: string
  }

  /**
   * 调用用户定义的 Function。
   *
   * - functionId : 被调用函数的 VarId。
   * - args       : 按序对应目标 Function.params 的实参表达式。
   *
   * args 数量与 params 数量不一致是未定义。
   * 作为 Eval.expr 时，返回值被丢弃（对应"过程调用"）。
   */
  export interface Call {
    kind: 'call'
    functionId: VarId
    args: Expr[]
  }

  /**
   * 系统调用：运行时原语。
   *
   * 所有 JsonCode 自身不表达的语义都走 Syscall。典型类别：
   *
   *   算术与位      : i64.add / i64.sub / i64.mul / i64.div / i64.mod / i64.neg
   *                   f64.add / f64.sub / f64.mul / f64.div / f64.neg
   *   布尔          : bool.and / bool.or / bool.not
   *   比较          : cmp.eq / cmp.ne / cmp.lt / cmp.le / cmp.gt / cmp.ge
   *   数组          : array.get / array.set / array.len
   *   记录/结构体   : rec.field / rec.set
   *   集合          : set.in / set.union / set.diff / set.isect
   *   字符串        : str.cat / str.len
   *   类型转换      : cast.i64->f64 / cast.char->i64 / cast.i64->char …
   *   复合类型复制  : mem.copy           （数组/记录整体赋值）
   *   IO            : io.write / io.writeln / io.read / io.readln
   *   文件          : file.open / file.close / file.eof …
   *   堆            : mem.alloc / mem.free …
   *
   * key 用点分命名空间分层。命名空间只用于组织，JsonCode 不对 key 做解析；
   * key 是否存在、签名如何完全由运行时 / codegen 决定。
   *
   * args 是传给原语的实参表达式列表。
   */
  export interface Syscall {
    kind: 'syscall'
    key: string
    args: Expr[]
  }
}
