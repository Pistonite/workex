use crate::ir;

#[derive(Debug)]
pub struct Interface {
    /// The name for this interface
    pub name: String,

    /// File name where the interface is defined, including the extension.
    /// This is for generating the `import` statements to import this interface
    pub filename: String,

    /// The comment block for this interface
    pub comment: ir::CommentBlock,

    /// Import statements from the source file, adjusted to use in the generated implementation
    /// file
    pub impl_imports: ir::ImplImports,

    /// Import statements from the source file, adjusted to use in the generated bus implementation
    /// file
    pub bus_imports: ir::BusImports,

    /// All functions in the interface, sorted by name
    pub functions: Vec<ir::Function>,
}

impl Interface {
    pub fn new(
        name: String,
        filename: String,
        comment: ir::CommentBlock,
        imports: ir::Imports,
        functions: Vec<ir::Function>,
    ) -> Self {
        let impl_imports = ir::ImplImports::new(imports.clone());
        let bus_imports = ir::BusImports::new(imports);
        Self {
            name,
            filename,
            comment,
            impl_imports,
            bus_imports,
            functions
        }
    }
}
