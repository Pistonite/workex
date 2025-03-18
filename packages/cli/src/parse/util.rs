use swc_common::Span;

use super::contexts::FileContext;

/// General utils for parsing 
impl FileContext {
    /// Emit an error message, which will be shown to the user after formatted
    /// by SWC
    pub fn emit_error<T: std::fmt::Display>(&mut self, span: Span, msg: T) {
        self.handler
            .struct_span_err(span, &format!("[workex] {msg}"))
            .emit();
        self.errors += 1;
    }

    fn parse_comments_at_pos(&self, pos: BytePos) -> CommentBlock {
        self.comments
            .with_leading(pos, parse_comment)
            .unwrap_or_default()
    }
}
