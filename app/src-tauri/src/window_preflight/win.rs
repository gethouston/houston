//! The Win32 half of the start-up window probe: register a class, create
//! a hidden window with tao's exact extended styles, subclass it, tear it
//! down, and the native dialog shown when that keeps failing.

use super::{Failure, Step};
use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{
    GetLastError, SetLastError, ERROR_CLASS_ALREADY_EXISTS, HINSTANCE, HWND, LPARAM, LRESULT,
    WPARAM,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, MessageBoxW, RegisterClassExW,
    UnregisterClassW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, WNDCLASSEXW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_OVERLAPPED,
};

/// Distinct from tao's "Tao Thread Event Target" so the two never collide.
const CLASS_NAME: &str = "Houston Window Preflight";
const SUBCLASS_ID: usize = 1;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    DefWindowProcW(hwnd, msg, w, l)
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    w: WPARAM,
    l: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    DefSubclassProc(hwnd, msg, w, l)
}

/// Register a class, create a hidden window with exactly the extended
/// styles tao gives its message-target window, subclass it, then tear
/// everything down. Every resource is released on every path so a retry
/// starts clean.
pub(super) fn probe() -> Result<(), Failure> {
    let class_name = wide(CLASS_NAME);
    // SAFETY: plain Win32 calls on a class this module owns; the name
    // buffer outlives every use and the class is unregistered before it
    // is dropped.
    unsafe {
        let instance: HINSTANCE = GetModuleHandleW(null());
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: 0,
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: null_mut(),
        };
        // A class left behind by an earlier attempt whose window would not
        // die is still ours: probe through it rather than fail on it.
        SetLastError(0);
        if RegisterClassExW(&class) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS {
            return Err(failure(Step::RegisterClass));
        }
        let result = probe_window(class_name.as_ptr(), instance);
        UnregisterClassW(class_name.as_ptr(), instance);
        result
    }
}

unsafe fn probe_window(class_name: *const u16, instance: HINSTANCE) -> Result<(), Failure> {
    SetLastError(0);
    let window = CreateWindowExW(
        WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW,
        class_name,
        null(),
        WS_OVERLAPPED,
        0,
        0,
        0,
        0,
        null_mut(),
        null_mut(),
        instance,
        null(),
    );
    if window.is_null() {
        return Err(failure(Step::CreateWindow));
    }
    // comctl32 documents only FALSE on failure, so clear the thread's error
    // first: a stale code from an earlier call must not pose as the cause.
    SetLastError(0);
    let result = if SetWindowSubclass(window, Some(subclass_proc), SUBCLASS_ID, 0) != 0 {
        RemoveWindowSubclass(window, Some(subclass_proc), SUBCLASS_ID);
        Ok(())
    } else {
        Err(failure(Step::Subclass))
    };
    DestroyWindow(window);
    result
}

unsafe fn failure(step: Step) -> Failure {
    Failure {
        step,
        code: GetLastError(),
    }
}

/// Native message box; the only UI this process will ever show. Its own
/// window creation can fail for the same reason, in which case the
/// Sentry event and log line already sent are all that remains.
pub(super) fn show_dialog(title: &str, body: &str) {
    let title = wide(title);
    let body = wide(body);
    // SAFETY: both buffers are NUL-terminated and outlive the call.
    unsafe {
        MessageBoxW(
            null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST,
        );
    }
}
