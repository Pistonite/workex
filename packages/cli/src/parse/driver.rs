use std::collections::BTreeMap;

use crate::ir;
use crate::parse::contexts;

/// Parses the input TS files, and load the interface declarations from them.
pub fn load_interfaces_from_inputs(
    inputs: &[String],
) -> cu::Result<BTreeMap<String, ir::Interface>> {
    let ctx = contexts::Context::default();
    ctx.parse(inputs)
}
