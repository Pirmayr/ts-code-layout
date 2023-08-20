import * as fs from "fs";
import { strict as assert } from 'node:assert';
import * as readline from "readline";
import { ClassDeclaration, CommentStatement, EnumDeclaration, FunctionDeclaration, ImportDeclaration, Node, Project, SyntaxKind, TypeAliasDeclaration, VariableStatement, InterfaceDeclaration, VariableDeclarationKind } from 'ts-morph'

enum Exportness
{
  IsExported
}

enum Headerness
{
  IsHeader
}

enum Importness
{
  IsImport,
  IsTypeImport
}

enum Persistance
{
  IsConstant
}

type Comparator = { (element1: Element, element2: Element): number; comparatorName: string; ignoreWhenSingleLine: boolean };
type TraitAccessor<T> = (element: Element) => T;

interface SortOrder
{
  compare(element1: Element, element2: Element): number;
}

const comparatorNameExportness = "exportness";
const comparatorNameHeaderness = "headerness";
const comparatorNameImportness = "importness";
const comparatorNameKind = "kind";
const comparatorNameName = "name";
const comparatorNamePersistance = "persistance";
const comparatorNameRegularExpression ="regularExpression";
const comparisons: Comparator[] = [];
const emptyString = "" as string;
const undefinedExportness = undefined as Exportness;
const undefinedHeaderness = undefined as Headerness;
const undefinedImportness = undefined as Importness;
const undefinedKind = undefined as SyntaxKind;
const undefinedPersistance = undefined as Persistance;
const undefinedRegex = undefined as RegExp;

class Element
{
  public headerness: Headerness = undefinedHeaderness;
  public exportness: Exportness = undefinedExportness;
  public importness: Importness = undefinedImportness;
  public kind: SyntaxKind = undefinedKind;
  public persistance: Persistance = undefinedPersistance;
  public name: string = emptyString;
  public text: string = emptyString;

  public constructor(headerness: Headerness, importness: Importness, kind: SyntaxKind, exportness: Exportness, persistance: Persistance, name: string, text: string)
  {
    this.headerness = headerness;
    this.importness = importness;
    this.kind = kind;
    this.exportness = exportness;
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

class RegularExpressionSortOrder extends MappedSortOrder<RegExp, string>
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
    if (!isMultiline && comparator.ignoreWhenSingleLine)
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

function getComparator(sortOrder: SortOrder, name: string, ignoreWhenSingleLine: boolean): Comparator
{
  let result = <Comparator> function (element1: Element, element2: Element): number
  {
    return sortOrder.compare(element1, element2);
  }
  result.comparatorName = name;
  result.ignoreWhenSingleLine = ignoreWhenSingleLine;
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
      yield new Element(Headerness.IsHeader, undefinedImportness, undefinedKind, undefinedExportness, undefinedPersistance, "", header);
    }
    if (0 < rest.length)
    {
      yield new Element(undefinedHeaderness, getImportness(node), node.getKind(), getExportness(node), getPersistance(node), getName(node), rest);
    }
    isFirstNode = false;
  }
}

function getExportness(node: Node): Exportness
{
  return hasChildOfKind(node, SyntaxKind.ExportKeyword) ? Exportness.IsExported : undefinedExportness;
}

function getImportness(node: Node): Importness
{
  if (node instanceof ImportDeclaration)
  {
    return hasDescendantOfKind(node, SyntaxKind.TypeKeyword) ? Importness.IsTypeImport : Importness.IsImport;
  }
  return undefinedImportness;
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
    if (previousElement !== undefined && previousElement.name.includes("comparison"))
    {
      let a = 0;
    }
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

    let config = JSON.parse(fs.readFileSync("./tsClean.json", "utf8"));
    readConfiguration(config);
    const configPath = inputBaseDirectory + "tsconfig.json";
    for (let i = 4; i < commandLineArguments.length; ++i)
    {
      const inputPath = inputBaseDirectory + commandLineArguments[i];
      if (!fs.existsSync(inputPath))
      {
        console.log(`input path "${inputPath}" done not exist`);
        return;
      }
      const outputPath = outputBaseDirectory + commandLineArguments[i];
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
    const ignoreWhenSingleLine = entry["ignoreWhenSingleLine"] ?? false;
    let traitValues;
    if ((traitValues = entry[comparatorNameHeaderness]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.headerness, toEnumerationValues<Headerness>(Headerness, traitValues)), comparatorNameHeaderness, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNameImportness]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.importness, toEnumerationValues<Importness>(Importness, traitValues)), comparatorNameImportness, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNameKind]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.kind, toEnumerationValues<SyntaxKind>(SyntaxKind, traitValues)), comparatorNameKind, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNameExportness]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.exportness, toEnumerationValues<Exportness>(Exportness, traitValues)), comparatorNameExportness, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNamePersistance]) !== undefined)
    {
      comparisons.push(getComparator(new TraitSortOrder(element => element.persistance, toEnumerationValues<Persistance>(Persistance, traitValues)), comparatorNamePersistance, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNameRegularExpression]) !== undefined)
    {
      comparisons.push(getComparator(new RegularExpressionSortOrder(element => element.text, traitValues), comparatorNameRegularExpression, ignoreWhenSingleLine));
    }
    else if ((traitValues = entry[comparatorNameName]) !== undefined)
    {
      comparisons.push(getComparator(new NameSortOrder(), comparatorNameName, ignoreWhenSingleLine));
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
      const text = (i === commentRangesLength ? node.getText().trim() : commentRanges[i].getText().trim());
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
