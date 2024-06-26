use std::fs;
use std::path::Path;

use codize::{cblock, cconcat, clist, Concat};
use error_stack::ResultExt;

use crate::{IOResult, Interface, Package};

/// Name for the protocol constant
const PROTOCOL_CONST_NAME: &str = "PROTOCOL";
const FUNCTION_ID_ENUM_NAME: &str = "FuncId";

fn header() -> Concat {
    cconcat![
        "//! This file is generated by workex",
        "//! DO NOT EDIT",
        "",
        "/* eslint-disable */",
    ]
}

/// Emit the output
pub fn emit(pkg: &Package) -> IOResult<()> {
    emit_protocol(pkg)?;
    let out_dir = &pkg.out_dir;
    emit_index(pkg, out_dir)?;

    for interface in &pkg.interfaces {
        emit_interface_send(interface, out_dir)?;
        emit_interface_recv(interface, out_dir)?;
    }

    Ok(())
}

/// Emit protocol.ts
fn emit_protocol(pkg: &Package) -> IOResult<()> {
    let protocol = &pkg.protocol;
    let out_dir = &pkg.out_dir;

    let func_id_enum = cblock! {
        format!("export const {FUNCTION_ID_ENUM_NAME} = {{"),
        [clist!("," =>
            pkg.interfaces.iter().flat_map(|interface| {
                interface.functions.iter().map(|function| {
                    (&interface.name, &function.name)
                })
            }).enumerate().map(|(i, (interface, function))| {
                format!("{interface}_{function}: {i}")
            })
        )],
        "} as const;"
    };

    let output = cconcat![
        header(),
        format!("export const {PROTOCOL_CONST_NAME} = {protocol} as const;"),
        "",
        func_id_enum,
        format!("export type {FUNCTION_ID_ENUM_NAME} = (typeof {FUNCTION_ID_ENUM_NAME})[keyof typeof {FUNCTION_ID_ENUM_NAME}];")
    ];

    let path = out_dir.join("protocol.ts");
    write_file(&path, output.to_string())?;

    Ok(())
}

/// Emit send.ts and recv.ts
fn emit_index(pkg: &Package, out_dir: &Path) -> IOResult<()> {
    for id in ["send", "recv"] {
        let output = cconcat![
            header(),
            cconcat!(pkg.interfaces.iter().map(|interface| {
                format!(r#"export * from "./{}.{}.ts";"#, interface.name, id)
            }))
        ];
        let path = out_dir.join(format!("{id}.ts"));
        write_file(&path, output.to_string())?;
    }

    Ok(())
}

fn emit_interface_send(interface: &Interface, out_dir: &Path) -> IOResult<()> {
    let imports = &interface.imports.send;

    let class_decl = cblock! {
        format!("export class {0}Client implements {0} {{", interface.name),
        [
            format!("private client: {}<{FUNCTION_ID_ENUM_NAME}>", imports.workex_client_ident),
            "",
            cblock! {
                format!("constructor(options: {}) {{", imports.workex_client_options_ident),
                [
                    format!("this.client = new {}({PROTOCOL_CONST_NAME}, options);", imports.workex_client_ident)
                ],
                "}"
            },
            cconcat!(interface.functions.iter().map(|f| {
                let funcid_expr = format!("{FUNCTION_ID_ENUM_NAME}.{}_{}", interface.name, f.name);
                f.to_send_function(&funcid_expr, &imports.workex_promise_ident)
            })),
            "",
            "/**",
            " * Terminate the client and the underlying worker",
            " */",
            cblock! {
                "public terminate() {",
                [
                    "this.client.terminate();"
                ],
                "}"
            }
        ],
        "}"
    };

    let output = cconcat![
        header(),
        format!(
            "import type {{ {} }} from \"./{}\";",
            interface.name, interface.filename
        ),
        "",
        cconcat!(imports.imports.iter().map(|import| import.to_code())),
        "",
        format!(
            "import {{ {PROTOCOL_CONST_NAME}, {FUNCTION_ID_ENUM_NAME} }} from \"./protocol.ts\";"
        ),
        "",
        interface.comment.to_code(),
        class_decl
    ];

    let path = out_dir.join(format!("{}.send.ts", interface.name));
    write_file(&path, output.to_string())?;

    Ok(())
}

fn emit_interface_recv(interface: &Interface, out_dir: &Path) -> IOResult<()> {
    let bind_func = cblock! {
        format!("export function bind{0}Host(delegate: {0}, options: WorkexBindOptions) {{", interface.name),
        [
            interface.to_funcid_set("ids", FUNCTION_ID_ENUM_NAME),
            format!("const shouldHandle = (fId: {FUNCTION_ID_ENUM_NAME}) => ids.has(fId);"),
            cblock! {
                format!("bindHost<{FUNCTION_ID_ENUM_NAME}>({PROTOCOL_CONST_NAME}, options, shouldHandle, (fId: {FUNCTION_ID_ENUM_NAME}, _payload: any[]) => {{"),
                [
                    cblock! {
                        "switch (fId) {",
                        interface.functions.iter().map(|f| {
                            let funcid_expr = format!("{FUNCTION_ID_ENUM_NAME}.{}_{}", interface.name, f.name);
                            f.to_recv_case(&funcid_expr, "delegate", "_payload")
                        }),
                        "}"
                    }
                ],
                "});"
            }
        ],
        "}"
    };

    let output = cconcat![
        header(),
        "import { type WorkexBindOptions, bindHost } from \"workex\";",
        format!(
            "import type {{ {} }} from \"./{}\";",
            interface.name, interface.filename
        ),
        format!(
            "import {{ {PROTOCOL_CONST_NAME}, {FUNCTION_ID_ENUM_NAME} }} from \"./protocol.ts\";"
        ),
        "",
        bind_func
    ];

    let path = out_dir.join(format!("{}.recv.ts", interface.name));
    write_file(&path, output.to_string())?;

    Ok(())
}

fn write_file<T: AsRef<str>>(path: &Path, code: T) -> IOResult<()> {
    println!("saving {}", path.display());
    fs::write(path, code.as_ref())
        .attach_printable(format!("Failed to write {}", path.display()))?;

    Ok(())
}
