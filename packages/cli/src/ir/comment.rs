use codize::{Code, cconcat};

/// A block of documentation comments
#[derive(Debug, Default)]
pub struct CommentBlock {
    /// The style of the comment block
    pub style: CommentStyle,
    /// Raw comment lines without the syntax
    pub lines: Vec<String>,
}

impl CommentBlock {
    /// Convert this comment block to string representation
    pub fn to_code(&self) -> Option<Code> {
        if self.lines.is_empty() {
            return None;
        }
        match self.style {
            CommentStyle::TripleSlash => {
                Some(cconcat!(self.lines.iter().map(|line| format!("/// {line}"))).into())
            }
            CommentStyle::JsDoc => {Some(cconcat![
                "/**",
                cconcat!(self.lines.iter().map(|line| {
                    if line.starts_with("* ") {
                        format!(" {line}")
                    } else {
                        format!(" * {line}")
                    }
                })),
                " */"
            ]
            .into())}
        }
    }
}

/// Style of a comment block
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CommentStyle {
    /// `///` comments
    TripleSlash,
    #[default]
    /// `/** ... */` comments
    JsDoc,
}
