use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::Parser;
use anyhow::{bail, Context};

mod ir;

mod parse;
mod parse_old;
mod emit;

/// Workex CLI Tool
#[derive(Debug, Parser)]
#[command(author, about, version, arg_required_else_help(true))]
pub struct CliOptions {
    /// Input TypeScript files with `export interface` declarations
    ///
    /// The input files must be in the same directory, which will also be
    /// used as the output directory.
    pub inputs: Vec<String>,

    /// A string that will be used as the protocol identifier.
    ///
    /// If the string only contains lowercase alphabetic characters, it will be
    /// also used as the prefix for generated functions. Otherwise, a prefix
    /// is required to be specified.
    #[clap(short, long)]
    pub protocol: String,

    /// Prefix for generated functions. The generated function names will
    /// be this prefix + the interface name. 
    ///
    /// Default is the same as protocol
    #[clap(long)]
    pub prefix: Option<String>,

    /// Do not generate the .gitignore file
    #[clap(long)]
    pub no_gitignore: bool,

    /// Link 2 interfaces together. The 2 interfaces should be separated with a comma (,).
    /// Multiple `-l` flags can be used to link more pairs of interfaces.
    #[clap(short, long)]
    pub link: Vec<String>,

    /// Specify the name of the output directory.
    #[clap(long, default_value = "interfaces")]
    pub dir: String,
}

fn main() -> ExitCode {
    match main_internal() {
        Ok(_) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {:?}", e);
            ExitCode::FAILURE
        }
    }
}

fn main_internal() -> anyhow::Result<Error> {
    let cli = CliOptions::parse();

    let out_dir = get_out_dir(&cli.inputs).context("Failed to get output directory")?;
    let interfaces = parse::parse(&cli.inputs).change_context(Error::Parse)?;

    let pkg = Package {
        out_dir,
        interfaces,
    };

    emit::emit(&pkg, &cli).change_context(Error::Emit)?;
    println!("{} interfaces generated", pkg.interfaces.len());
    Ok(())
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("Invalid argument")]
    InvalidArg,
    #[error("Fail to parse inputs")]
    Parse,
    #[error("Fail to emit output")]
    Emit,
}

fn get_out_dir(inputs: &[String]) -> anyhow::Result<PathBuf> {
    let out_dir = match inputs.first() {
        None => {
            bail!("No input files provided");
        }
        Some(path) => get_parent_dir(path)?,
    };
    for input in inputs.iter().skip(1) {
        let path = get_parent_dir(input)?;
        if path != out_dir {
            bail!("Input files are not in the same directory: {} and {}", out_dir.display(), path.display());
        }
    }
    Ok(out_dir)
}

fn get_parent_dir(path: &str) -> anyhow::Result<PathBuf> {
    let p = Path::new(path);

    if !p.exists() {
        bail!("Input file does not exist: {}", path);
    }

    let Some(parent) = p .parent() else {
        bail!("Input file has no parent: {}", path);
    };

    Ok(dunce::canonicalize(parent).context("Failed to read parent directory of input file")?)
}
