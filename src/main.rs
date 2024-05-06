use std::path::{Path, PathBuf};

use clap::Parser;

mod parse;
mod data;
use data::*;
use error_stack::ResultExt;
mod emit;

fn main() {
    let cli = Cli::parse();
    println!("{:?}", cli);
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
        None => return Err(io_err("No input files"))?,
        Some(path) => get_parent_dir(path)?
    };
    for input in inputs.iter().skip(1) {
        let path = get_parent_dir(input)?;
        if path != out_dir {
            return Err(io_err("Input files must be in the same directory"))?;
        }
    }
    Ok(out_dir)
}

fn get_parent_dir(path: &str) -> IOResult<PathBuf> {
    Path::new(path).parent()
        .ok_or(io_err("Cannot get parent of input files"))?
        .canonicalize()
        .attach_printable("Cannot canonicalize output directory")
}

fn io_err(msg: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, msg)
}
