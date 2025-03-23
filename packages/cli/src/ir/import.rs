use codize::{Code, cblock, cconcat, clist};
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
        let (_, ident_wxhandler) = imports.add_workex_type_import("WxBusRecvHandler");
        let (_, ident_wxsender) = imports.add_workex_type_import("WxProtocolBoundSender");
        imports.adjust_relative_to_from_parent();
        Self {
            inner: imports,
            ident_wxhandler,
            ident_wxsender,
        }
    }
}

/// All import statements in a module
#[derive(Debug, Clone)]
pub struct Imports {
    /// All import statements
    statements: Vec<Import>,
    /// Identifier for `WxPromise`
    pub ident_wxpromise: String,
    /// Check if WxPromise exists in the original imports
    pub was_wxpromise_imported: bool,
}

impl Imports {
    pub fn new(statements: Vec<Import>) -> Self {
        let mut imports = Self {
            statements,
            was_wxpromise_imported: false,
            ident_wxpromise: String::new(),
        };
        // make sure the WxPromise import is available
        let (added, ident) = imports.add_workex_type_import("WxPromise");
        imports.ident_wxpromise = ident;
        imports.was_wxpromise_imported = !added;
        imports
    }

    /// Add a workex type import to existing imports if it doesn't exist yet,
    /// and return the type identifier to use in code.
    ///
    /// The returned bool indicates if the new import was added instead of already exists
    pub fn add_workex_type_import(&mut self, ident: &str) -> (bool, String) {
        match self.statements.iter_mut().find(|x| x.is_workex()) {
            Some(Import::Import { idents, .. }) => {
                // if the import already exists, just return the ident
                for x in idents.iter() {
                    if x.ident == ident {
                        return (false, x.active_ident().to_string());
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
                (true, ident.to_string())
            }
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
                (true, ident.to_string())
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

    pub fn to_code(&self) -> Code {
        cconcat!(self.statements.iter().map(|x| x.to_code())).into()
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
    pub fn to_code(&self) -> Code {
        match self {
            Self::Opaque(s) => s.to_string().into(),
            Self::Import {
                is_type,
                idents,
                from,
            } => cblock! {
                if *is_type { "import type {" } else { "import {" }, [
                clist!("," => idents.iter().map(|x| x.to_repr(*is_type))).inlined()
            ], format!("}} from \"{}\";", from)
            }
            .into(),
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
    pub fn to_repr(&self, is_in_type_import: bool) -> String {
        let name_part = if let Some(rename) = &self.rename {
            format!("{} as {rename}", self.ident)
        } else {
            self.ident.clone()
        };
        if self.is_type && !is_in_type_import {
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
