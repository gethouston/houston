//! Whitespace-normalized fuzzy find-and-replace for skill content.

/// Collapse consecutive whitespace (spaces, tabs, newlines) into single spaces.
fn normalize_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_was_ws = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !prev_was_ws {
                result.push(' ');
                prev_was_ws = true;
            }
        } else {
            result.push(ch);
            prev_was_ws = false;
        }
    }
    result.trim().to_string()
}

/// Find `needle` in `haystack` using whitespace-normalized matching.
/// Returns the byte range of the match in the original (non-normalized) haystack.
pub fn fuzzy_find(haystack: &str, needle: &str) -> Option<std::ops::Range<usize>> {
    let norm_needle = normalize_whitespace(needle);
    if norm_needle.is_empty() {
        return None;
    }

    // Build a mapping from normalized-string char index to original byte positions.
    // We walk the original string and track where each normalized char came from.
    let mut norm_chars: Vec<(char, usize)> = Vec::new(); // (normalized_char, original_byte_start)
    let mut prev_was_ws = false;
    for (byte_idx, ch) in haystack.char_indices() {
        if ch.is_whitespace() {
            if !prev_was_ws {
                norm_chars.push((' ', byte_idx));
                prev_was_ws = true;
            }
        } else {
            norm_chars.push((ch, byte_idx));
            prev_was_ws = false;
        }
    }

    // Skip leading space in norm_chars for matching (trim effect)
    let start_offset = if norm_chars.first().map(|c| c.0) == Some(' ') {
        1
    } else {
        0
    };

    let needle_chars: Vec<char> = norm_needle.chars().collect();
    let search_slice = &norm_chars[start_offset..];

    for window_start in 0..search_slice.len() {
        if search_slice.len() - window_start < needle_chars.len() {
            break;
        }
        let mut matched = true;
        for (i, &nc) in needle_chars.iter().enumerate() {
            if search_slice[window_start + i].0 != nc {
                matched = false;
                break;
            }
        }
        if matched {
            let orig_start = search_slice[window_start].1;
            let last_match = &search_slice[window_start + needle_chars.len() - 1];
            // End is after the last matched char in the original
            let orig_end = last_match.1 + last_match.0.len_utf8();
            return Some(orig_start..orig_end);
        }
    }
    None
}

/// Apply a fuzzy patch: find `old_text`, replace with `new_text`.
/// Returns `None` if `old_text` is not found.
pub fn fuzzy_replace(content: &str, old_text: &str, new_text: &str) -> Option<String> {
    let range = fuzzy_find(content, old_text)?;
    let mut result = String::with_capacity(content.len() + new_text.len());
    result.push_str(&content[..range.start]);
    result.push_str(new_text);
    result.push_str(&content[range.end..]);
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        let content = "hello world";
        let range = fuzzy_find(content, "hello world").unwrap();
        assert_eq!(&content[range], "hello world");
    }

    #[test]
    fn whitespace_difference() {
        let content = "hello   world\n  foo";
        let range = fuzzy_find(content, "hello world foo").unwrap();
        assert_eq!(range.start, 0);
        // Should span from "hello" to "foo"
        assert_eq!(&content[range.start..range.end], "hello   world\n  foo");
    }

    #[test]
    fn newline_vs_space() {
        let content = "step 1\nstep 2\nstep 3";
        let range = fuzzy_find(content, "step 1 step 2").unwrap();
        assert_eq!(&content[range.start..range.end], "step 1\nstep 2");
    }

    #[test]
    fn no_match() {
        assert!(fuzzy_find("hello world", "goodbye").is_none());
    }

    #[test]
    fn empty_needle() {
        assert!(fuzzy_find("hello world", "").is_none());
        assert!(fuzzy_find("hello world", "   ").is_none());
    }

    #[test]
    fn replace_exact() {
        let result = fuzzy_replace("hello world", "hello", "goodbye").unwrap();
        assert_eq!(result, "goodbye world");
    }

    #[test]
    fn replace_fuzzy_whitespace() {
        let content = "1. Check docker\n2. Run compose";
        let result =
            fuzzy_replace(content, "Check docker 2. Run", "Check docker\n2. Execute").unwrap();
        assert_eq!(result, "1. Check docker\n2. Execute compose");
    }

    #[test]
    fn replace_not_found() {
        assert!(fuzzy_replace("hello world", "xyz", "abc").is_none());
    }
}
