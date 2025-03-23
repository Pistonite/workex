use std::collections::BTreeMap;

use crate::ir;

mod comment;
mod contexts;
mod function;
mod import;
mod util;

/// Parses the input TS files, and load the interface declarations from them.
pub fn load_interfaces_from_inputs(
    inputs: &[String],
) -> anyhow::Result<BTreeMap<String, ir::Interface>> {
    let ctx = contexts::Context::default();
    ctx.parse(inputs)
}
