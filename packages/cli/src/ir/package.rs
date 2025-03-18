use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::ir;

/// Struct to store information about all parsed inputs and CLI inputs
#[derive(Debug)]
pub struct Package {
    /// Protocol identifier
    pub protocol: String,

    /// Function prefix
    pub prefix: String,

    /// The pairs of interfaces that are linked together
    ///
    /// Both directions are stored
    pub linkage: BTreeMap<String, String>,

    /// All interfaces in the package, sorted by name
    pub interfaces: Vec<ir::Interface>,

    /// Output directory for the generated files
    ///
    /// This is inferred from the input directory, plus the `dir` CLI option
    pub out_dir: PathBuf,
}
