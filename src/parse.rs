use std::collections::BTreeMap;
use std::path::Path;

use error_stack::ResultExt;
use swc_common::SourceMap;
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::Handler;
use swc_common::sync::Lrc;
use swc_core::ecma::ast::EsVersion;
use swc_ecma_parser::{Parser, StringInput, Syntax};
use swc_ecma_parser::lexer::Lexer;

use crate::{io_err, IOResult, Interface};


/// Parse the interfaces in the inputs
pub fn parse(inputs: &[String]) -> IOResult<Vec<Interface>> {
    let source_map: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(swc_common::errors::ColorConfig::Auto, 
        true, false, Some(source_map.clone()));

    let mut out = BTreeMap::new();
    for input in inputs {
        parse_file(&source_map, Path::new(input), &handler, &mut out)?;
    }

    Ok(out.into_values().collect())
}

pub fn parse_file(
    source_map: &SourceMap, 
    path: &Path, 
    error_handler: &Handler,
    out: &mut BTreeMap<String, Interface>
) -> IOResult<()> {

    println!("parsing {}", path.display());

    let source_file = source_map.load_file(&path)
        .attach_printable_lazy(||format!("cannot load input file: {}", path.display()))?;

    let comments = SingleThreadedComments::default();

    let lexer = Lexer::new(
        Syntax::Typescript(Default::default()),
        EsVersion::EsNext,
        StringInput::from(&*source_file),
        Some(&comments),
    );

    let mut has_error = false;

    let mut parser = Parser::new_from(lexer);
    for e in parser.take_errors() {
        e.into_diagnostic(error_handler).emit();
        has_error = true;
    }

    let result = parser.parse_module();
    for e in parser.take_errors() {
        e.into_diagnostic(error_handler).emit();
        has_error = true;
    }

    let module = match result {
        Ok(module) => {
            if has_error {
                return Err(io_err(&format!("error parsing input file: {}", path.display())))?;
            }
            module
        },
        Err(e) => {
            e.into_diagnostic(error_handler).emit();
            return Err(io_err(&format!("error parsing input file: {}", path.display())))?;
        }
    };

    todo!()
}
