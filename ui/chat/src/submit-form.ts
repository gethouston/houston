/**
 * Submit `form` the way pressing its submit button would. `requestSubmit` only
 * exists from Safari 16, and the desktop app still runs on the older WebKit of
 * macOS 10.15 to 12 (HOUSTON-APP-5KR), where calling it threw and Enter sent
 * nothing. A cancelable bubbling `submit` event reaches React's `onSubmit` the
 * same way.
 */
export function submitForm(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
