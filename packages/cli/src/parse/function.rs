use swc_common::{Span, Spanned as _};
use swc_core::ecma::ast::{Expr, TsEntityName, TsFnParam, TsType, TsTypeAnn, TsTypeElement};

use super::contexts::InterfaceContext;

use crate::ir;

impl InterfaceContext<'_, '_> {
    /// Parse a function in the interface into IR
    pub fn parse_function(&mut self, item: &TsTypeElement) -> Option<ir::Function> {
        // filter out unsupported syntax
        let method = match item {
            TsTypeElement::TsCallSignatureDecl(x) => {
                self.emit_error(x.span, "function: call signature not supported");
                return None;
            }
            TsTypeElement::TsConstructSignatureDecl(x) => {
                self.emit_error(x.span, "function: construct signature is not supported.");
                return None;
            }
            TsTypeElement::TsGetterSignature(x) => {
                self.emit_error(x.span, "function: getter signature is not supported.");
                return None;
            }
            TsTypeElement::TsSetterSignature(x) => {
                self.emit_error(x.span, "function: setter signature is not supported.");
                return None;
            }
            TsTypeElement::TsIndexSignature(x) => {
                self.emit_error(x.span, "function: index signature is not supported.");
                return None;
            }
            TsTypeElement::TsPropertySignature(x) => {
                self.emit_error(x.span, "function: property signature is currently not supported. Please change to method declaration");
                return None;
            }
            TsTypeElement::TsMethodSignature(method) => method,
        };
        if method.optional {
            self.emit_error(method.span, "functin: optional methods are not supported");
            return None;
        }
        if method.type_params.is_some() {
            self.emit_error(
                method.span,
                "function: method type parameters are not supported",
            );
            return None;
        }

        let name = match method.key.as_ref() {
            Expr::Ident(x) => x.sym.to_string(),
            _ => {
                self.emit_error(method.span, "function: method name must be an identifier");
                return None;
            }
        };

        let retty_ann = self.parse_function_retty_ann(method.span, method.type_ann.as_deref())?;

        let args = method
            .params
            .iter()
            .filter_map(|arg| self.parse_function_arg(arg))
            .collect();

        Some(ir::Function {
            name,
            comment: self.parse_doc_comments_at_pos(method.span.lo()),
            retty_ann,
            args,
        })
    }

    /// Parse the function's return type. Returns the inner type inside WxPromise<T>, with the
    /// angle brackets included.
    fn parse_function_retty_ann(
        &mut self,
        span: Span,
        type_ann: Option<&TsTypeAnn>,
    ) -> Option<String> {
        let Some(type_ann) = type_ann else {
            self.emit_error(span, "function: missing return type annotation.");
            return None;
        };

        let TsType::TsTypeRef(type_ref) = type_ann.type_ann.as_ref() else {
            self.emit_invalid_retty_error(type_ann.span);
            return None;
        };

        // outer type must be WxPromise
        if !matches!(&type_ref.type_name, TsEntityName::Ident(x) if x.sym.as_str() == self.imports.ident_wxpromise)
        {
            self.emit_invalid_retty_error(type_ref.span);
            return None;
        }

        let Some(inner_type) = &type_ref.type_params else {
            self.emit_invalid_retty_error(type_ref.span);
            return None;
        };

        let retty_ann = self.raw_source(inner_type.span)?;
        // sanity check that the type is not empty
        if retty_ann.is_empty() {
            self.emit_invalid_retty_error(inner_type.span);
            return None;
        }
        Some(retty_ann)
    }

    fn emit_invalid_retty_error(&mut self, span: Span) {
        self.emit_error(
            span,
            "function: return type must be a WxPromise<T>. You might need to import it from \"@pistonite/workex\". The import can be renamed, but type alias is otherwise not supported.",
        );
    }

    /// Parse a function's argument into IR
    fn parse_function_arg(&mut self, arg: &TsFnParam) -> Option<ir::Arg> {
        let ident = match arg {
            TsFnParam::Ident(x) => x,
            TsFnParam::Array(x) => {
                self.emit_error(
                    x.span,
                    "function argument: array destructuring is not supported",
                );
                return None;
            }
            TsFnParam::Object(x) => {
                self.emit_error(
                    x.span,
                    "function argument: object destructuring is not supported",
                );
                return None;
            }
            TsFnParam::Rest(x) => {
                self.emit_error(
                    x.span,
                    "function argument: rest object destructuring is not supported",
                );
                return None;
            }
        };
        let typ = match &ident.type_ann {
            Some(x) => self.raw_source(x.type_ann.span())?,
            None => {
                self.emit_error(ident.span, "missing type annotation for function argument");
                return None;
            }
        };
        Some(ir::Arg {
            ident: ident.id.sym.to_string(),
            optional: ident.id.optional,
            typ,
        })
    }
}
