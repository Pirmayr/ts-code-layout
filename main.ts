#! /usr/bin/env node
// -*- js -*-

import * as fs from "fs";
import { strict as assert } from 'node:assert';
import * as path from "path";
import * as readline from "readline";
import { ClassDeclaration, CommentStatement, EnumDeclaration, FunctionDeclaration, ImportDeclaration, Node, Project, SyntaxKind, TypeAliasDeclaration, VariableStatement, InterfaceDeclaration, VariableDeclarationKind } from 'ts-morph'

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

const comparatorNameKind = "kind";
const comparatorNameName = "name";
const comparatorNamePattern ="pattern";
const comparatorNamePersistance = "persistance";
const comparatorNameTransfer = "transfer";
const comparisons: Comparator[] = [];
const emptyString = "" as string;
const undefinedKind = undefined as Kind;
const undefinedPersistance = undefined as Persistance;
const undefinedRegex = undefined as RegExp;
const undefinedTransfer = undefined as Transfer;

class Element
{
  public transfer: Transfer = undefinedTransfer;
  public kind: Kind = undefinedKind;
  public persistance: Persistance = undefinedPersistance;
  public name: string = emptyString;
  public text: string = emptyString;

  public constructor(kind: Kind, transfer: Transfer, persistance: Persistance, name: string, text: string)
  {
    this.kind = kind;
    this.transfer = transfer;
    this.persistance = persistance;
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
    const key = this.traitAccessor(element);
    for (const [regex, rank] of this)
    {
      if (regex !== undefined && regex.test(key))
      {
        return rank;
      }
    }
    return this.get(undefinedRegex) ?? Number.MAX_SAFE_INTEGER;
  }

  public setParameters(parameters: string[])
  {
    for (const parameter of parameters)
    {
      this.set(parameter === undefined ? undefinedRegex : new RegExp(parameter), this.size);
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

function compareElements(element1: Element, element2: Element, isMultiline: boolean = true): number
{
  for (const comparator of comparisons)
  {
    if (!isMultiline && comparator.ignoreIfSingleLine)
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

function* getElements(nodes: Iterable<Node>): IterableIterator<Element>
{
  let isFirstNode = true;
  for (const node of nodes)
  {
    const [header, rest] = splitToHeaderAndRest(node, isFirstNode);
    if (0 < header.length)
    {
      yield new Element(Kind.Header, undefinedTransfer, undefinedPersistance, "", header);
    }
    if (0 < rest.length)
    {
      yield new Element(getKind(node), getTransfer(node), getPersistance(node), getName(node), rest);
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
  let previousElement: Element;
  for (const element of elements)
  {
    if (previousElement !== undefined && compareElements(element, previousElement, isMultiline(element)) !== 0)
    {
      result += "\n";
    }
    result += element.text.trim() + "\n";
    previousElement = element;
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
  try
  {
    const commandLineArguments = process.argv;
    let inputBaseDirectory = "";
    let outputBaseDirectory = "";
    if (2 <= commandLineArguments.length)
    {
      inputBaseDirectory = commandLineArguments[2] + "/";
      if (!fs.existsSync(inputBaseDirectory))
      {
        console.log(`input directory "${inputBaseDirectory}" done not exist`);
        return;
      }
    }
    if (3 <= commandLineArguments.length)
    {
      outputBaseDirectory = commandLineArguments[3] + "/";
      if (!fs.existsSync(outputBaseDirectory))
      {
        console.log(`output directory "${outputBaseDirectory}" done not exist`);
        return;
      }
    }
    const currentDirectory = process.cwd();
    let configurationPath = path.normalize(currentDirectory + "/ts-code-layout.json");
    if (!fs.existsSync(configurationPath))
    {
      const scriptPath = commandLineArguments[1];
      const programDirectory = path.dirname(scriptPath);
      configurationPath = path.normalize(programDirectory + "/ts-code-layout.json");
    }
    let config = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
    readConfiguration(config);
    const configPath = inputBaseDirectory + "tsconfig.json";
    for (let i = 4; i < commandLineArguments.length; ++i)
    {
      const inputPath = path.normalize(inputBaseDirectory + commandLineArguments[i]);
      if (!fs.existsSync(inputPath))
      {
        console.log(`input path "${inputPath}" done not exist`);
        return;
      }
      const outputPath = path.normalize(outputBaseDirectory + commandLineArguments[i]);
      if (fs.existsSync(outputPath))
      {
        fs.copyFileSync(outputPath, outputPath + ".backup");
      }
      console.log(inputPath + " => " + outputPath);
      fs.writeFileSync(outputPath, await handleFile(configPath, inputPath));
    }
  }
  catch (error)
  {
    console.log("error: " + error.message);
  }
  await prompt("end of program");
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
  assert(configurationComparisons !== undefined, 'property "comparisons" missing in configuration');
  for (const entry of configurationComparisons)
  {
    const ignoreIfSingleLine = entry["ignoreIfSingleLine"] ?? false;
    let traitValues;
    if ((traitValues = entry[comparatorNameKind]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.kind, toEnumerationValues<Kind>(Kind, traitValues)), comparatorNameKind, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[comparatorNameTransfer]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.transfer, toEnumerationValues<Transfer>(Transfer, traitValues)), comparatorNameTransfer, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[comparatorNamePersistance]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.persistance, toEnumerationValues<Persistance>(Persistance, traitValues)), comparatorNamePersistance, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[comparatorNamePattern]) !== undefined)
    {
      comparisons.push(getComparator(new PatternSortOrder(element => element.text, traitValues), comparatorNamePattern, ignoreIfSingleLine));
    }
    else if ((traitValues = entry[comparatorNameName]) !== undefined)
    {
      comparisons.push(getComparator(new NameSortOrder(), comparatorNameName, ignoreIfSingleLine));
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
          commentRanges[i].getText();
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
