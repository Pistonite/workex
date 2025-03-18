use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{bail, Context as _};

use derive_more::{Deref, DerefMut};
use swc_common::comments::{Comment, CommentKind, SingleThreadedComments};
use swc_common::errors::Handler;
use swc_common::sync::Lrc;
use swc_common::{BytePos, SourceFile, SourceMap, Span, Spanned};
use swc_core::ecma::ast::{
    Decl, EsVersion, ExportDecl, Expr, ImportDecl, ImportSpecifier, ModuleDecl, ModuleExportName,
    ModuleItem, TsEntityName, TsFnParam, TsInterfaceDecl, TsType, TsTypeElement,
};
use swc_ecma_parser::lexer::Lexer;
use swc_ecma_parser::{Parser, StringInput, Syntax};

use crate::ir;

/// Parsing context state for all input files
#[derive(Deref, DerefMut)]
pub struct Context {
    /// SWC source map
    #[deref]
    #[deref_mut]
    source_map: Lrc<SourceMap>,
    /// SWC error handler
    pub handler: Handler,
    /// Output interfaces. Using BTreeMap to keep names sorted
    out: BTreeMap<String, ir::Interface>,
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

        let out = BTreeMap::new();
        Self {
            source_map,
            handler,
            out,
        }
    }
}

impl Context {
    pub fn parse(mut self, inputs: &[String]) -> anyhow::Result<Vec<ir::Interface>> {
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

    /// Tracks how many errors are discovered during parsing
    errors: usize,

    /// Name of the file. Used to generate import statements
    filename: String,

    /// SWC store for comments, so documentation comments can be preserved
    /// in the generated code
    comments: SingleThreadedComments,
}

impl<'a> FileContext<'a> {
    pub fn try_new(ctx: &'a mut Context, path: &str) -> anyhow::Result<Self> {
        let path = Path::new(path);

        let Some(filename) = path.file_name() else {
            bail!("Failed to get file name from path: {}", path.display());
        };

        let Some(filename) = filename.to_str() else {
            bail!("File name must be valid UTF-8");
        };

        let comments = SingleThreadedComments::default();

        let source_file = ctx
            .source_map
            .load_file(path).context("Failed to load input file into parser")?;

        Ok(Self {
            ctx,
            source_file,
            errors: 0,
            filename: filename.to_string(),
            comments,
        })
    }
}

/// Parsing context state for a single interface in a file
#[derive(Deref, DerefMut)]
pub struct InterfaceContext<'a, 'b> {
    #[deref]
    #[deref_mut]
    ctx: &'b mut FileContext<'a>,
    functions: BTreeMap<String, ir::Function>,
}

impl<'a, 'b> InterfaceContext<'a, 'b> {
    pub fn new(ctx: &'b mut FileContext<'a>) -> Self {
        Self {
            ctx,
            functions: BTreeMap::new(),
        }
    }

    pub fn parse(mut self, 
        name: String,
        filename: String,
        items: &[TsTypeElement],
        comments: ir::CommentBlock,
        imports: ir::Imports,
    ) -> ir::Interface {
        ir::Interface::new(name, filename, comments, imports, self.functions.into_values().collect())
    }
}
