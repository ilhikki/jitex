# Pascal 语法产生式

> 每个产生式对应一个纯函数解析器，输入 `{tokens, position}`，返回 `ParseResult`。
> AST 节点是 record（鸭子类型），通过 `kind` 字段区分类型。

## 1. Program

```
program → PROGRAM identifier [ ( identifier_list ) ] ; block .
```
- Parser: `parseProgram` in `src/parser/declarations.ts`
- Node: `ProgramNode`

## 2. Block

```
block → [ label_declarations ] [ const_declarations ] [ type_declarations ]
         [ variable_declarations ] { procedure_declaration | function_declaration }
         compound_statement
```
- Parser: `parseBlock`
- Node: `BlockNode`

## 3. Label Declarations

```
label_declarations → LABEL label { , label } ;
label → integer
```
- Parser: `parseLabelDeclaration`
- Node: `LabelDeclarationNode`

## 4. Const Declarations

```
const_declarations → CONST { identifier = expression ; }
```
- Parser: `parseConstDeclarations`
- Node: `ConstDeclarationNode[]`

## 5. Type Declarations

```
type_declarations → TYPE { identifier = type ; }
```
- Parser: `parseTypeDeclarations`
- Node: `TypeDeclarationNode[]`

## 6. Variable Declarations

```
variable_declarations → VAR { identifier_list : type ; }
```
- Parser: `parseVariableDeclarations`
- Node: `VariableDeclarationNode[]`

## 7. Type Definitions

```
type → simple_type | range_type | array_type | record_type | file_type | set_type | enumeration_type

simple_type → identifier
range_type → expression .. expression
array_type → [ PACKED ] ARRAY [ type { , type } ] OF type
record_type → RECORD { variable_declaration ; } END
file_type → [ PACKED ] FILE [ OF type ]
set_type → SET OF type
enumeration_type → ( identifier { , identifier } )
```
- Parser: `parseType`, `parseVariableDeclaration` in `src/parser/types.ts`
- Nodes: `SimpleTypeNode`, `RangeTypeNode`, `ArrayTypeNode`, `RecordTypeNode`, `FileTypeNode`, `SetTypeNode`, `EnumerationTypeNode`

## 8. Procedure Declarations

```
procedure_declaration → PROCEDURE identifier [ ( parameter_list ) ] ;
                         ( block ; | FORWARD ; )
```
- Parser: `parseProcedureDeclaration`
- Node: `ProcedureDeclarationNode`

## 9. Function Declarations

```
function_declaration → FUNCTION identifier [ ( parameter_list ) ] : type ;
                       ( block ; | FORWARD ; )
```
- Parser: `parseFunctionDeclaration`
- Node: `FunctionDeclarationNode`

## 10. Parameter List

```
parameter_list → ( parameter_group { ; parameter_group } )
parameter_group → [ VAR ] identifier_list : type
```
- Parser: `parseParameterList`
- Node: `ParameterDeclarationNode[]`

## 11. Statements

```
statement → compound_statement
          | assignment_or_call
          | if_statement
          | while_statement
          | repeat_statement
          | for_statement
          | case_statement
          | goto_statement
          | with_statement
          | write_statement
          | empty_statement
```
- Parser: `parseStatement` in `src/parser/statements.ts`

## 12. Compound Statement

```
compound_statement → BEGIN [ statement { ; statement } ] END
```
- Parser: `parseCompoundStatement`
- Node: `CompoundStatementNode`

## 13. Assignment / Procedure Call

```
assignment → variable := expression
procedure_call → identifier [ ( expression_list ) ]
```
- Parser: `parseAssignmentOrCall`
- Nodes: `AssignmentNode`, `ProcedureCallNode`

## 14. If Statement

```
if_statement → IF expression THEN statement [ ELSE statement ]
```
- Parser: `parseIfStatement`
- Node: `IfStatementNode`

## 15. While Statement

```
while_statement → WHILE expression DO statement
```
- Parser: `parseWhileStatement`
- Node: `WhileStatementNode`

## 16. Repeat Statement

```
repeat_statement → REPEAT [ statement { ; statement } ] UNTIL expression
```
- Parser: `parseRepeatStatement`
- Node: `RepeatStatementNode`

## 17. For Statement

```
for_statement → FOR identifier := expression ( TO | DOWNTO ) expression DO statement
```
- Parser: `parseForStatement`
- Node: `ForStatementNode`

## 18. Goto Statement

```
goto_statement → GOTO integer
```
- Parser: `parseGotoStatement`
- Node: `GotoStatementNode`

## 19. With Statement

```
with_statement → WITH expression { , expression } DO statement
```
- Parser: `parseWithStatement`
- Node: `WithStatementNode`

## 20. Write Statement

```
write_statement → ( WRITE | WRITELN ) [ ( [ file , ] write_args ) ]
write_args → write_arg { , write_arg }
write_arg → expression [ : expression [ : expression ] ]
```
- Parser: `parseWriteCall`
- Node: `ProcedureCallNode` (with format specifiers as BinaryExpression nodes using `:` operator)

## 21. Expressions

```
expression → simple_expression [ ( = | <> | < | <= | > | >= | IN ) simple_expression ]

simple_expression → [ + | - ] term { ( + | - | OR ) term }

term → factor { ( * | / | DIV | MOD | AND ) factor }

factor → identifier | integer | real | string | char | #integer
       | ( expression )
       | NOT factor | + factor | - factor
       | function_call | array_access | field_access

postfix → identifier { ( args ) | [ indices ] | . field }
```
- Parser: `parseExpression`, `parseSimpleExpression`, `parseTerm`, `parseFactor`, `parsePrimary`, `parsePostfix` in `src/parser/expressions.ts`

## 22. Function Call

```
function_call → identifier ( [ expression_list ] )
```
- Node: `FunctionCallNode`

## 23. Array Access

```
array_access → expression [ expression { , expression } ]
```
- Node: `ArrayAccessNode`

## 24. Field Access

```
field_access → expression . identifier
```
- Node: `FieldAccessNode`

## 25. Literals

```
integer → digit_sequence
real → digit_sequence . digit_sequence [ E [ + | - ] digit_sequence ]
hex → $ hex_digit_sequence
string → ' character_sequence '
char → ' character ' | # integer | $ hex_digit_sequence
identifier → letter { letter | digit | _ }
```

## Architecture Notes

- Lexer: `src/lexer/lexer.ts` — pure function `lex(source) => Token[]`
- Parser: pure functions `{tokens, position} => ParseResult`
- AST: plain records with `kind` field (duck typing, no classes)
- Token: `{ type, content, start: Position, end: Position }`
- Position: `{ line, column, offset }`
- ParseResult: `{ success, newPosition, astNode } | { success, error, position }`
