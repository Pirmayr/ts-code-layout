# Name

  ts-code-layout: Rearranges elements in typescript code.

# Synopsis

~~~
  ts-code-layout -i input-directory -o output-directory [-s] sources ...
~~~

# Description

  Rearranges code elements in the top level of typescript source code.
  The layout is specified in "ts-code-layout.json". The file is searched
  in the current directory. If not found, the default configuration in
  the installation directory is used.

# Installation

~~~
  npm install ts-code-layout
~~~

# Options

~~~
$(OPTIONS)
~~~

# Configuration

  The elements are sorted by following traits:

  * "kind": Based on the kind of element (enumeration, class, function, ...).
  * "transfer": Based on whether elements are exported or not.
  * "persistance": Based on whether elements are constant or not.
  * "pattern": Based on whether an element matches patterns or not.
  * "name": Based on the alphabetical sorting of the name of the element.

  Possible values:

  * "kind": "Header", "Import", "TypeImport", "Enumeration", "Type", "Interface", "Variable", "Class", "Function"
  * "transfer": "IsExported"
  * "persistance": "IsConstant"
  * "pattern": One or more regular expressions
  * "name": -

  In all traits (except "name") the value "null" can also be used. A value of "null" 
  means that the values of the corresponding trait do not apply to the element.

  When comparing the elements, the order in which the traits are specified
  in the configuration is taken into account. 

# Example

~~~
$(EXAMPLE_CONFIGURATION)
~~~
