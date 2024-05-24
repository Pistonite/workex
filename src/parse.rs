use std::collections::BTreeMap;
use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::rc::Rc;

use error_stack::ResultExt;
use swc_common::comments::{Comment, CommentKind, SingleThreadedComments};
use swc_common::errors::Handler;
use swc_common::sync::Lrc;
use swc_common::{BytePos, SourceMap, Span, Spanned};
use swc_core::ecma::ast::{
    Decl, EsVersion, ExportDecl, Expr, ImportDecl, ImportSpecifier, ModuleDecl, ModuleExportName,
    ModuleItem, TsEntityName, TsFnParam, TsInterfaceDecl, TsType, TsTypeElement,
};
use swc_ecma_parser::lexer::Lexer;
use swc_ecma_parser::{Parser, StringInput, Syntax};

use crate::{
    io_err, Arg, CommentBlock, CommentStyle, Function, IOResult, Import, ImportIdent, Interface,
    PatchedImports,
};

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

    pub fn parse(mut self, inputs: &[String]) -> IOResult<Vec<Interface>> {
        let mut errors = 0;
        for input in inputs {
            errors += ParseFile::try_from(&mut self, input)?.parse_file()?;
        }

        if errors > 0 {
            return Err(io_err(format!("{errors} errors parsing input files")))?;
        }

        Ok(self.out.into_values().collect())
    }
}

struct ParseFile<'a, 'b> {
    ctx: &'a mut Parse,
    path: &'b str,
    errors: usize,
    filename: String,
    comments: SingleThreadedComments,
}

impl Deref for ParseFile<'_, '_> {
    type Target = Parse;

    fn deref(&self) -> &Self::Target {
        self.ctx
    }
}

impl DerefMut for ParseFile<'_, '_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ctx
    }
}

impl<'a, 'b> ParseFile<'a, 'b> {
    fn try_from(ctx: &'a mut Parse, path: &'b str) -> IOResult<Self> {
        let filename = Path::new(path)
            .file_name()
            .ok_or_else(|| io_err(format!("cannot get filename from input path: {}", path)))?
            .to_str()
            .ok_or_else(|| io_err(format!("cannot convert filename to string: {}", path)))?
            .to_string();

        Ok(Self {
            ctx,
            path,
            errors: 0,
            filename,
            comments: SingleThreadedComments::default(),
        })
    }

    fn parse_file(mut self) -> IOResult<usize> {
        println!("parsing {}", self.path);

        let source_file = self
            .source_map
            .load_file(Path::new(self.path))
            .attach_printable_lazy(|| format!("cannot load input file: {}", self.path))?;

        let lexer = Lexer::new(
            Syntax::Typescript(Default::default()),
            EsVersion::EsNext,
            StringInput::from(&*source_file),
            Some(&self.comments),
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
        // when first none-import is read, imports are transferred
        // to an Rc and fixed
        let mut imports = ParseImportState::new();
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
                    if !imports.check_and_add(|| self.parse_import(import)) {
                        self.emit_error(import.span, "imports must be before exported interfaces");
                    }
                }
                // import ... = ..., (opaque)
                ModuleDecl::TsImportEquals(import) => {
                    let ok = imports
                        .check_and_add(|| Some(Import::Opaque(self.raw_source(import.span)?)));
                    if !ok {
                        self.emit_error(import.span, "imports must be before exported interfaces");
                    }
                }
                // export interface
                ModuleDecl::ExportDecl(ExportDecl {
                    decl: Decl::TsInterface(interface),
                    ..
                }) => {
                    let imports = imports.fixed();
                    if let Some(interface) = self.parse_interface(imports, interface) {
                        self.out.insert(interface.name.clone(), interface);
                    }
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

    fn parse_interface(
        &mut self,
        imports: Rc<PatchedImports>,
        interface: &TsInterfaceDecl,
    ) -> Option<Interface> {
        if interface.type_params.is_some() {
            self.emit_error(
                interface.span,
                "interface type parameters are not supported",
            );
            return None;
        }
        if !interface.extends.is_empty() {
            self.emit_error(interface.span, "interface inheritance is not supported");
            return None;
        }
        let name = interface.id.sym.to_string();
        let comment = self.parse_comments_at_pos(interface.span.lo());
        let mut output = Interface::new(name, self.filename.clone(), comment, imports);

        ParseInterface::from(self, &mut output).parse(&interface.body.body);

        Some(output)
    }

    fn emit_error<T: std::fmt::Display>(&mut self, span: Span, msg: T) {
        self.handler
            .struct_span_err(span, &format!("[workex] {msg}"))
            .emit();
        self.errors += 1;
    }

    fn parse_comments_at_pos(&self, pos: BytePos) -> CommentBlock {
        self.comments
            .with_leading(pos, parse_comment)
            .unwrap_or_default()
    }
}

struct ParseInterface<'a, 'b, 'c, 'd> {
    ctx: &'c mut ParseFile<'a, 'b>,
    functions: BTreeMap<String, Function>,
    interface: &'d mut Interface,
}

impl<'a, 'b> Deref for ParseInterface<'a, 'b, '_, '_> {
    type Target = ParseFile<'a, 'b>;

    fn deref(&self) -> &Self::Target {
        self.ctx
    }
}

impl DerefMut for ParseInterface<'_, '_, '_, '_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ctx
    }
}

impl<'a, 'b, 'c, 'd> ParseInterface<'a, 'b, 'c, 'd> {
    pub fn from(ctx: &'c mut ParseFile<'a, 'b>, interface: &'d mut Interface) -> Self {
        Self {
            ctx,
            functions: BTreeMap::new(),
            interface,
        }
    }

    pub fn parse(mut self, items: &[TsTypeElement]) {
        for item in items {
            if let Some(func) = self.parse_function(item) {
                self.functions.insert(func.name.clone(), func);
            }
        }
        self.interface
            .functions
            .extend(self.functions.into_values());
    }

    pub fn parse_function(&mut self, item: &TsTypeElement) -> Option<Function> {
        // filter out unsupported syntax
        let method = match item {
            TsTypeElement::TsCallSignatureDecl(x) => {
                self.emit_error(
                    x.span,
                    "call signatures are not supported. Please specify method name",
                );
                return None;
            }
            TsTypeElement::TsConstructSignatureDecl(x) => {
                self.emit_error(x.span, "construct signatures are not supported. Please change the method name to something other than `new`");
                return None;
            }
            TsTypeElement::TsGetterSignature(x) => {
                self.emit_error(x.span, "getter signatures are not supported.");
                return None;
            }
            TsTypeElement::TsSetterSignature(x) => {
                self.emit_error(x.span, "setter signatures are not supported.");
                return None;
            }
            TsTypeElement::TsIndexSignature(x) => {
                self.emit_error(x.span, "index signatures are not supported.");
                return None;
            }
            TsTypeElement::TsPropertySignature(x) => {
                self.emit_error(x.span, "property signatures are yet not supported. Please change to method declaration");
                return None;
            }
            TsTypeElement::TsMethodSignature(method) => method,
        };
        if method.optional {
            self.emit_error(method.span, "optional methods are not supported");
            return None;
        }
        if method.type_params.is_some() {
            self.emit_error(method.span, "method type parameters are not supported");
            return None;
        }
        let return_type = match &method.type_ann {
            Some(x) => x,
            None => {
                self.emit_error(
                    method.span,
                    "missing return type annotation. Return type must be a Promise",
                );
                return None;
            }
        };
        let workex_promise_ident = self.interface.imports.send.workex_promise_ident.clone();
        let not_promise_message = || {
            format!("return type must be a {workex_promise_ident}. You might need to import it from \"workex\". See README for more info.")
        };
        let return_param = match return_type.type_ann.as_ref() {
            TsType::TsTypeRef(x) => {
                match &x.type_name {
                    TsEntityName::Ident(x) if x.sym.as_str() == workex_promise_ident => {
                        // ok
                    }
                    _ => {
                        self.emit_error(x.span, not_promise_message());
                        return None;
                    }
                };
                // get the inner return type
                match &x.type_params {
                    None => {
                        self.emit_error(
                            x.span,
                            format!("missing inner return type for {workex_promise_ident}"),
                        );
                        return None;
                    }
                    Some(x) => {
                        let t = self.raw_source(x.span)?;
                        if t.is_empty() {
                            self.emit_error(
                                x.span,
                                format!("inner type for {workex_promise_ident} cannot be empty"),
                            );
                            return None;
                        }
                        t
                    }
                }
            }
            _ => {
                self.emit_error(return_type.span, not_promise_message());
                return None;
            }
        };

        let args = method
            .params
            .iter()
            .filter_map(|arg| self.parse_function_arg(arg))
            .collect();
        let name = match method.key.as_ref() {
            Expr::Ident(x) => x.sym.to_string(),
            _ => {
                self.emit_error(method.span, "method name must be an identifier");
                return None;
            }
        };
        Some(Function {
            name,
            comment: self.parse_comments_at_pos(method.span.lo()),
            return_param,
            args,
        })
    }

    fn parse_function_arg(&mut self, arg: &TsFnParam) -> Option<Arg> {
        let ident = match arg {
            TsFnParam::Ident(x) => x,
            TsFnParam::Array(x) => {
                self.emit_error(
                    x.span,
                    "array destructuring in function declaration is not supported",
                );
                return None;
            }
            TsFnParam::Object(x) => {
                self.emit_error(x.span, "object destructuring is not supported");
                return None;
            }
            TsFnParam::Rest(x) => {
                self.emit_error(x.span, "rest object destructuring is not supported");
                return None;
            }
        };
        let type_ = match &ident.type_ann {
            Some(x) => self.raw_source(x.type_ann.span())?,
            None => {
                self.emit_error(ident.span, "missing type annotation for function argument");
                return None;
            }
        };
        Some(Arg {
            ident: ident.id.sym.to_string(),
            optional: ident.id.optional,
            type_,
        })
    }
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

enum ParseImportState {
    Importing(Vec<Import>),
    Fixed(Rc<PatchedImports>),
}
impl ParseImportState {
    pub fn new() -> Self {
        Self::Importing(Vec::new())
    }

    #[must_use]
    pub fn check_and_add<F: FnOnce() -> Option<Import>>(&mut self, f: F) -> bool {
        match self {
            Self::Importing(imports) => {
                if let Some(import) = f() {
                    imports.push(import);
                }
                true
            }
            Self::Fixed(_) => false,
        }
    }

    pub fn fixed(&mut self) -> Rc<PatchedImports> {
        match self {
            Self::Importing(x) => {
                let rc = Rc::new(std::mem::take(x).into());
                *self = Self::Fixed(Rc::clone(&rc));
                rc
            }
            Self::Fixed(imports) => Rc::clone(imports),
        }
    }
}
