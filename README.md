# Overview

Arranges the top-level elements of typescripts source code.

# Installation

```
npm install ts-code-layout
```

# Command Line

```
npx ts-code-layout input-directory output-directory filenames ...
```

## Example

```
npx ts-code-layout c:/foo c:/bar script.ts
```

# Configuration

The program reads the configuration from "ts-code-config.json". It searches for the configuration in the current directory and in the installation directory of "ts-code-layout".

## Example

```
{
  "comparisons": [
    { "kind": ["Header", "Import", "TypeImport", "Enumeration", "Type", "Interface", "Variable", "Class", "Function", null] },
    { "transfer": ["IsExported", null] },
    { "persistance": ["IsConstant", null] },
    { "pattern": [null, "^.*\\[.*\\] += +.*\\(.*\\);$"] },
    { "name": [], "ignoreIfSingleLine": true }
  ]
}
```

The program uses the comparisons to determine the order of two code elements. The comparisons are applied in the given order. In the example above the code elements are first sorted by "kind", then by the fact, if a code element is exported, then if it constant or not, and so on. The value "null" means, that a code element has none of the values in that comparison category.

Comparison Categories

- "kind": The kind of the code element. Values: Header, Import, TypeImport, Enumeration, Type, Interface, Variable, Class, Function, and "null".
- "transfer": The fact, wether a code element is imported, exported, or neither. Values: IsExported, IsImported, and "null".
- "persistance": The fact, wether a code element is constant or not. Value: IsConstant, and "null".
- "name": The name of the code element.
- "pattern": Regular expressions. Code elements, which match patterns, are sorted according to the order of the patterns. The value "null" is used for code element, which match none of the patterns.