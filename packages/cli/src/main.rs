use clap::Parser;
use cu::pre::*;

mod emit;
mod ir;
mod parse;

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

    #[clap(flatten)]
    common: cu::cli::Flags,
}

#[cu::cli(flags = "common")]
fn main(cli: CliOptions) -> cu::Result<()> {
    let interfaces =
        parse::load_interfaces_from_inputs(&cli.inputs).context("failed to parse input files")?;
    let package = ir::Package::try_new(&cli, interfaces)?;

    emit::emit(&package).context("failed to emit output")?;
    cu::info!("{} interfaces generated", package.interfaces.len());
    Ok(())
}
