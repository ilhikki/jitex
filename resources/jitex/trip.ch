@x
@d stat==@{ {change this to `$\\{stat}\equiv\null$' when gathering
  usage statistics}
@d tats==@t@>@} {change this to `$\\{tats}\equiv\null$' when gathering
  usage statistics}
@y
@d stat==@t@>
@d tats==@t@>
@z

@x
@d init== {change this to `$\\{init}\equiv\.{@@\{}$' in the production version}
@d tini== {change this to `$\\{tini}\equiv\.{@@\}}$' in the production version}
@y
@d init==
@d tini==
@z

@x
@!mem_max=30000; {greatest index in \TeX's internal |mem| array;
@y
@!mem_max=3000; {greatest index in \TeX's internal |mem| array;
@z

@x
@!mem_min=0; {smallest index in \TeX's internal |mem| array;
@y
@!mem_min=1; {smallest index in \TeX's internal |mem| array;
@z

@x
@!error_line=72; {width of context lines on terminal error messages}
@y
@!error_line=64; {width of context lines on terminal error messages}
@z

@x
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@y
@!half_error_line=32; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@z

@x
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@y
@!max_print_line=72; {width of longest text lines output; should be at least 60}
@z

@x
@d mem_bot=0 {smallest index in the |mem| array dumped by \.{INITEX};
@y
@d mem_bot=1 {smallest index in the |mem| array dumped by \.{INITEX};
@z

@x
@d mem_top==30000 {largest index in the |mem| array dumped by \.{INITEX};
@y
@d mem_top==3000 {largest index in the |mem| array dumped by \.{INITEX};
@z
