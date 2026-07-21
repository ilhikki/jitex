const { compileToJS } = require('./src/index');

const code = `program test;
label 100;
var i,j:integer;
begin
  for i:=1 to 3 do
    begin
      for j:=1 to 3 do
        begin
          writeln('i=',i,' j=',j);
          if (i=2) and (j=2) then goto 100;
        end;
      writeln('completed');
    end;
100:
  writeln('label 100');
end.`;

const js = compileToJS(code);
console.log('===== Generated JS =====');
console.log(js);
console.log('===== End =====');
