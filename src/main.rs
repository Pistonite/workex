use clap::Parser;

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
