use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::Parser;
use error_stack::{report, Result, ResultExt};

mod data;
mod parse;
use data::*;
mod emit;

fn main() -> ExitCode {
    match main_internal() {
        Ok(_) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {:?}", e);
            ExitCode::FAILURE
        }
    }
}

fn main_internal() -> Result<(), Error> {
    let cli = Cli::parse();

    if !cli.lib_path.starts_with("./") && !cli.lib_path.starts_with("../") {
        return Err(report!(Error::InvalidArg))
            .attach_printable("lib_path must start with ./ or ../");
    }

    let out_dir = get_out_dir(&cli.inputs)?;
    let interfaces = parse::parse(&cli.inputs, &cli.lib_path).change_context(Error::Parse)?;

    let pkg = Package {
        protocol: cli.protocol,
        out_dir,
        lib_path: cli.lib_path,
        interfaces,
    };

    emit::emit(&pkg).change_context(Error::Emit)?;
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

#[derive(Debug, Parser)]
#[command(author, about, version, arg_required_else_help(true))]
struct Cli {
    /// Input TypeScript files with `export interface` declarations
    ///
    /// The input files must be in the same directory, which will also be
    /// used as the output directory.
    #[clap(required(true))]
    inputs: Vec<String>,

    /// A string that will be used as the protocol identifier.
    #[clap(short, long)]
    protocol: String,

    /// Path to import workex from. The SDK library will be emitted
    /// to this directory.
    ///
    /// It should start with "./" or "../" and be a relative path.
    #[clap(short, long, default_value = "./workex")]
    lib_path: String,
}

fn get_out_dir(inputs: &[String]) -> Result<PathBuf, Error> {
    let out_dir = match inputs.first() {
        None => {
            return Err(report!(Error::InvalidArg)).attach_printable("No input files provided");
        }
        Some(path) => get_parent_dir(path)?,
    };
    for input in inputs.iter().skip(1) {
        let path = get_parent_dir(input)?;
        if path != out_dir {
            return Err(report!(Error::InvalidArg)).attach_printable(format!(
                "Input files are not in the same directory: {} and {}",
                out_dir.display(),
                path.display()
            ));
        }
    }
    Ok(out_dir)
}

fn get_parent_dir(path: &str) -> Result<PathBuf, Error> {
    let p = Path::new(path);

    if !p.exists() {
        return Err(report!(Error::InvalidArg))
            .attach_printable(format!("Input file does not exist: {}", path));
    }

    let parent = p
        .parent()
        .ok_or_else(|| report!(Error::InvalidArg).attach_printable("Input file has no parent."))?;

    dunce::canonicalize(parent)
        .change_context_lazy(|| Error::InvalidArg)
        .attach_printable_lazy(|| format!("Failed to canonicalize {}", parent.display()))
}
