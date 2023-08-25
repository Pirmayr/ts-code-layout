call tsc --build
call npx ts-code-layout -w
copy README.template.md README.md
call npx rexreplace "$(OPTIONS)" "require('fs').readFileSync('./options.txt', 'utf-8').replaceAll('\r', '')" -j -L README.md
call npx rexreplace "$(EXAMPLE_CONFIGURATION)" "'  ' + require('fs').readFileSync('./ts-code-layout.json', 'utf-8').replaceAll('\r', '').replaceAll('\n', '\n  ')" -j -L README.md
call npx rexreplace "$(HELP)" "require('fs').readFileSync('./README.md', 'utf-8').replaceAll('\r', '').replaceAll('# ', '').replaceAll('~~~\n', '').replaceAll('\n', '\\n')" -j -L main.js
