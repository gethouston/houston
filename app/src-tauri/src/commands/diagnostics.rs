//! Hidden diagnostics command for DEV smoke tests. The panic-injection path is
//! compiled OUT of release builds (see the cfg below) so the open-source app —
//! whose official binaries bake the prod SENTRY_DSN — can't be used to flood the
//! prod Sentry project. The JS trigger is gated to dev too (app/src/main.tsx).
//! In release the command stays registered but is a harmless no-op.

#[tauri::command(rename_all = "snake_case")]
pub fn sentry_native_stack_smoke_test() -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    {
        Err("native Sentry smoke test is disabled in release builds".into())
    }
    #[cfg(debug_assertions)]
    {
        std::thread::Builder::new()
            .name("sentry-native-smoke".into())
            .spawn(sentry_native_stack_smoke_leaf)
            .map(|_| ())
            .map_err(|error| format!("failed to start native Sentry smoke thread: {error}"))
    }
}

#[cfg(any(debug_assertions, test))]
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
