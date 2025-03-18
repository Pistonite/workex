use super::contexts::InterfaceContext;

impl InterfaceContext<'_, '_> {
    /// Parse
    pub fn parse_function_arg(&mut self, arg: &TsFnParam) -> Option<Arg> {
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
