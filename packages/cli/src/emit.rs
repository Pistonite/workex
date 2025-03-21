use std::collections::BTreeMap;
use std::path::Path;

use codize::{cblock, cconcat, Concat};
use error_stack::{Result, ResultExt};

use crate::{CliOptions, Interface, Package};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error")]
    IO,
}

fn header() -> Concat {
    cconcat!["/**", " * This file is generated by workex", " */",]
}

/// Emit the output
pub fn emit(pkg: &Package, cli: &CliOptions) -> Result<(), Error> {
    let out_dir = &pkg.out_dir;

    let func_map = make_func_id_map(pkg);
    emit_sides(pkg, out_dir)?;

    let interfaces_dir = out_dir.join("interfaces");
    if interfaces_dir.exists() {
        std::fs::remove_dir_all(&interfaces_dir).change_context(Error::IO)?;
    }
    std::fs::create_dir_all(&interfaces_dir).change_context(Error::IO)?;

    for interface in &pkg.interfaces {
        emit_interface_send(interface, &func_map, &interfaces_dir, cli)?;
        emit_interface_recv(interface, &func_map, &interfaces_dir, cli)?;
    }

    if cli.no_gitignore {
        println!("not emitting .gitignore because --no-gitignore is used");
    } else {
        emit_gitignore(out_dir)?;
    }

    Ok(())
}

/// Make map from function name to function id
fn make_func_id_map(pkg: &Package) -> BTreeMap<String, usize> {
    let mut map = BTreeMap::new();
    // 0-15 are reserved function id for internal use in the workex library
    let mut i = 16;
    for interface in &pkg.interfaces {
        for function in &interface.functions {
            map.insert(format!("{}_{}", interface.name, function.name), i);
            i += 1;
        }
    }
    map
}

/// Emit {out_dir}/sides/SIDE.ts files
///
/// Each SIDE.ts contains re-exports from ../interfaces/INTERFACE.{send,recv}.ts
/// as defined by the annotations in the interface comments
fn emit_sides(pkg: &Package, out_dir: &Path) -> Result<(), Error> {
    let sides_dir = out_dir.join("sides");
    if sides_dir.exists() {
        std::fs::remove_dir_all(&sides_dir).change_context(Error::IO)?;
    }
    std::fs::create_dir_all(&sides_dir).change_context(Error::IO)?;
    let mut sides: BTreeMap<String, String> = Default::default();
    for interface in &pkg.interfaces {
        for send_side in &interface.send_sides {
            let side_file = sides.entry(send_side.clone()).or_default();
            side_file.push_str(&format!(
                "export * from \"../interfaces/{}.send.ts\";\n",
                interface.name
            ));
        }
        for recv_side in &interface.recv_sides {
            let side_file = sides.entry(recv_side.clone()).or_default();
            side_file.push_str(&format!(
                "export * from \"../interfaces/{}.recv.ts\";\n",
                interface.name
            ));
        }
    }
    for (side, content) in sides {
        let path = sides_dir.join(format!("{}.ts", side));
        write_file(&path, content)?;
    }

    Ok(())
}

fn emit_interface_send(
    interface: &Interface,
    func_map: &BTreeMap<String, usize>,
    interfaces_dir: &Path,
    cli: &CliOptions,
) -> Result<(), Error> {
    let imports = &interface.imports.send;
    let protocol = &cli.protocol;
    let class_suffix = &cli.send_suffix;
    let workex_client = &imports.workex_client_ident;
    let workex_client_options = &imports.workex_client_options_ident;

    let class_decl = cblock! {
        format!("export class {0}{1} implements {0} {{", interface.name, class_suffix),
        [
            format!("private client: {}<\"{}\">", workex_client, protocol),
            "",
            cblock! {
                format!("constructor(options: {}) {{", workex_client_options),
                [
                    format!("this.client = new {}(\"{}\", options);", workex_client, protocol)
                ],
                "}"
            },
            cconcat!(interface.functions.iter().map(|f| {
                let func_ident = format!("{}_{}", interface.name, f.name);
                let funcid_expr = format!("{} /* {}.{} */", func_map.get(&func_ident).unwrap(), interface.name, f.name);
                f.to_send_function(&funcid_expr, &imports.workex_promise_ident)
            })),
            "",
            "/**",
            " * Terminate the client and the underlying worker",
            " *",
            " * This method is generated by workex",
            " */",
            cblock! {
                "public terminate() {",
                [
                    "this.client.terminate();"
                ],
                "}"
            },
            "",
            "/**",
            " * Get the protocol identifier used by the underlying workex communication",
            " *",
            " * This method is generated by workex",
            " */",
            cblock! {
                format!("public protocol(): \"{}\" {{", protocol),
                [
                    format!("return \"{}\";", protocol)
                ],
                "}"
            },
            "",
            "/**",
            " * Create a client-only handshake",
            " *",
            " * Generally, handshakes should be created using the `bindHost` function on each side.",
            " * However, if one side is a client-only side, this method can be used to bind a stub host",
            " * to establish the handshake.",
            " *",
            " * This method is generated by workex",
            " */",
            cblock! {
                "public handshake() {",
                [
                    "return this.client.handshake();"
                ],
                "}"
            }
        ],
        "}"
    };

    let output = cconcat![
        header(),
        // import from parent directory since we are inside interfaces/
        format!(
            "import type {{ {} }} from \"../{}\";",
            interface.name, interface.filename
        ),
        "",
        cconcat!(imports.imports.iter().map(|import| import.to_code(None))),
        "",
        interface.comment.to_code(),
        class_decl
    ];

    let path = interfaces_dir.join(format!("{}.send.ts", interface.name));
    write_file(&path, output.to_string())?;

    Ok(())
}

fn emit_interface_recv(
    interface: &Interface,
    func_map: &BTreeMap<String, usize>,
    interfaces_dir: &Path,
    cli: &CliOptions,
) -> Result<(), Error> {
    let suffix = &cli.recv_suffix;
    let protocol = &cli.protocol;
    let bind_func = cblock! {
        format!("export function bind{0}{1}(delegate: {0}, options: WorkexBindOptions) {{", interface.name, suffix),
        [
            cblock! {
                format!("return bindHost(\"{protocol}\", options, (fId: number, _payload: any[]) => {{"),
                [
                    cblock! {
                        "switch (fId) {",
                        interface.functions.iter().map(|f| {
                let func_ident = format!("{}_{}", interface.name, f.name);
                let funcid_expr = format!("{} /* {}.{} */", func_map.get(&func_ident).unwrap(), interface.name, f.name);
                            f.to_recv_case(&funcid_expr, "delegate", "_payload")
                        }),
                        "}"
                    },
                    "return undefined;"
                ],
                "});"
            }
        ],
        "}"
    };

    let output = cconcat![
        header(),
        "import { type WorkexBindOptions, bindHost } from \"@pistonite/workex\";",
        format!(
            "import type {{ {} }} from \"../{}\";",
            interface.name, interface.filename
        ),
        "",
        bind_func
    ];

    let path = interfaces_dir.join(format!("{}.recv.ts", interface.name));
    write_file(&path, output.to_string())?;

    Ok(())
}

fn emit_gitignore(out_dir: &Path) -> Result<(), Error> {
    let mut content = String::from("# workex generated files\n");
    let path = out_dir.join(".gitignore");
    content.push_str("/interfaces/\n/sides/\n");
    write_file(&path, &content)?;

    Ok(())
}

fn write_file<T: AsRef<str>>(path: &Path, code: T) -> Result<(), Error> {
    std::fs::write(path, code.as_ref())
        .change_context(Error::IO)
        .attach_printable(format!("Failed to write {}", path.display()))?;

    Ok(())
}
