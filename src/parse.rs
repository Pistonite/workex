use std::collections::BTreeMap;
use std::ops::Deref;
use std::path::Path;

use error_stack::ResultExt;
use swc_common::comments::{Comment, CommentKind, Comments, SingleThreadedComments};
use swc_common::errors::Handler;
use swc_common::sync::Lrc;
use swc_common::{BytePos, SourceMap, SourceMapper, Span};
use swc_core::ecma::ast::{
    Decl, EsVersion, ExportDecl, Ident, ImportDecl, ImportNamedSpecifier, ImportSpecifier,
    ModuleDecl, ModuleExportName, ModuleItem,
};
use swc_ecma_parser::lexer::Lexer;
use swc_ecma_parser::{Parser, StringInput, Syntax};

use crate::{io_err, CommentBlock, CommentStyle, IOResult, Import, ImportIdent, Interface};

/// Parse the interfaces in the inputs
pub fn parse(inputs: &[String]) -> IOResult<Vec<Interface>> {
    Parse::new().parse(inputs)
}

/// Parse state for input files
struct Parse {
    source_map: Lrc<SourceMap>,
    handler: Handler,
    /// Output interfaces. Using BTreeMap to keep names sorted
    out: BTreeMap<String, Interface>,
}

struct ParseFile<'a, 'b> {
    ctx: &'a Parse,
    path: &'b str,
    errors: usize,
}

type ParseResult<T> = Result<T, usize>; // error is number of errors emitted

impl Deref for ParseFile<'_, '_> {
    type Target = Parse;

    fn deref(&self) -> &Self::Target {
        self.ctx
    }
}

impl Parse {
    /// Create a new parser
    pub fn new() -> Self {
        let source_map: Lrc<SourceMap> = Default::default();
        let handler = Handler::with_tty_emitter(
            swc_common::errors::ColorConfig::Auto,
            true,
            false,
            Some(source_map.clone()),
        );

        let out = BTreeMap::new();
        Self {
            source_map,
            handler,
            out,
        }
    }

    pub fn parse(self, inputs: &[String]) -> IOResult<Vec<Interface>> {
        let mut errors = 0;
        for input in inputs {
            errors += ParseFile::new(&self, input).parse_file()?;
        }

        if errors > 0 {
            return Err(io_err(format!("{errors} errors parsing input files")))?;
        }

        Ok(self.out.into_values().collect())
    }
}

impl<'a, 'b> ParseFile<'a, 'b> {
    fn new(ctx: &'a Parse, path: &'b str) -> Self {
        Self {
            ctx,
            path,
            errors: 0,
        }
    }

    fn parse_file(mut self) -> IOResult<usize> {
        println!("parsing {}", self.path);

        let source_file = self
            .source_map
            .load_file(Path::new(self.path))
            .attach_printable_lazy(|| format!("cannot load input file: {}", self.path))?;

        let comments = SingleThreadedComments::default();

        let lexer = Lexer::new(
            Syntax::Typescript(Default::default()),
            EsVersion::EsNext,
            StringInput::from(&*source_file),
            Some(&comments),
        );

        let mut has_error = false;

        let mut parser = Parser::new_from(lexer);
        for e in parser.take_errors() {
            e.into_diagnostic(&self.handler).emit();
            has_error = true;
        }

        let result = parser.parse_module();
        for e in parser.take_errors() {
            e.into_diagnostic(&self.handler).emit();
            has_error = true;
        }

        let module = match result {
            Ok(module) => {
                if has_error {
                    return Err(io_err(format!("error parsing input file: {}", self.path)))?;
                }
                module
            }
            Err(e) => {
                e.into_diagnostic(&self.handler).emit();
                return Err(io_err(format!("error parsing input file: {}", self.path)))?;
            }
        };

        self.parse_module_body(&module.body);
        Ok(self.errors)
    }

    fn parse_module_body(&mut self, body: &[ModuleItem]) {
        let mut seen_output = false;
        let mut imports = Vec::new();
        for item in body {
            // skip statements
            let item = match item {
                ModuleItem::Stmt(_) => {
                    continue;
                }
                ModuleItem::ModuleDecl(decl) => decl,
            };
            match item {
                // import
                ModuleDecl::Import(import) => {
                    if seen_output {
                        self.emit_error(import.span, "imports must be before exported interfaces");
                    } else {
                        if let Some(import) = self.parse_import(import) {
                            imports.push(import);
                        }
                    }
                }
                // import ... = ..., (opaque)
                ModuleDecl::TsImportEquals(import) => {
                    if seen_output {
                        self.emit_error(import.span, "imports must be before exported interfaces");
                    } else {
                        if let Some(source) = self.raw_source(import.span) {
                            imports.push(Import::Opaque(source));
                        }
                    }
                }
                // export interface
                ModuleDecl::ExportDecl(ExportDecl {
                    span,
                    decl: Decl::TsInterface(interface),
                }) => {
                    seen_output = true;
                    println!("{:#?}", span);
                    println!("{:#?}", interface);
                }
                // unsupported syntax
                ModuleDecl::TsNamespaceExport(export) => {
                    self.emit_error(export.span, "namespace exports are not supported");
                }
                // ignored syntax
                ModuleDecl::ExportDecl(_)
                | ModuleDecl::ExportNamed(_)
                | ModuleDecl::ExportDefaultDecl(_)
                | ModuleDecl::ExportDefaultExpr(_)
                | ModuleDecl::ExportAll(_)
                | ModuleDecl::TsExportAssignment(_) => continue,
            }
        }

        todo!()
    }

    /// Parse JS import declaration into IR import
    fn parse_import(&mut self, import: &ImportDecl) -> Option<Import> {
        if import.with.is_some() {
            // not sure how to handle with imports, just treat them as opaque
            return Some(Import::Opaque(self.raw_source(import.span)?));
        }

        let mut idents = Vec::with_capacity(import.specifiers.len());
        for ident in &import.specifiers {
            match self.parse_import_ident(ident) {
                Some(ident) => idents.push(ident),
                None => {
                    // not interested in this import, treat it as opaque
                    return Some(Import::Opaque(self.raw_source(import.span)?));
                }
            }
        }

        Some(Import::Import {
            is_type: import.type_only,
            idents,
            from: import.src.value.to_string(),
        })
    }

    /// Parse one specifier/ident in an import declaration.
    /// Return None if we don't understand the syntax
    fn parse_import_ident(&self, ident: &ImportSpecifier) -> Option<ImportIdent> {
        let ident = match ident {
            ImportSpecifier::Named(x) => x,
            _ => return None,
        };
        match &ident.imported {
            Some(ModuleExportName::Ident(x)) => Some(ImportIdent {
                is_type: ident.is_type_only,
                ident: x.sym.to_string(),
                rename: Some(ident.local.sym.to_string()),
            }),
            None => Some(ImportIdent {
                is_type: ident.is_type_only,
                ident: ident.local.sym.to_string(),
                rename: None,
            }),
            _ => None,
        }
    }

    /// Extract the raw source code as String
    fn raw_source(&mut self, span: Span) -> Option<String> {
        let result = self
            .source_map
            .with_snippet_of_span(span, |snippet| snippet.to_string());
        match result {
            Ok(s) => Some(s),
            Err(_) => {
                self.emit_error(span, "failed to extract source code from span");
                None
            }
        }
    }

    fn parse_interface() -> Option<Interface> {
        todo!()
    }

    fn emit_error<T: AsRef<str>>(&mut self, span: Span, msg: T) {
        self.handler.struct_span_err(span, msg.as_ref()).emit();
        self.errors += 1;
    }
}

fn parse_comments_at_pos(comments: &SingleThreadedComments, pos: BytePos) -> Option<CommentBlock> {
    comments.with_leading(pos, |comments| parse_comment(comments))
}

/// Parse the JS comments into IR comment
fn parse_comment(comments: &[Comment]) -> Option<CommentBlock> {
    let mut iter = comments.iter();
    let first = iter.next()?;
    let mut style = match first.kind {
        CommentKind::Line => CommentStyle::TripleSlash,
        CommentKind::Block => CommentStyle::JsDoc,
    };

    let mut lines = Vec::new();
    add_comment(first, &mut lines);
    for comment in iter {
        // use JSDoc style if any comment is a block comment (with /* ... */)
        if comment.kind == CommentKind::Block {
            style = CommentStyle::JsDoc;
        }
        add_comment(comment, &mut lines);
    }

    // remove trailing empty lines
    while let Some(last) = lines.last() {
        if last.is_empty() {
            lines.pop();
        } else {
            break;
        }
    }

    if lines.is_empty() {
        None
    } else {
        Some(CommentBlock { style, lines })
    }
}

/// Add one comment to the output lines
fn add_comment(comment: &Comment, out: &mut Vec<String>) {
    let lines = comment.text.lines().map(|line| {
        // trim !, / or * from the start of the line
        let line = line.trim_start_matches(|c| c == '!' || c == '/' || c == '*');
        // remove whitespaces
        line.trim().to_string()
    });

    if out.is_empty() {
        // remove leading empty lines
        out.extend(lines.skip_while(|line| line.is_empty()))
    } else {
        out.extend(lines);
    }
}
