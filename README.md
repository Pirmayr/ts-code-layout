# Overview

Arranges the top-level elements of typescripts source code.

# Installation

```
npm install ts-code-layout
```

# Command Line

```
Name

  ts-code-layout: Rearranges elements in typescript code.

Synopsis

  ts-code-layout -i input-directory -o output-directory [-s] sources ...

Description


  Rearranges code elements in the top level of typescript source code.
  The layout is specified in "ts-code-layout.json". The file is searched
  in the current directory. If not found, the default configuration in
  the installation directory is used.

Options

  -i, --input-directory string    Input-directory to read scripts from.
  -o, --output-directory string   Output-directory to write scripts to.
  -s, --scripts string[]          Scripts to be processed.
  -p, --pause                     Pause before closing the app.

Example Configuration

  {
    "comparisons": [
      { "kind": ["Header", "Import", "TypeImport", "Enumeration", "Type", "Interface", "Variable", "Class", "Function", null] },
      { "transfer": [ "IsExported", null ] },
      { "persistance": [ "IsConstant", null ] },
      { "pattern": ["const option[a-zA-Z]+ = "[-a-zA-z]+";", null], "ignoreIfSingleLine": false },
      { "name": [], "ignoreIfSingleLine": true }
    ]
  }

```

## Example

```
npx ts-code-layout c:/foo c:/bar script.ts
```

# Configuration

The program reads the configuration from "ts-code-config.json". It searches for the configuration in the current directory and in the installation directory of "ts-code-layout".

The program uses the comparisons to determine the order of two code elements. The comparisons are applied in the given order. In the example above the code elements are first sorted by "kind", then by the fact, if a code element is exported, then if it constant or not, and so on. The value "null" means, that a code element has none of the values in that comparison category.

Comparison Categories

| Category    | Description                                                  | Values                                                       |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| kind        | The kind of source code element                              | Header, Import, TypeImport, Enumeration, Type, Interface, Variable, Class, Function, and "null" |
| transfer    | Sorts the code elements by whether it is an import, a type import, or neither. | IsImport, IsExport, and "null"                               |
| persistance | The fact, wether a code element is constant or not. Value: IsConstant, and "null". | IsConstant, and "null"                                       |
| name        | The name of the code element.                                |                                                              |
| pattern     | Regular expressions. Code elements, which match patterns, are sorted according to the order of the patterns. The value "null" is used for code element, which match none of the patterns. |                                                              |
|             |                                                              |                                                              |
