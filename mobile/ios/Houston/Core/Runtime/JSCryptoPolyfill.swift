import Foundation
import JavaScriptCore
import Security

/// Installs `crypto.getRandomValues` over `SecRandomCopyBytes`.
///
/// The SDK uses it for nonce entropy and falls back to `Math.random` when it is
/// absent (BRIDGE.md §10), so this is *recommended, not required* — but a real
/// CSPRNG is cheap and worth it. `getRandomValues(view)` fills the passed typed
/// array's backing bytes in place and returns the same object, matching the WHATWG
/// contract the bundle expects.
enum JSCryptoPolyfill {
    /// Cryptographically secure random bytes. Pure and off-device testable.
    ///
    /// - Returns: `count` random bytes (empty for a non-positive `count`).
    static func randomBytes(count: Int) -> [UInt8] {
        guard count > 0 else { return [] }
        var bytes = [UInt8](repeating: 0, count: count)
        let status = bytes.withUnsafeMutableBytes { buf in
            SecRandomCopyBytes(kSecRandomDefault, count, buf.baseAddress!)
        }
        guard status == errSecSuccess else {
            // Never hand back a zeroed (predictable) nonce buffer. Swift's default
            // generator is itself a system CSPRNG on Apple platforms, so degrade to
            // it and log — there is no UI thread here to toast on.
            JSRuntimeLog.runtime.error(
                "SecRandomCopyBytes failed (status \(status)); using system RNG fallback"
            )
            var rng = SystemRandomNumberGenerator()
            for i in 0..<count { bytes[i] = UInt8.random(in: .min ... .max, using: &rng) }
            return bytes
        }
        return bytes
    }

    /// Define `crypto.getRandomValues` on the context's global object.
    static func install(into context: JSContext) {
        let getRandomValues: @convention(block) (JSValue) -> JSValue = { view in
            fillTypedArray(view)
            return view
        }
        let crypto = JSValue(newObjectIn: context)
        crypto?.setObject(getRandomValues, forKeyedSubscript: "getRandomValues" as NSString)
        context.setObject(crypto, forKeyedSubscript: "crypto" as NSString)
    }

    /// Overwrite the typed array's backing bytes with fresh entropy, in place.
    private static func fillTypedArray(_ view: JSValue) {
        guard let ctx = view.context?.jsGlobalContextRef else { return }
        let ref = view.jsValueRef
        var exception: JSValueRef?
        guard JSValueGetTypedArrayType(ctx, ref, &exception) != kJSTypedArrayTypeNone else {
            return // not a typed array: nothing to fill (SDK never calls it this way)
        }
        let byteLength = JSObjectGetTypedArrayByteLength(ctx, ref, &exception)
        guard byteLength > 0, let dest = JSObjectGetTypedArrayBytesPtr(ctx, ref, &exception)
        else { return }
        let bytes = randomBytes(count: byteLength)
        bytes.withUnsafeBytes { src in
            if let base = src.baseAddress { memcpy(dest, base, byteLength) }
        }
    }
}
