use std::collections::BTreeMap;
use std::path::Path;

use anyhow::Context as _;
use codize::{Concat, cblock, cconcat};

use crate::ir;

fn header() -> Concat {
    cconcat![
        "/*",
        " * This file is generated by the workex CLI Tool",
        " *",
        " * Please visit https://workex.pistonite.dev for more information",
        " */",
        "",
    ]
}

/// Emit the output
pub fn emit(pkg: &ir::Package) -> anyhow::Result<()> {
    let func_map = make_func_id_map(pkg);
    let out_dir = &pkg.out_dir;
    if out_dir.exists() {
        std::fs::remove_dir_all(out_dir).context("Failed to remove existing output directory")?;
    }
    std::fs::create_dir_all(out_dir).context("Failed to create output directory")?;

    for interface in pkg.interfaces.values() {
        emit_interface_impl(interface, &func_map, out_dir)?;
        let linked_interface = pkg
            .linkage
            .get(&interface.name)
            .and_then(|name| pkg.interfaces.get(name));
        emit_interface_bus(
            &pkg.protocol,
            &pkg.prefix,
            interface,
            linked_interface,
            out_dir,
        )?;
    }

    if !pkg.no_gitignore {
        emit_gitignore(out_dir)?;
    }

    Ok(())
}

/// Make map from function name to function id
fn make_func_id_map(pkg: &ir::Package) -> BTreeMap<String, u32> {
    let mut map = BTreeMap::new();
    // 0-15 are reserved function id for internal use in the workex library
    let mut i = 16;
    for interface in pkg.interfaces.values() {
        for function in &interface.functions {
            map.insert(format!("{}_{}", interface.name, function.name), i);
            i += 1;
        }
    }
    map
}

/// Emit /interfaces/INTERFACE.ts
fn emit_interface_impl(
    interface: &ir::Interface,
    func_map: &BTreeMap<String, u32>,
    out_dir: &Path,
) -> anyhow::Result<()> {
    let imports = &interface.impl_imports;

    let ident_wxsender = &imports.ident_wxsender;
    let ident_wxhandler = &imports.ident_wxhandler;

    let sender_decl = cblock! {
        format!("export class _wxSenderImpl implements {} {{", interface.name),
        [
            format!("private sender: {}", ident_wxsender),
            "",
            cblock! {
                format!("constructor(sender: {}) {{", ident_wxsender),
                [ "this.sender = sender" ],
                "}"
            },
            cconcat!(interface.functions.iter().map(|f| {
                let func_ident = format!("{}_{}", interface.name, f.name);
                let funcid_expr = format!("{} /* {}.{} */", func_map.get(&func_ident).unwrap(), interface.name, f.name);
                f.to_send_function(&funcid_expr, &imports.ident_wxpromise)
            })),
        ],
        "}"
    };

    let recver_decl = cblock! {
        format!("export const _wxRecverImpl = (handler: {}): {} => {{", interface.name, ident_wxhandler), [
        cblock! {
            "return ((fId, args: any[]) => { switch (fId) {", [
            cconcat!(interface.functions.iter().map(|f| {
                let func_ident = format!("{}_{}", interface.name, f.name);
                let funcid_expr = format!("{} /* {}.{} */", func_map.get(&func_ident).unwrap(), interface.name, f.name);
                f.to_recv_switch_case(&funcid_expr)
            })) ],
            // adding the cast to avoid TypeScript shenanigans
            format!("}} return Promise.resolve({{ err: {{ code: \"UnknownFunction\" }} }}); }}) as {};", ident_wxhandler)
        }, ],
        "};"
    };

    let mut code = cconcat![
        header(),
        // import from parent directory since we are inside interfaces/
        format!(
            "import type {{ {} }} from \"../{}\";",
            interface.name, interface.filename
        ),
        "",
        imports.to_code(),
        "",
        "/*",
        " * These generated implementations are used internally by other generated code.",
        " * They should not be used directly!",
        " */",
        "",
    ];

    let comment = interface.comment.to_code();
    if let Some(comment) = comment.clone() {
        code.push(comment);
    }
    code.push(sender_decl.into());
    code.push("".into());
    if let Some(comment) = comment {
        code.push(comment);
    }
    code.push(recver_decl.into());

    let path = out_dir.join(format!("{}.ts", interface.name));
    write_file(&path, code.to_string())?;

    Ok(())
}

/// Emit /interfaces/INTERFACE.bus.ts
fn emit_interface_bus(
    protocol: &str,
    prefix: &str,
    interface: &ir::Interface,
    linked_interface: Option<&ir::Interface>,
    out_dir: &Path,
) -> anyhow::Result<()> {
    let name = &interface.name;

    let function_name = format!("{}{}", prefix, name);

    #[rustfmt::skip]
    let bind_config_func = match linked_interface.map(|i| &i.name) {
        Some(linked_name) => cconcat![
                    "/**",
            format!(" * Create a bind config for the {name} interface, under the `{protocol}` protocol"),
                    " *",
            format!(" * When used with a creator function in Workex, an implementation of {name} will be returned"),
            format!(" * to send remote calls to the other side. This side needs to provide an implementation for {linked_name}"),
                    " * to be used when the other side calls this side",
                    " *",
                    " * This function is generated by the workex CLI tool",
                    " */",
            cblock! {
                format!("export const {function_name} = (handler: {linked_name}, resolve?: (_: {name}) => (void | Promise<void>)): WxProtocolBindConfig<{name}> => {{ return {{"), [
                    format!("protocol: {},", quoted(protocol)),
                    format!("interfaces: [{}, {}],", quoted(name), quoted(linked_name)),
                            "recvHandler: _wxRecverImpl(handler),",
                    cblock! {
                            "bindSend: (sender) => {", [
                                "const impl = new _wxSenderImpl(sender);",
                                "resolve?.(impl);",
                                "return impl;", ],
                            "}," } ],
                        "}};"
            }
        ],
        // for unlinked interfaces, generate one function that can be used both as a sender and receiver
        None => cconcat![
                    "/**",
            format!(" * Create a bind config for the {name} interface, under the `{protocol}` protocol"),
                    " *",
                    " * When used with a creator function in Workex, if no arguments, or a `resolve` function is provided,",
            format!(" * the config will be for the sender side (i.e. the side that calls {name})."),
            format!(" * Otherwise, the config will be for the receiver side, and an implementation of {name} needs to be provided."),
                    " *",
                    " * This interface is not linked to another interface in the protocol. One side should provide an implementation, and the other",
                    " * side should call with no arguments or a `resolve` function to receive a caller.",
                    " *",
                    " * This function is generated by the workex CLI tool",
                    " */",
            // receiver signature
            format!("export function {function_name}(handler: {name}): WxProtocolBindConfig<Record<string, never>>;"),
            // sender signature
            format!("export function {function_name}(resolve?: (_: {name}) => (void | Promise<void>)): WxProtocolBindConfig<{name}>;"),
            cblock! {
                format!("export function {function_name}(handlerOrResolve?: {name} | ((_: {name}) => (void | Promise<void>))): WxProtocolBindConfig<Record<string, never>> | WxProtocolBindConfig<{name}> {{"), [
                    cblock!{
                        "if (!handlerOrResolve || typeof handlerOrResolve === \"function\") { return {", [
                            format!("protocol: {},", quoted(protocol)),
                            format!("interfaces: [{}, \"_wxStub\"],", quoted(name)),
                                    "recvHandler: () => Promise.resolve({ err: { code: \"UnexpectedStubCall\" } }),",
                            cblock! {
                                    "bindSend: (sender) => {", [
                                        "const impl = new _wxSenderImpl(sender);",
                                        "handlerOrResolve?.(impl);",
                                        "return impl;", ],
                                    "},"
                            } ],
                        "};}"
                    },
                    cblock!{
                        "return {", [
                        format!("protocol: {},", quoted(protocol)),
                        format!("interfaces: [\"_wxStub\", {}],", quoted(name)),
                                "recvHandler: _wxRecverImpl(handlerOrResolve),",
                                "bindSend: () => ({})", ],
                        "};"
                    }, ],
                    "};"
            }
        ],
    };

    let output = cconcat![
        header(),
        "import type { WxProtocolBindConfig } from \"@pistonite/workex\";",
        format!(
            "import type {{ {} }} from \"../{}\";",
            interface.name, interface.filename
        ),
        match linked_interface {
            Some(linked) => cconcat![
                format!(
                    "import type {{ {0} }} from \"../{1}\";\nimport {{ _wxRecverImpl }} from \"./{0}.ts\";",
                    linked.name, linked.filename
                ),
                format!(
                    "import {{ _wxSenderImpl }} from \"./{}.ts\";",
                    interface.name
                ),
            ],
            None => cconcat![[format!(
                "import {{ _wxSenderImpl, _wxRecverImpl }} from \"./{}.ts\";",
                interface.name
            )]],
        },
        "",
        bind_config_func
    ];

    let path = out_dir.join(format!("{}.bus.ts", interface.name));
    write_file(&path, output.to_string())?;

    Ok(())
}

fn emit_gitignore(out_dir: &Path) -> anyhow::Result<()> {
    let mut content = String::from("# workex generated files\n");
    let path = out_dir.join(".gitignore");
    content.push_str("*\n");
    write_file(&path, &content)?;

    Ok(())
}

fn quoted(s: &str) -> String {
    if s.contains(['"', '\\']) {
        format!("\"{}\"", s.replace('"', "\\\"").replace('\\', "\\\\"))
    } else {
        format!("\"{}\"", s)
    }
}

fn write_file<T: AsRef<str>>(path: &Path, code: T) -> anyhow::Result<()> {
    std::fs::write(path, code.as_ref())
        .context(format!("Failed to write to {}", path.display()))?;

    Ok(())
}
