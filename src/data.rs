use std::{path::PathBuf, rc::Rc};

use codize::{cblock, cconcat, clist, Code};

#[derive(Debug)]
pub struct Package {
    /// All interfaces in the package, sorted by name
    pub interfaces: Vec<Interface>,
    /// Protocol expression for the package (from the CLI input)
    pub protocol: String,
    /// Output directory for the generated files (inferred from input files)
    pub out_dir: PathBuf,
}

#[derive(Debug)]
pub struct Interface {
    /// The name for this interface
    pub name: String,
    /// File name where the interface is defined, including the extension.
    /// This is for generating the `import` statements to import this interface
    pub filename: String,
    /// The comment block for this interface
    pub comment: CommentBlock,
    /// Original import statements from the source file
    pub imports: Rc<PatchedImports>,
    /// All functions in the interface, sorted by name
    pub functions: Vec<Function>,
}

impl Interface {
    pub fn new(
        name: String,
        filename: String,
        comment: CommentBlock,
        imports: Rc<PatchedImports>,
    ) -> Self {
        Self {
            name,
            filename,
            comment,
            imports,
            functions: Vec::new(),
        }
    }
    pub fn to_funcid_set(&self, set_ident: &str, funcid_enum: &str) -> Code {
        cblock! {
            format!("const {set_ident} = new Set<{funcid_enum}>(["),
            [clist!("," => self.functions.iter().map(|f| {
                format!("{funcid_enum}.{}_{}", self.name, f.name)
            }))],
            "]);"
        }
        .into()
    }
}

#[derive(Debug)]
pub struct PatchedImports {
    pub original: Vec<Import>,
    pub send: PatchedSendImports,
}

impl From<Vec<Import>> for PatchedImports {
    #[inline]
    fn from(imports: Vec<Import>) -> Self {
        Self::from_imports(imports)
    }
}

impl PatchedImports {
    pub fn from_imports(imports: Vec<Import>) -> Self {
        let send = Self::make_send_imports(&imports);
        Self {
            original: imports,
            send,
        }
    }
    /// Patch the original imports to include the Workex imports for send if not already included
    /// - WorkexClient
    /// - WorkexClientOptions
    /// - WorkexPromise
    fn make_send_imports(imports: &[Import]) -> PatchedSendImports {
        let mut imports = imports.to_vec();
        let idents = match imports.iter_mut().find(|x| x.is_workex()) {
            Some(Import::Import {
                is_type, idents, ..
            }) => {
                // turn off type import on the outer level
                // since we need to add the WorkexClient import
                if *is_type {
                    *is_type = false;
                    for ident in idents.iter_mut() {
                        ident.is_type = true;
                    }
                }
                idents
            }
            _ => {
                // add a new import statement
                imports.push(Import::Import {
                    is_type: false,
                    idents: vec![
                        ImportIdent::workex_client(),
                        ImportIdent::workex_client_options(),
                        ImportIdent::workex_promise(),
                    ],
                    from: "workex".to_string(),
                });
                return PatchedSendImports {
                    workex_promise_ident: "WorkexPromise".to_string(),
                    workex_client_ident: "WorkexClient".to_string(),
                    workex_client_options_ident: "WorkexClientOptions".to_string(),
                    imports,
                };
            }
        };

        let workex_client_ident = match idents.iter().find(|x| x.ident == "WorkexClient") {
            Some(x) => x.active_ident().to_string(),
            None => {
                idents.push(ImportIdent::workex_client());
                "WorkexClient".to_string()
            }
        };

        let workex_client_options_ident =
            match idents.iter().find(|x| x.ident == "WorkexClientOptions") {
                Some(x) => x.active_ident().to_string(),
                None => {
                    idents.push(ImportIdent::workex_client_options());
                    "WorkexClientOptions".to_string()
                }
            };

        let workex_promise_ident = match idents.iter().find(|x| x.ident == "WorkexPromise") {
            Some(x) => x.active_ident().to_string(),
            None => {
                idents.push(ImportIdent::workex_promise());
                "WorkexPromise".to_string()
            }
        };

        PatchedSendImports {
            workex_promise_ident,
            workex_client_ident,
            workex_client_options_ident,
            imports,
        }
    }

}

/// Patched imports for the *.send.ts files
#[derive(Debug, Clone, PartialEq)]
pub struct PatchedSendImports {
    /// Identifier for WorkexPromise
    pub workex_promise_ident: String,
    /// Identifier for WorkexClient
    pub workex_client_ident: String,
    /// Identifier for WorkexClientOptions
    pub workex_client_options_ident: String,
    /// All import statements
    pub imports: Vec<Import>,
}

/// An `import` statement
#[derive(Debug, Clone, PartialEq)]
pub enum Import {
    /// An unparsed import because it contains unsupported syntax
    Opaque(String),
    /// A regular parsed import
    Import {
        /// If the import has the `type` keyword (`import type`)
        is_type: bool,
        /// The identifiers in the import block
        idents: Vec<ImportIdent>,
        /// The string in the `from` part of the import statement
        from: String,
    },
}

fn should_inline_import_list(x: &codize::List) -> bool {
    x.body().len() <= 3
}

impl Import {
    /// Return if this import is `import type? { ... } from "workex"`
    pub fn is_workex(&self) -> bool {
        match self {
            Self::Opaque(_) => false,
            Self::Import { from, .. } => from == "workex",
        }
    }
    /// Emit code for this import
    pub fn to_code(&self) -> Code {
        match self {
            Self::Opaque(s) => s.to_string().into(),
            Self::Import { is_type, idents, from } => {
                cblock! {
                    if *is_type { "import type {" } else { "import {" },
                    [
                    clist!("," => idents.iter().map(|x| x.to_repr())).inline_when(should_inline_import_list)
                ],
                    format!("}} from \"{}\";", from)
                }.into()
            }
        }
    }
}

/// An identifier in an import statement, such as `Foo as FooRenamed`
#[derive(Debug, Clone, PartialEq)]
pub struct ImportIdent {
    /// Whether the import has the `type` keyword
    pub is_type: bool,
    /// The identifier for the import
    pub ident: String,
    /// The identifier to rename the import to
    pub rename: Option<String>,
}

impl ImportIdent {
    pub fn workex_client() -> Self {
        Self {
            is_type: false,
            ident: "WorkexClient".to_string(),
            rename: None,
        }
    }

    pub fn workex_client_options() -> Self {
        Self {
            is_type: true,
            ident: "WorkexClientOptions".to_string(),
            rename: None,
        }
    }

    pub fn workex_promise() -> Self {
        Self {
            is_type: true,
            ident: "WorkexPromise".to_string(),
            rename: None,
        }
    }

    pub fn to_repr(&self) -> String {
        let name_part = if let Some(rename) = &self.rename {
            format!("{} as {rename}", self.ident)
        } else {
            self.ident.clone()
        };
        if self.is_type {
            format!("type {name_part}")
        } else {
            name_part
        }
    }

    /// Get the identifier to use in code
    pub fn active_ident(&self) -> &str {
        self.rename.as_deref().unwrap_or(&self.ident)
    }
}

/// Data for a function inside an interface
#[derive(Debug)]
pub struct Function {
    pub name: String,
    /// The comment block for this function
    pub comment: CommentBlock,
    /// Arguments for the function
    pub args: Vec<Arg>,
    /// The return type parameter inside WorkexPromise, with surrounding `<>`
    pub return_param: String,
}

fn should_inline_arg_list(args: &codize::List) -> bool {
    args.body().len() <= 3
}

impl Function {
    pub fn to_send_function(&self, funcid_expr: &str, workex_promise_ident: &str) -> Code {
        let comment = self.comment.to_code();
        let call = if self.return_param == "<void>" {
            "postVoid".to_string()
        } else {
            format!("post{}", self.return_param)
        };

        let function_decl = cblock! {
            format!("public {}(", self.name),
            [clist!("," => self.args.iter().map(|arg| arg.to_arg())).inline_when(should_inline_arg_list)],
            format!("): {workex_promise_ident}{}", self.return_param)
        };

        let function_body = cblock! {
            "{",
            [cblock! {
                format!("return this.client.{call}({funcid_expr}, ["),
                [clist!("," => self.args.iter().map(|arg| arg.ident.as_str())).inline_when(should_inline_arg_list)],
                "]);"
            }],
            "}"
        }.connected().never_inlined();

        cconcat!["", comment, function_decl, function_body].into()
    }

    pub fn to_recv_case(
        &self,
        funcid_expr: &str,
        delegate_ident: &str,
        payload_ident: &str,
    ) -> Code {
        let arg_list = clist!("," => (0..self.args.len()).map(|x| format!("a{x}"))).inlined();
        let call: Code = if self.args.is_empty() {
            format!("return {delegate_ident}.{}();", self.name).into()
        } else {
            cconcat![
                cblock! {
                    "const [",
                    [arg_list.clone()],
                    format!("] = {payload_ident};")
                },
                cblock! {
                    format!("return {delegate_ident}.{}(", self.name),
                    [arg_list],
                    ");"
                }
            ]
            .into()
        };
        cblock! {
            format!("case {funcid_expr}: {{"),
            [call],
            "}"
        }
        .into()
    }
}

/// A block on comments
#[derive(Debug)]
pub struct CommentBlock {
    /// The style of the comment block
    pub style: CommentStyle,
    /// Raw comment lines without the syntax
    pub lines: Vec<String>,
}

impl Default for CommentBlock {
    fn default() -> Self {
        Self {
            style: CommentStyle::TripleSlash,
            lines: Vec::new(),
        }
    }
}

impl CommentBlock {
    pub fn to_code(&self) -> Code {
        match self.style {
            CommentStyle::TripleSlash => {
                cconcat!(self.lines.iter().map(|line| format!("/// {line}"))).into()
            }
            CommentStyle::JsDoc => cconcat![
                "/**",
                cconcat!(self.lines.iter().map(|line| {
                    if line.starts_with("* ") {
                        format!(" {line}")
                    } else {
                        format!(" * {line}")
                    }
                })),
                " */"
            ]
            .into(),
        }
    }
}

/// Style of a comment block
#[derive(Debug)]
pub enum CommentStyle {
    /// `///` comments
    TripleSlash,
    /// `/** ... */` comments
    JsDoc,
}

#[derive(Debug)]
pub struct Arg {
    pub ident: String,
    pub optional: bool,
    pub type_: String,
}

impl Arg {
    /// Convert this argument to a TypeScript function argument
    pub fn to_arg(&self) -> String {
        let ident_part = if self.optional {
            format!("{}?", self.ident)
        } else {
            self.ident.clone()
        };

        format!("{}: {}", ident_part, self.type_)
    }
}

pub type IOResult<T> = error_stack::Result<T, std::io::Error>;
pub fn io_err<T: Into<String>>(msg: T) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, msg.into())
}
