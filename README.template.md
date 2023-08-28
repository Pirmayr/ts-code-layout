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

  The elements are sorted based on following traits:

  * "kind": The kind of the elements (enumeration, class, function, ...).
  * "transfer": Whether elements are exported ("export").
  * "persistance": Whether elements are constant ("const").
  * "declaration": Whether elements are declared ("declare").
  * "pattern": Whether elements matches patterns.
  * "name": Alphabetically by the name of the element.

  Possible values:

  * "kind": "Header", "Import", "TypeImport", "Enumeration", "Type", "Interface", "Variable", "Class", "Function"
  * "transfer": "IsExported"
  * "persistance": "IsConstant"
  * "declaration": "IsDeclared"
  * "pattern": One or more regular expressions
  * "name": -

  In all traits (except "name", which has no values) the value "null" can also be used. A value of "null" 
  means that the values of the corresponding trait do not apply to the element.

  When comparing the elements, the order in which the traits are specified
  in the configuration as well as the order of values in a trait is taken into account. 

# Example

~~~
$(EXAMPLE_CONFIGURATION)
~~~

This configuration file happens to be the configuration file used for "ts-code-layout" itself.

First, the code elements are ordered by their kind according to the order of the values defined. Then they are
ordered by "transfer" and "persistance". As variables, with match the given pattern, have to come before any other
variables, a corresponding rule is provided under "pattern". Finally the code elements are sorted alphabetically.
