#! /usr/bin/env node

import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import * as fs from "fs";
import { strict as assert } from "node:assert";
import * as path from "path";
import * as readline from "readline";
import { ClassDeclaration, CommentStatement, EnumDeclaration, FunctionDeclaration, ImportDeclaration, Node, Project, SyntaxKind, TypeAliasDeclaration, VariableStatement, InterfaceDeclaration, VariableDeclarationKind } from "ts-morph"

enum Declaration
{
  IsDeclared
}

enum Kind
{
  Enumeration,
  Type,
  Interface,
  Variable,
  Class,
  Function,
  Header,
  Import,
  TypeImport
}

enum Persistance
{
  IsConstant
}

enum Trait
{
  Kind = "kind",
  Name = "name",
  Pattern = "pattern",
  Persistance = "persistance",
  Transfer = "transfer",
  Declaration = "declare"
}

enum Transfer
{
  IsExported
}

type Comparator = { (element1: Element, element2: Element): number; comparatorName: string; ignoreIfSingleLine: boolean };
type TraitAccessor<T> = (element: Element) => T;

interface SortOrder
{
  compare(element1: Element, element2: Element): number;
}

const optionInputDirectory = "input-directory";
const optionOutputDirectory = "output-directory";
const optionPause = "pause";
const optionScripts = "scripts";
const optionWriteOptions = "write-options";

const comparatorNameKind = "kind";
const comparatorNameName = "name";
const comparatorNamePattern ="pattern";
const comparatorNamePersistance = "persistance";
const comparatorNameTransfer = "transfer";
const comparisons: Comparator[] = [];
const emptyString = "" as string;
const help = '$(HELP)';
const matchAllRegex = new RegExp("");

const optionsDefinition =
  [
    { name: optionInputDirectory, alias: "i", type: String, description: 'Input-directory to read scripts from.' },
    { name: optionOutputDirectory, alias: "o", type: String, description: 'Output-directory to write scripts to.' },
    { name: optionScripts, alias: "s", type: String, multiple: true, defaultOption: true, description: 'Scripts to be processed.' },
    { name: optionPause, alias: "p", type: Boolean, description: 'Pause before closing the app.' },
    { name: optionWriteOptions, alias: "w", type: Boolean, description: 'Writes options to "options.txt"' }
  ];

const undefinedDeclaration = undefined as Declaration;
const undefinedKind = undefined as Kind;
const undefinedPersistance = undefined as Persistance;
const undefinedTransfer = undefined as Transfer;

const usageDefinition =
  [
    { header: "", optionList: optionsDefinition },
  ];

class Element
{
  public transfer: Transfer = undefinedTransfer;
  public kind: Kind = undefinedKind;
  public persistance: Persistance = undefinedPersistance;
  public name: string = emptyString;
  public text: string = emptyString;
  public declaration: Declaration = undefinedDeclaration;

  public constructor(kind: Kind, transfer: Transfer, persistance: Persistance, declaration: Declaration, name: string, text: string)
  {
    this.kind = kind;
    this.transfer = transfer;
    this.persistance = persistance;
    this.declaration = declaration;
    this.name = name;
    this.text = text;
  }
}

abstract class MappedSortOrder<K, P> extends Map<K, number> implements SortOrder
{
  protected readonly traitAccessor: TraitAccessor<P>

  public constructor(traitAccessor: TraitAccessor<P>,  parameters: P[])
  {
    super();
    this.traitAccessor = traitAccessor;
    this.setParameters(parameters);
  }

  public compare(element1: Element, element2: Element): number
  {
    const rank1 = this.getRank(element1) ?? Number.MAX_SAFE_INTEGER;
    const rank2 = this.getRank(element2) ?? Number.MAX_SAFE_INTEGER;
    return rank1 === rank2 ? 0 : rank1 < rank2 ? -1 : 1;
  }

  abstract getRank(element: Element);
  abstract setParameters(parameters: P[]);
}

class NameSortOrder implements SortOrder
{
  public compare(element1: Element, element2: Element): number
  {
    return element1.name.localeCompare(element2.name);
  }
}

class PatternSortOrder extends MappedSortOrder<RegExp, string>
{
  public constructor(traitAccessor: TraitAccessor<string>,  parameters: string[])
  {
    super(traitAccessor, parameters);
  }

  public getRank(element: Element): number
  {
    let matchAllRank = Number.MAX_SAFE_INTEGER;
    const key = this.traitAccessor(element);
    for (const [regex, rank] of this)
    {
      if (regex === matchAllRegex)
      {
        matchAllRank = rank;
      }
      else if (regex.test(key))
      {
        return rank;
      }
    }
    return matchAllRank;
  }

  public setParameters(parameters: string[])
  {
    for (const parameter of parameters)
    {
      this.set(parameter === null ? matchAllRegex : new RegExp(parameter), this.size);
    }
  }
}

class TraitSortOrder<T> extends MappedSortOrder<T, T>
{
  public constructor(traitAccessor: TraitAccessor<T>,  parameters: T[])
  {
    super(traitAccessor, parameters);
  }

  public getRank(element: Element): number
  {
    return this.get(this.traitAccessor(element)) ?? Number.MAX_SAFE_INTEGER;
  }

  public setParameters(parameters: T[])
  {
    for (const parameter of parameters)
    {
      this.set(parameter, this.size);
    }
  }
}

function compareElements(element1: Element, element2: Element, useIgnoreIfSingleLine = false): number
{
  for (const comparator of comparisons)
  {
    if (useIgnoreIfSingleLine && comparator.ignoreIfSingleLine)
    {
      continue;
    }
    const comparison = comparator(element1, element2);
    if (comparison !== 0)
    {
      return comparison;
    }
  }
  return 0;
}

function getCommentGapIndex(node: Node): number
{
  const commentRanges = node.getLeadingCommentRanges();
  const commentRangesUpperIndex = commentRanges.length - 1;
  for (let i = 0; i <= commentRangesUpperIndex; ++i)
  {
    const end = commentRanges[i].getEnd();
    const start = i === commentRangesUpperIndex ? node.getStart() : commentRanges[i + 1].getPos();
    const difference = start - end;
    const hasGap = 1 < difference;
    if (hasGap)
    {
      return i + 1;
    }
  }
  return 0;
}

function getComparator(sortOrder: SortOrder, name: string, ignoreIfSingleLine: boolean): Comparator
{
  let result = <Comparator> function (element1: Element, element2: Element): number
  {
    return sortOrder.compare(element1, element2);
  }
  result.comparatorName = name;
  result.ignoreIfSingleLine = ignoreIfSingleLine;
  return result;
}

function getDeclaration(node: Node): Declaration
{
  return hasChildOfKind(node, SyntaxKind.DeclareKeyword) ? Declaration.IsDeclared : undefinedDeclaration;
}

function* getElements(nodes: Iterable<Node>): IterableIterator<Element>
{
  let isFirstNode = true;
  for (const node of nodes)
  {
    const [header, rest] = splitToHeaderAndRest(node, isFirstNode);
    if (0 < header.length)
    {
      yield new Element(Kind.Header, undefinedTransfer, undefinedPersistance, undefinedDeclaration, "", header);
    }
    if (0 < rest.length)
    {
      yield new Element(getKind(node), getTransfer(node), getPersistance(node), getDeclaration(node), getName(node), rest);
    }
    isFirstNode = false;
  }
}

function getKind(node: Node): Kind
{
  switch (node.getKind())
  {
    case SyntaxKind.EnumDeclaration:
      return Kind.Enumeration;
    case SyntaxKind.TypeAliasDeclaration:
      return Kind.Type;
    case SyntaxKind.InterfaceDeclaration:
      return Kind.Interface;
    case SyntaxKind.VariableStatement:
      return Kind.Variable;
    case SyntaxKind.ClassDeclaration:
      return Kind.Class;
    case SyntaxKind.FunctionDeclaration:
      return Kind.Function;
    case SyntaxKind.ImportDeclaration:
      return hasDescendantOfKind(node, SyntaxKind.TypeKeyword) ? Kind.TypeImport : Kind.Import;
  }
  return undefinedKind;
}

function getName(node: Node): string
{
  if (node instanceof InterfaceDeclaration)
  {
    return node.getText();
  }
  if (node instanceof FunctionDeclaration)
  {
    return node.getName();
  }
  if (node instanceof ImportDeclaration)
  {
    return node.getModuleSpecifier().getText().slice(1, -1);
  }
  if (node instanceof TypeAliasDeclaration)
  {
    return node.getName();
  }
  if (node instanceof VariableStatement)
  {
    return node.getDeclarationList().getDeclarations()[0].getName();
  }
  if (node instanceof ClassDeclaration)
  {
    return node.getName();
  }
  if (node instanceof EnumDeclaration)
  {
    return node.getName();
  }
  if (node instanceof CommentStatement)
  {
    return emptyString;
  }
  return emptyString;
}

function getPersistance(node: Node): Persistance
{
  return node instanceof VariableStatement && node.getDeclarationKind() === VariableDeclarationKind.Const ? Persistance.IsConstant : undefinedPersistance;
}

function getTransfer(node: Node): Transfer
{
  return hasChildOfKind(node, SyntaxKind.ExportKeyword) ? Transfer.IsExported : undefinedTransfer;
}

declare function greet(g: string): void;

async function handleFile(configPath: string, sourcePath: string): Promise<string>
{
  const project = new Project({ tsConfigFilePath: configPath });
  const source = project.getSourceFile(sourcePath);
  const elements: Element[] = [];
  for (const element of getElements(source.forEachChildAsArray()))
  {
    elements.push(element);
  }
  elements.sort((element1, element2) => compareElements(element1, element2))
  let result = "";
  let previousIsMultiline = false;
  let previousElement: Element;
  let isFirstElement = true;
  for (const element of elements)
  {
    const currentIsMultiline = isMultiline(element);
    const needsBlankLine = previousElement !== undefined && compareElements(element, previousElement, true) !== 0;
    if (!isFirstElement && (needsBlankLine || currentIsMultiline || previousIsMultiline))
    {
      result += "\n";
    }
    result += element.text.trim() + "\n";
    previousIsMultiline = currentIsMultiline;
    previousElement = element;
    isFirstElement = false;
  }
  return result;
}

function hasChildOfKind(node: Node, kind: SyntaxKind): boolean
{
  for (const child of node.forEachChildAsArray())
  {
    if (child.getKind() === kind)
    {
      return true;
    }
  }
  return false;
}

function hasDescendantOfKind(node: Node, kind: SyntaxKind): boolean
{
  for (const child of node.getDescendants())
  {
    if (child.getKind() === kind)
    {
      return true;
    }
  }
  return false;
}

function isMultiline(element: Element): boolean
{
  return element.text.includes("\n");
}

async function main()
{
  let pause = false;
  try
  {
    const commandLineArguments = process.argv;
    const options = commandLineArgs(optionsDefinition);
    pause = options[optionPause];
    const writeOptions = options[optionWriteOptions];
    if (writeOptions)
    {
      fs.writeFileSync("options.txt", "  " + commandLineUsage(usageDefinition).trim());
      return;
    }
    const inputBaseDirectory = options[optionInputDirectory];
    assert(inputBaseDirectory !== undefined, `missing option '${optionInputDirectory}'`);
    assert(fs.existsSync(inputBaseDirectory), `input-directory ${inputBaseDirectory} does not exist`);
    const outputBaseDirectory = options[optionOutputDirectory];
    assert(outputBaseDirectory !== undefined, `missing option '${optionOutputDirectory}'`);
    assert(fs.existsSync(outputBaseDirectory), `output-directory ${outputBaseDirectory} does not exist`);
    const scripts = options[optionScripts];
    const currentDirectory = process.cwd();
    let configurationPath = path.normalize(currentDirectory + "/ts-code-layout.json");
    if (!fs.existsSync(configurationPath))
    {
      const scriptPath = commandLineArguments[1];
      const programDirectory = path.dirname(scriptPath);
      configurationPath = path.normalize(programDirectory + "/ts-code-layout.json");
    }
    assert(fs.existsSync(configurationPath), `could not find configuration-path '${configurationPath}'`);
    let config = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
    readConfiguration(config);
    usageDefinition
    const tsConfigPath = path.normalize(inputBaseDirectory + "/tsconfig.json");
    for (let i = 0; i < scripts.length; ++i)
    {
      const scriptFilename = scripts[i];
      const inputPath = path.normalize(inputBaseDirectory + "/" + scriptFilename);
      assert(fs.existsSync(inputPath), `could not find input-path '${inputPath}'`);
      const outputPath = path.normalize(outputBaseDirectory + "/" + scriptFilename);
      if (fs.existsSync(outputPath))
      {
        fs.copyFileSync(outputPath, outputPath + ".backup");
      }
      console.log(inputPath + " => " + outputPath);
      fs.writeFileSync(outputPath, await handleFile(tsConfigPath, inputPath));
    }
  }
  catch (error)
  {
    console.log("error: " + error.message);
    console.log(help);
  }
  if (pause)
  {
    await prompt("end of program");
  }
}

function prompt(message: string): Promise<string>
{
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => readlineInterface.question(message, answer =>
  {
    readlineInterface.close();
    resolve(answer);
  }))
}

function readConfiguration(configuration: object)
{
  const configurationComparisons = configuration["comparisons"]; 
  assert(configurationComparisons !== undefined, "property 'comparisons' missing in configuration");
  for (const entry of configurationComparisons)
  {
    const ignoreIfSingleLine = entry["ignoreIfSingleLine"] ?? false;
    let traitValues;
    if ((traitValues = entry[Trait.Kind]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.kind, toEnumerationValues<Kind>(Kind, traitValues)), Trait.Kind, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[Trait.Transfer]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.transfer, toEnumerationValues<Transfer>(Transfer, traitValues)), Trait.Transfer, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[Trait.Declaration]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.declaration, toEnumerationValues<Declaration>(Declaration, traitValues)), Trait.Declaration, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[Trait.Persistance]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.persistance, toEnumerationValues<Persistance>(Persistance, traitValues)), Trait.Persistance, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[Trait.Pattern]) !== undefined)
    {
      comparisons.push(getComparator(new PatternSortOrder(element => element.text, traitValues), Trait.Pattern, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[Trait.Name]) !== undefined)
    {
      comparisons.push(getComparator(new NameSortOrder(), Trait.Name, ignoreIfSingleLine));
    }
  }
}

function splitToHeaderAndRest(node: Node, split: boolean): [string, string]
{
  if (split)
  {
    let header: string = "";
    let rest: string = "";
    const commentRanges = node.getLeadingCommentRanges();
    const commentRangesLength = commentRanges.length;
    if (commentRangesLength === 0)
    {
      const triviaWidth = node.getLeadingTriviaWidth();
      if (0 < triviaWidth)
      {
        const nodePos = node.getPos();
        header = node.getFullText().substring(nodePos, nodePos + triviaWidth);
        rest = node.getText();
      }
      else
      {
        rest = node.getFullText();
      }
    }
    else 
    {
      const commentGapIndex = getCommentGapIndex(node);
      for (let i = 0; i <= commentRangesLength; ++i)
      {
        const commentRange = commentRanges[i];
        let text: string;
        if (i === commentRangesLength)
        {
          text = node.getText();
        }
        else
        {
          if (i === 0)
          {
            const commentPos = node.getPos();
            const commentEnd = commentRange.getEnd() - commentPos;
            text = node.getFullText().substring(commentPos, commentEnd);
          }
          else
          {
            text = commentRanges[i].getText();
          }
        }
        text = text.trim();
        if (i < commentGapIndex)
        {
          header += text + "\n";
        }
        else
        {
          rest += text + "\n";
        }
      }
    }
    return [header.trim(), rest.trim()];
  }
  return ["", node.getFullText().trim()];
}

function toEnumerationValues<T>(enumeration: object, values: string[]): T[]
{
  const result: T[] = [];
  for (const value of values)
  {
    result.push(enumeration[value]);
  }
  return result;
}

main();
