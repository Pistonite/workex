use std::path::{Path, PathBuf};

use clap::Parser;
use error_stack::ResultExt;

mod parse;
mod data;
use data::*;
mod emit;

fn main() -> IOResult<()> {
    let cli = Cli::parse();

    let out_dir = get_out_dir(&cli.inputs)?;
    let interfaces = parse::parse(&cli.inputs)?;

    let pkg = Package {
        protocol: cli.protocol,
        out_dir,
        interfaces,
    };

    emit::emit(&pkg)?;
    Ok(())

}


#[derive(Debug, Parser)]
#[command(author, about, version, arg_required_else_help(true))]
struct Cli {
    /// Input TypeScript files with `export interface` declarations
    ///
    /// The input files must be in the same directory, which will also be
    /// used as the output directory.
    #[clap(required(true))]
    inputs: Vec<String>,

    /// A JavaScript string literal that will be used as the protocol identifier.
    ///
    /// Note that quotes must be present, so you might need to escape them or use single quotes
    /// in the shell command
    #[clap(short, long)]
    protocol: String,
}

fn get_out_dir(inputs: &[String]) -> IOResult<PathBuf> {
    let out_dir = match inputs.first() {
        None => return Err(io_err("no input files"))?,
        Some(path) => get_parent_dir(path)?
    };
    for input in inputs.iter().skip(1) {
        let path = get_parent_dir(input)?;
        if path != out_dir {
            return Err(io_err("input files must be in the same directory"))?;
        }
    }
    Ok(out_dir)
}

fn get_parent_dir(path: &str) -> IOResult<PathBuf> {
    let p = Path::new(path);

    if !p.exists() {
        return Err(io_err(&format!("input file does not exist: {}", path)))?;
    }

    p.parent()
        .ok_or(io_err("cannot get parent of input files"))?
        .canonicalize()
        .attach_printable("cannot canonicalize output directory")
}

