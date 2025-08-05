use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use cu::pre::*;

use crate::{CliOptions, ir};

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
    pub interfaces: BTreeMap<String, ir::Interface>,

    /// Output directory for the generated files
    ///
    /// This is inferred from the input directory, plus the `dir` CLI option
    pub out_dir: PathBuf,

    /// Do not generate the .gitignore file
    pub no_gitignore: bool,
}

impl Package {
    pub fn try_new(
        cli: &CliOptions,
        interfaces: BTreeMap<String, ir::Interface>,
    ) -> cu::Result<Self> {
        let out_dir = get_out_dir(cli).context("Failed to infer output directory")?;

        let protocol = cli.protocol.clone();
        if protocol.is_empty() {
            cu::bail!("Protocol identifier cannot be empty");
        }

        let prefix = cli.prefix.as_deref().unwrap_or(&cli.protocol).to_string();
        if prefix.is_empty() {
            cu::bail!("Prefix must be a valid non-empty JS identifier");
        }

        // process interface linkage
        let mut linkage = BTreeMap::new();
        for link_str in &cli.link {
            let (first, second) = parse_link(link_str)?;
            if !interfaces.contains_key(first) {
                cu::bail!("Interface not found: {}", first);
            }
            if !interfaces.contains_key(second) {
                cu::bail!("Interface not found: {}", second);
            }
            if let Some(old_second) = linkage.insert(first.to_string(), second.to_string()) {
                cu::bail!(
                    "Linking {0} with {1}, but {0} is already linked with {2}",
                    first,
                    second,
                    old_second
                );
            }
            if let Some(old_first) = linkage.insert(second.to_string(), first.to_string()) {
                cu::bail!(
                    "Linking {0} with {1}, but {0} is already linked with {2}",
                    second,
                    first,
                    old_first
                );
            }
        }

        Ok(Self {
            protocol,
            prefix,
            linkage,
            interfaces,
            out_dir,
            no_gitignore: cli.no_gitignore,
        })
    }
}

fn parse_link(link_str: &str) -> cu::Result<(&str, &str)> {
    let mut parts = link_str.split(',');
    let Some(first) = parts.next() else {
        cu::bail!("Invalid format for --link option: missing comma separator (,)");
    };
    let Some(second) = parts.next() else {
        cu::bail!("Invalid format for --link option: missing second interface name");
    };
    if parts.next().is_some() {
        cu::bail!("Invalid format for --link option: too many comma separators (,)");
    }
    let first = first.trim();
    if first.is_empty() {
        cu::bail!("Invalid format for --link option: first interface name is empty");
    }
    let second = second.trim();
    if second.is_empty() {
        cu::bail!("Invalid format for --link option: second interface name is empty");
    }
    Ok((first, second))
}

fn get_out_dir(cli: &CliOptions) -> cu::Result<PathBuf> {
    let mut out_dir = match cli.inputs.first() {
        None => {
            cu::bail!("No input files provided");
        }
        Some(path) => Path::new(path).parent_abs()?,
    };
    for input in cli.inputs.iter().skip(1) {
        let path = Path::new(input).parent_abs()?;
        if path != out_dir {
            cu::bail!(
                "Input files are not in the same directory: {} and {}",
                out_dir.display(),
                path.display()
            );
        }
    }
    if cli.dir.is_empty() {
        cu::bail!("--dir option cannot be empty");
    }
    out_dir.push(&cli.dir);
    Ok(out_dir)
}
