//! Hidden diagnostics commands for release smoke tests.

#[tauri::command(rename_all = "snake_case")]
pub fn sentry_native_stack_smoke_test() -> Result<(), String> {
    std::thread::Builder::new()
        .name("sentry-native-smoke".into())
        .spawn(sentry_native_stack_smoke_leaf)
        .map(|_| ())
        .map_err(|error| format!("failed to start native Sentry smoke thread: {error}"))
}

fn sentry_native_stack_smoke_leaf() {
    panic!("sentry-native-stack-smoke-test");
}

#[cfg(test)]
mod tests {
    #[test]
    #[should_panic(expected = "sentry-native-stack-smoke-test")]
    fn native_smoke_leaf_panics_with_stable_message() {
        super::sentry_native_stack_smoke_leaf();
    }
}
