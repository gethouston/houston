/**
 * Submit `form` the way pressing its submit button would. `requestSubmit` only
 * exists from Safari 16, and macOS 10.15 cannot install it, so the desktop app
 * there runs an older WebKit (HOUSTON-APP-5KR), where calling it threw and
 * Enter sent nothing. A cancelable bubbling `submit` event reaches React's `onSubmit` the
 * same way.
 */
export function submitForm(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
