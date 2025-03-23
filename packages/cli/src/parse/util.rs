use swc_common::Span;

use super::contexts::Context;

impl Context {
    /// Emit an error message, which will be shown to the user after formatted
    /// by SWC
    pub fn emit_error<T: std::fmt::Display>(&mut self, span: Span, msg: T) {
        self.handler
            .struct_span_err(span, &format!("[workex] {msg}"))
            .emit();
        self.errors += 1;
    }
    /// Extract the raw source code as String
    pub fn raw_source(&mut self, span: Span) -> Option<String> {
        let result = self
            .source_map
            .with_snippet_of_span(span, |snippet| snippet.to_string());
        match result {
            Ok(s) => Some(s),
            Err(_) => {
                self.emit_error(span, "failed to extract source code from span");
                None
            }
        }
    }
}
