# Overview

Arranges the top-level elements of typescripts source code.

#Command Line

```
npx ts-code-layout input-directory output-directory filenames ...
```

Example

```
npx ts-code-layout c:/foo c:/bar script.ts
```

#Configuration

The configuration is read from "ts-code-config.json". 

Example

```
{
  "comparisons": [
    { "headerness": ["IsHeader", null] },
    { "importness": ["IsImport", "IsTypeImport", null] },
    { "kind": ["EnumDeclaration", "TypeAliasDeclaration", "InterfaceDeclaration", "VariableStatement", "ClassDeclaration", "FunctionDeclaration", null] },
    { "exportness": ["IsExported", null] },
    { "persistance": ["IsConstant", null] },
    { "regularExpression": [null, "^.*\\[.*\\] += +.*\\(.*\\);$"] },
    { "name": [], "ignoreWhenSingleLine": true }
  ]
}
```