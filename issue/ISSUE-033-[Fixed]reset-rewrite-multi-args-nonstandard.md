# ISSUE-033: RESET/REWRITE 多参数形式未支持（非标扩展）

**状态**: Fixed
**严重程度**: High
**分类**: 非标扩展（插件实现）
**发现时间**: 2026-07-18
**影响范围**: VM / io.plugin.ts

## 问题描述

TEX82 使用 Pascal 扩展语法 `RESET(F, name, mode)` 和 `REWRITE(F, name, mode)`，
当前 VM 的 resetHandler / rewriteHandler 只处理第一个参数（文件变量），
忽略第二、第三参数（文件名、打开模式）。

导致 TEX82 无法通过文件名关联到 Map 中的文件内容。

## Pascal82 标准依据

标准 Pascal（ISO 7185）中 RESET/REWRITE 只接受一个参数：
```
RESET(f)    -- 将文件 f 定位到开头
REWRITE(f)  -- 将文件 f 清空准备写入
```

带文件名的 `RESET(f, name)` / `REWRITE(f, name)` 是 **非标扩展**，
常见于 Berkeley Pascal、DEC Pascal 等实际实现。
等价于 `ASSIGN(f, name); RESET(f)`。

## 复现场景

TEX82 主程序：
```pascal
REWRITE(TERMOUT, 'TTY:', '/O');          { 打开终端输出 }
...
RESET(TERMIN, 'TTY:', '/O/I');           { 打开终端输入 }
```

TEX82 的 AOPENIN/AOPENOUT 也用此形式：
```pascal
FUNCTION AOPENIN(VAR F:ALPHAFILE):BOOLEAN;
BEGIN RESET(F, NAMEOFFILE, '/O'); AOPENIN:=ERSTAT(F)=0; END;
```

## 修复方案（待实施）

**分类：非标扩展，用插件实现。**

不应修改核心 io.plugin.ts 的 resetHandler/rewriteHandler（那会影响标准行为）。
应创建一个独立的插件（如 `extendedFilePlugin`），覆盖 RESET/REWRITE 的多参数形式：
1. 检测参数数量 >= 2
2. 从第二参数提取文件名（可能是 string 或 packed array of char）
3. 调用 `io.file.assign(file, name)` 关联文件名
4. 再调用 `io.file.reset(file)` / `io.file.rewrite(file)`

第三参数（mode 如 '/O', '/O/I'）在内存文件模型中可忽略。

## 备注

- 之前误改了核心 io.plugin.ts，已回滚
- 与 ISSUE-034（READ char 行为）是独立问题
