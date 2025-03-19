use swc_core::ecma::ast::{ImportDecl, ImportSpecifier, ModuleDecl, ModuleExportName, ModuleItem};

use super::contexts::FileContext;

use crate::ir;

impl FileContext<'_> {
    /// Parse the supported import statements from the module
    pub fn parse_imports(&mut self, items: &[ModuleItem]) -> ir::Imports {
        let mut imports = Vec::new();

        for item in items {
            // skip statements
            let ModuleItem::ModuleDecl(item) = item else {
                continue;
            };

            match item {
                // import
                ModuleDecl::Import(import) => {
                    if let Some(import) = self.parse_import(import) {
                        imports.push(import);
                    }
                }
                // import ... = ..., (opaque)
                ModuleDecl::TsImportEquals(import) => {
                    if let Some(source) = self.raw_source(import.span) {
                        imports.push(ir::Import::Opaque(source));
                    }
                }
                _ => continue,
            }
        }

        ir::Imports::new(imports)
    }

    /// Parse JS import declaration into IR import
    fn parse_import(&mut self, import: &ImportDecl) -> Option<ir::Import> {
        if import.with.is_some() {
            // not sure how to handle with imports, just treat them as opaque
            return Some(ir::Import::Opaque(self.raw_source(import.span)?));
        }

        let mut idents = Vec::with_capacity(import.specifiers.len());
        for ident in &import.specifiers {
            match self.parse_import_ident(ident) {
                Some(ident) => idents.push(ident),
                None => {
                    // not interested in this import, treat it as opaque
                    return Some(ir::Import::Opaque(self.raw_source(import.span)?));
                }
            }
        }

        Some(ir::Import::Import {
            is_type: import.type_only,
            idents,
            from: import.src.value.to_string(),
        })
    }

    /// Parse one specifier/ident in an import declaration.
    /// Return None if we don't understand the syntax
    fn parse_import_ident(&self, ident: &ImportSpecifier) -> Option<ir::ImportIdent> {
        let ident = match ident {
            ImportSpecifier::Named(x) => x,
            _ => return None,
        };
        match &ident.imported {
            Some(ModuleExportName::Ident(x)) => Some(ir::ImportIdent {
                is_type: ident.is_type_only,
                ident: x.sym.to_string(),
                rename: Some(ident.local.sym.to_string()),
            }),
            None => Some(ir::ImportIdent {
                is_type: ident.is_type_only,
                ident: ident.local.sym.to_string(),
                rename: None,
            }),
            _ => None,
        }
    }
}
