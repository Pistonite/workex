/// An argument, with an identifier, type, and optional flag
#[derive(Debug)]
pub struct Arg {
    pub ident: String,
    pub optional: bool,
    pub typ: String,
}

impl Arg {
    /// Convert this argument to a TypeScript code
    pub fn to_code(&self) -> String {
        if self.optional {
            format!("{}?: {}", self.ident, self.typ)
        } else {
            format!("{}: {}", self.ident, self.typ)
        }
    }
}
