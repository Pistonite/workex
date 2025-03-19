use swc_common::BytePos;
use swc_common::comments::{Comment, CommentKind};

use super::contexts::FileContext;

use crate::ir;

impl FileContext<'_> {
    /// Parse the documentation comments at the given position
    pub fn parse_doc_comments_at_pos(&self, pos: BytePos) -> ir::CommentBlock {
        self.comments.with_leading(pos, parse_comment)
    }
}

/// Parse the JS comments into IR comment, and preserve the style
fn parse_comment(comments: &[Comment]) -> ir::CommentBlock {
    let mut iter = comments.iter();
    let Some(first) = iter.next() else {
        return ir::CommentBlock::default();
    };
    let mut style = match first.kind {
        CommentKind::Line => ir::CommentStyle::TripleSlash,
        CommentKind::Block => ir::CommentStyle::JsDoc,
    };

    let mut lines = Vec::new();
    add_comment(first, &mut lines);
    for comment in iter {
        // use JSDoc style if any comment is a block comment (with /* ... */)
        if comment.kind == CommentKind::Block {
            style = ir::CommentStyle::JsDoc;
        }
        add_comment(comment, &mut lines);
    }

    // remove trailing empty lines
    while let Some(last) = lines.last() {
        if last.is_empty() {
            lines.pop();
        } else {
            break;
        }
    }

    if lines.is_empty() {
        ir::CommentBlock::default()
    } else {
        ir::CommentBlock { style, lines }
    }
}

/// Add one comment to the output lines, and fix the formatting
fn add_comment(comment: &Comment, out: &mut Vec<String>) {
    let lines = comment.text.lines().map(|line| {
        // trim !, / or * from the start of the line
        let line = line
            .trim_start_matches(|c: char| c == '!' || c == '/' || c == '*' || c.is_whitespace());
        // remove whitespaces
        line.trim().to_string()
    });

    if out.is_empty() {
        // remove leading empty lines
        out.extend(lines.skip_while(|line| line.is_empty()))
    } else {
        out.extend(lines);
    }
}
