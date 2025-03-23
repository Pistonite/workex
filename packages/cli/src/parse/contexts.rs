use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{Context as _, bail};

use derive_more::{Deref, DerefMut};
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::Handler;
use swc_common::sync::Lrc;
use swc_common::{SourceFile, SourceMap, Spanned};
use swc_core::ecma::ast::{Decl, EsVersion, ModuleDecl, ModuleItem, TsInterfaceDecl};
use swc_ecma_parser::lexer::Lexer;
use swc_ecma_parser::{Parser, StringInput, Syntax};

use crate::ir;

/// Parsing context state for all input files
pub struct Context {
    /// SWC source map
    pub source_map: Lrc<SourceMap>,
    /// SWC error handler
    pub handler: Handler,

    /// Tracks how many errors are discovered during parsing
    pub errors: usize,
}

impl Default for Context {
    fn default() -> Self {
        let source_map: Lrc<SourceMap> = Default::default();
        let handler = Handler::with_tty_emitter(
            swc_common::errors::ColorConfig::Auto,
            true,
            false,
            Some(source_map.clone()),
        );

        Self {
            source_map,
            errors: 0,
            handler,
        }
    }
}

impl Context {
    pub fn parse(mut self, inputs: &[String]) -> anyhow::Result<BTreeMap<String, ir::Interface>> {
        let mut out = BTreeMap::new();
        for input in inputs {
            let file_ctx = FileContext::try_new(&mut self, input)
                .context(format!("Failed to load file: {}", input))?;
            file_ctx.parse(&mut out);
        }

        if self.errors > 0 {
            bail!("Found {} errors while parsing input files", self.errors);
        }

        Ok(out)
    }
}

/// Parsing context state for a single input file
#[derive(Deref, DerefMut)]
pub struct FileContext<'a> {
    /// Inner context
    #[deref]
    #[deref_mut]
    ctx: &'a mut Context,

    /// Source file tracked by SWC
    source_file: Lrc<SourceFile>,

    /// Name of the file. Used to generate import statements
    filename: String,

    /// SWC store for comments, so documentation comments can be preserved
    /// in the generated code
    pub comments: SingleThreadedComments,
}

impl<'a> FileContext<'a> {
    /// Create a new file parsing context and load the file
    pub fn try_new(ctx: &'a mut Context, path: &str) -> anyhow::Result<Self> {
        let path = Path::new(path);

        let Some(filename) = path.file_name() else {
            bail!("Failed to get file name from path: {}", path.display());
        };

        let Some(filename) = filename.to_str() else {
            bail!("File name must be valid UTF-8");
        };

        if filename.ends_with(".bus.ts") {
            bail!(".bus.ts is a reserved file extension for generated files.");
        }

        let comments = SingleThreadedComments::default();

        let source_file = ctx
            .source_map
            .load_file(path)
            .context("Failed to load input file into parser")?;

        Ok(Self {
            ctx,
            source_file,
            filename: filename.to_string(),
            comments,
        })
    }

    /// Parses the interfaces in the file and adds them to the output
    pub fn parse(mut self, out: &mut BTreeMap<String, ir::Interface>) {
        let lexer = Lexer::new(
            Syntax::Typescript(Default::default()),
            EsVersion::EsNext,
            StringInput::from(&*self.source_file),
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
                    return;
                }
                module
            }
            Err(e) => {
                e.into_diagnostic(&self.handler).emit();
                return;
            }
        };

        let imports = self.parse_imports(&module.body);

        for item in module.body {
            // skip statements
            let ModuleItem::ModuleDecl(item) = item else {
                continue;
            };

            // only check `export interface`
            let ModuleDecl::ExportDecl(item) = item else {
                // ignore other syntaxes, including namespace exports and modules,
                // which might have interfaces inside them, but it's too complicated
                // for now
                continue;
            };

            let comments = self.parse_doc_comments_at_pos(item.span.lo());

            let Decl::TsInterface(item) = item.decl else {
                continue;
            };

            let filename = self.filename.clone();
            let interface_ctx = InterfaceContext::new(&mut self, imports.clone());

            if let Some(interface) = interface_ctx.parse(filename, &item, comments) {
                if let Some(old) = out.insert(interface.name.clone(), interface) {
                    self.emit_error(
                        item.span,
                        format!("duplicate interface name: {}. Interface names must be unique across all input files", old.name),
                    );
                }
            }
        }
    }
}

/// Parsing context state for a single interface in a file
#[derive(Deref, DerefMut)]
pub struct InterfaceContext<'a, 'b> {
    #[deref]
    #[deref_mut]
    ctx: &'b mut FileContext<'a>,
    /// Imports parsed from original file
    pub imports: ir::Imports,
}

impl<'a, 'b> InterfaceContext<'a, 'b> {
    pub fn new(ctx: &'b mut FileContext<'a>, imports: ir::Imports) -> Self {
        Self { ctx, imports }
    }

    pub fn parse(
        mut self,
        filename: String,
        item: &TsInterfaceDecl,
        comments: ir::CommentBlock,
    ) -> Option<ir::Interface> {
        if item.type_params.is_some() {
            self.emit_error(item.span, "interface type parameters are not supported");
            return None;
        }
        if !item.extends.is_empty() {
            self.emit_error(item.span, "interface inheritance is not supported");
            return None;
        }

        let name = item.id.sym.to_string();
        if name.starts_with("_wx") {
            self.emit_error(
                item.span,
                "interface names cannot start with `_wx` to avoid conflict with generated code",
            );
            return None;
        }

        // disallow empty interface - they should use the builtin stub instead
        if item.body.body.is_empty() {
            self.emit_error(item.span, "empty interfaces are not allowed. If you want a one-direction connection, simply omit the --link option for your interface.");
            return None;
        }

        let mut functions = BTreeMap::new();

        for member in &item.body.body {
            if let Some(f) = self.parse_function(member) {
                if let Some(old) = functions.insert(f.name.clone(), f) {
                    self.emit_error(
                        member.span(),
                        format!(
                            "duplicate function name in interface {}: {}",
                            name, old.name
                        ),
                    );
                }
            }
        }

        Some(ir::Interface::new(
            name,
            filename,
            comments,
            self.imports,
            functions.into_values().collect(),
        ))
    }
}
