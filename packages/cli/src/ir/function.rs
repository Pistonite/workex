use codize::{Code, cblock, cconcat, clist};

use crate::ir;

/// Data for a function inside an interface
#[derive(Debug)]
pub struct Function {
    pub name: String,
    /// The documentation comment block for this function
    pub comment: ir::CommentBlock,
    /// Arguments for the function
    pub args: Vec<ir::Arg>,
    /// The return type parameter annotation inside WxPromise, with surrounding `<>`
    pub retty_ann: String,
}

impl Function {
    /// Generate code for implementation in the sender impl class
    pub fn to_send_function(&self, funcid_expr: &str, ident_wxpromise: &str) -> Code {
        let comment = self.comment.to_code();
        let is_void_return = self.retty_ann == "<void>";

        let function_decl = cblock! {
            format!("public {}(", self.name),
            [clist!("," => self.args.iter().map(|arg| arg.to_code())).inlined()],
            format!("): {}{}", ident_wxpromise, self.retty_ann)
        };

        let function_body = cblock! {
            "{",
            [cblock! {
                if is_void_return {
                    format!("return this.sender.sendVoid({}, [", funcid_expr)
                } else {
                    format!("return this.sender.send{}({}, [", self.retty_ann, funcid_expr)
                },
                [clist!("," => self.args.iter().map(|arg| arg.ident.as_str())).inlined()],
                "]);"
            }],
            "}"
        }
        .connected()
        .never_inlined();

        match comment {
            Some(comment) => cconcat!["", comment, function_decl, function_body].into(),
            None => cconcat!["", function_decl, function_body].into(),
        }
    }

    /// Generate code for implementation in the receiver "switch" statement
    ///
    /// Note the implementation uses switch statement. In my testing,
    /// switch statement is much faster than an array of functions even for 30 functions,
    /// in both JSC (bun) and V8 (deno). Since it's unlikely for me to write more than 30 functions
    /// in a single interface, we only use switch statement for now. However it will be interesting
    /// to see in the future at how many functions does the array of functions becomes better on
    /// average
    pub fn to_recv_switch_case(&self, funcid_expr: &str) -> Code {
        let arg_list = clist!("," => (0..self.args.len()).map(|x| format!("a{x}"))).inlined();
        let call: Code = if self.args.is_empty() {
            format!("return handler.{}();", self.name).into()
        } else {
            cconcat![
                cblock! {
                    "const [",
                    [arg_list.clone()],
                    format!("] = args;")
                },
                cblock! {
                    format!("return handler.{}(", self.name),
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
