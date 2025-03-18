use codize::{cblock, clist, Code};
use derive_more::{Deref, DerefMut};

static WORKEX_IMPORT: &str = "@pistonite/workex";

/// Imports used in the generated implementation files
#[derive(Debug, Deref, DerefMut)]
pub struct ImplImports {
    #[deref]
    #[deref_mut]
    inner: Imports,

    /// Identifier for `WxBusRecvHandler`
    pub ident_wxhandler: String,

    /// Identifier for `WxProtocolBoundSender`
    pub ident_wxsender: String,
}

impl ImplImports {
    pub fn new(mut imports: Imports) -> Self {
        let ident_wxhandler = imports.add_workex_type_import("WxBusRecvHandler");
        let ident_wxsender = imports.add_workex_type_import("WxProtocolBoundSender");
        imports.adjust_relative_to_from_parent();
        Self { inner: imports, ident_wxhandler, ident_wxsender }
    }
}

/// Imports used in the generated bus implementation files
#[derive(Debug, Deref, DerefMut)]
pub struct BusImports {
    #[deref]
    #[deref_mut]
    inner: Imports,

    /// Identifier for `WxProtocolBindConfig`
    pub ident_wxconfig: String,
}

impl BusImports {
    pub fn new(mut imports: Imports) -> Self {
        let ident_wxconfig = imports.add_workex_type_import("WxProtocolBindConfig");
        imports.adjust_relative_to_from_parent();
        Self { inner: imports, ident_wxconfig }
    }
}

/// All import statements in a module
#[derive(Debug, Clone)]
pub struct Imports {
    /// All import statements
    statements: Vec<Import>,
    /// Identifier for `WxPromise`
    pub ident_wxpromise: String,
}

impl Imports {
    pub fn new(statements: Vec<Import>) -> Self {
        let mut imports = Self {
            statements,
            ident_wxpromise: String::new(),
        };
        // make sure the WxPromise import is available
        imports.ident_wxpromise = imports.add_workex_type_import("WxPromise");
        imports
    }

    /// Add a workex type import to existing imports if it doesn't exist yet,
    /// and return the type identifier to use in code
    pub fn add_workex_type_import(&mut self, ident: &str) -> String {
        match self.statements.iter_mut().find(|x| x.is_workex()) {
            Some(Import::Import { idents, .. }) => {
                // if the import already exists, just return the ident
                for x in idents.iter() {
                    if x.ident == ident {
                        return x.active_ident().to_string();
                    }
                }
                // add another ident
                // here, it's possible that another import has renamed their ident
                // to what we want to import. to keep things simple, that case is not
                // handled currently
                idents.push(ImportIdent {
                    is_type: true,
                    ident: ident.to_string(),
                    rename: None,
                });
                return ident.to_string();
            },
            _ => {
                // if no import statement matches, add a new statement
                self.statements.push(Import::Import {
                    is_type: true,
                    idents: vec![ImportIdent {
                        is_type: false,
                        ident: ident.to_string(),
                        rename: None,
                    }],
                    from: WORKEX_IMPORT.to_string(),
                });
                return ident.to_string();
            }
        }
    }

    /// Adjust the import paths so that relative paths (starting with ./ or ../) are resolved
    /// from the parent directory (i.e. with ../ added before)
    ///
    /// This is because output files are generated in a subdirectory relative
    /// to the input files.
    ///
    /// It's possible that there are some edge cases that aren't handled here,
    /// however, we are not the bundler. So we just try to do the right thing
    /// for the most time, instead of writing our own emulated bundler logic
    pub fn adjust_relative_to_from_parent(&mut self) {
        for import in &mut self.statements {
            if let Import::Import { from, .. } = import {
                if from.starts_with("./") {
                    *from = format!(".{}", from);
                } else if from.starts_with("../") {
                    *from = format!("../{}", from);
                }
            }
        }
    }
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

impl Import {
    /// Return if this import is `import type? { ... } from "@pistonite/workex"`,
    pub fn is_workex(&self) -> bool {
        match self {
            Self::Opaque(_) => false,
            Self::Import { from, .. } => from == WORKEX_IMPORT,
        }
    }
    /// Emit code for this import
    pub fn to_code(&self, path_prefix: Option<&str>) -> Code {
        match self {
            Self::Opaque(s) => s.to_string().into(),
            Self::Import { is_type, idents, from } => {
                cblock! {
                    if *is_type { "import type {" } else { "import {" },
                    [
                    clist!("," => idents.iter().map(|x| x.to_repr())).inlined()
                ],
                    format!("}} from \"{}{}\";", path_prefix.unwrap_or_default(), from)
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




/// Resolve a relative import path <prefix>/<path>
///
/// If <path> is relative (starts with ./ or ../), it will be appended to <prefix>,
/// otherwise, it will be kept as is
pub fn resolve_relative_import(prefix: &str, path: &str) -> String {
    if path.starts_with("./") || path.starts_with("../") {
        format!("{}/{}", prefix, path)
    } else {
        path.to_string()
    }
}
