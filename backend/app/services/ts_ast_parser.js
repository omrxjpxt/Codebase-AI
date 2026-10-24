/**
 * ts_ast_parser.js
 * 
 * Syntax-aware TypeScript / JavaScript AST analyzer using the official TypeScript Compiler API.
 * Reads JSON input from stdin: { files: [{ path: string, content: string }] }
 * Writes JSON output to stdout: { files: { [path: string]: FileAnalysis } }
 */

const ts = require('typescript');
const fs = require('fs');

function analyzeSourceFile(path, content) {
  const isTsx = path.endsWith('.tsx') || path.endsWith('.jsx');
  const isJs = path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs');
  const scriptKind = isTsx 
    ? (path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX)
    : (isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS);

  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const exports = [];
  const declarations = [];
  const imports = [];
  const unresolved = [];
  const identifierLines = new Map(); // identifierName -> Set<number>

  function getLine(pos) {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function recordExport(name, pos, kind, isDefault = false) {
    if (!name) return;
    exports.push({
      name,
      line: getLine(pos),
      kind: kind || 'unknown',
      is_default: isDefault
    });
  }

  function recordDeclaration(name, startPos, endPos, kind, isExported = false) {
    if (!name) return;
    declarations.push({
      name,
      start_line: getLine(startPos),
      end_line: getLine(endPos),
      kind: kind || 'unknown',
      is_exported: isExported
    });
  }

  function recordIdentifier(node) {
    if (ts.isIdentifier(node)) {
      const name = node.text;
      const line = getLine(node.getStart(sourceFile));
      if (!identifierLines.has(name)) {
        identifierLines.set(name, new Set());
      }
      identifierLines.get(name).add(line);
    }
  }

  function visit(node) {
    const isExported = Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
    const isDefault = Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword));

    // 1. Declarations & Export Declarations
    if (ts.isFunctionDeclaration(node)) {
      const fnName = node.name ? node.name.text : (isDefault ? 'default' : null);
      if (fnName) {
        recordDeclaration(fnName, node.getStart(sourceFile), node.getEnd(), 'function', isExported);
        if (isExported) recordExport(fnName, node.getStart(sourceFile), 'function', isDefault);
      }
    } else if (ts.isClassDeclaration(node)) {
      const clsName = node.name ? node.name.text : (isDefault ? 'default' : null);
      if (clsName) {
        recordDeclaration(clsName, node.getStart(sourceFile), node.getEnd(), 'class', isExported);
        if (isExported) recordExport(clsName, node.getStart(sourceFile), 'class', isDefault);
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      if (node.name) {
        recordDeclaration(node.name.text, node.getStart(sourceFile), node.getEnd(), 'interface', isExported);
        if (isExported) recordExport(node.name.text, node.getStart(sourceFile), 'interface', false);
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      if (node.name) {
        recordDeclaration(node.name.text, node.getStart(sourceFile), node.getEnd(), 'type', isExported);
        if (isExported) recordExport(node.name.text, node.getStart(sourceFile), 'type', false);
      }
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          recordDeclaration(decl.name.text, decl.getStart(sourceFile), decl.getEnd(), 'variable', isExported);
          if (isExported) recordExport(decl.name.text, decl.getStart(sourceFile), 'variable', false);
        }
      }
    } else if (ts.isExportAssignment(node)) {
      // export default ...
      let exportName = 'default';
      if (ts.isIdentifier(node.expression)) {
        exportName = node.expression.text;
      }
      recordExport(exportName, node.getStart(sourceFile), 'default_export', true);
    } else if (ts.isExportDeclaration(node)) {
      // export { a, b as c } from './foo' or export * from './foo'
      const specifier = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : null;

      if (node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            recordExport(element.name.text, element.getStart(sourceFile), 're_export', false);
          }
        }
      } else if (specifier) {
        // export * from './foo'
        recordExport('*', node.getStart(sourceFile), 'export_all', false);
      }
    }

    // 2. Import Declarations
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const line = getLine(node.getStart(sourceFile));
        let defaultImport = null;
        const namedImports = [];
        let namespaceImport = null;
        let isTypeOnly = node.importClause?.isTypeOnly || false;

        if (node.importClause) {
          if (node.importClause.name) {
            defaultImport = node.importClause.name.text;
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              namespaceImport = node.importClause.namedBindings.name.text;
            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                namedImports.push({
                  name: element.propertyName ? element.propertyName.text : element.name.text,
                  alias: element.name.text,
                  is_type_only: element.isTypeOnly || false
                });
              }
            }
          }
        }

        imports.push({
          specifier,
          line,
          default_import: defaultImport,
          named_imports: namedImports,
          namespace_import: namespaceImport,
          is_type_only: isTypeOnly,
          is_dynamic: false
        });
      }
    }

    // 3. Dynamic import(...)
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const line = getLine(node.getStart(sourceFile));
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          imports.push({
            specifier: arg.text,
            line,
            default_import: null,
            named_imports: [],
            namespace_import: null,
            is_type_only: false,
            is_dynamic: true
          });
        } else {
          unresolved.push({
            line,
            reason: 'Dynamic import with non-literal expression'
          });
        }
      }
      // CommonJS require('...')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const line = getLine(node.getStart(sourceFile));
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          imports.push({
            specifier: arg.text,
            line,
            default_import: null,
            named_imports: [],
            namespace_import: null,
            is_type_only: false,
            is_dynamic: false
          });
        }
      }
    }

    // Collect all identifiers for symbol reference matching
    recordIdentifier(node);

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Convert identifier lines map to object with sorted line arrays
  const references = {};
  for (const [name, lineSet] of identifierLines.entries()) {
    references[name] = Array.from(lineSet).sort((a, b) => a - b);
  }

  return {
    path,
    exports,
    declarations,
    imports,
    unresolved,
    references
  };
}

function main() {
  const stdinBuffer = fs.readFileSync(0, 'utf-8');
  if (!stdinBuffer || !stdinBuffer.trim()) {
    console.log(JSON.stringify({ files: {} }));
    return;
  }

  try {
    const input = JSON.parse(stdinBuffer);
    const results = {};
    for (const f of input.files || []) {
      results[f.path] = analyzeSourceFile(f.path, f.content || '');
    }
    console.log(JSON.stringify({ files: results }));
  } catch (err) {
    console.error("Error in ts_ast_parser:", err);
    process.exit(1);
  }
}

main();
