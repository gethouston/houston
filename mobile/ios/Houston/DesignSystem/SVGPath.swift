import CoreGraphics
import SwiftUI

/// Minimal SVG path-data → `Path` converter. It ingests the verbatim `d` strings
/// from a source SVG (so coordinates are exact, not hand-transcribed) and builds
/// a `Path` in the SVG's own viewBox space. SwiftUI and SVG share a top-left,
/// y-down coordinate system, so no axis flip is needed.
///
/// Supports the command set used by the Houston helmet glyph plus the common
/// remainder: M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z/z. Unknown commands are
/// skipped rather than throwing — a malformed glyph degrades to a partial draw,
/// never a crash.
enum SVGPath {
    /// Build a `Path` in viewBox units from a path `d` string.
    static func rawPath(from d: String) -> Path {
        var path = Path()
        var tokens = Tokenizer(d)
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var lastCmd: Character = " "

        while let cmd = tokens.nextCommand(after: lastCmd) {
            lastCmd = cmd
            let rel = cmd.isLowercase
            switch Character(cmd.lowercased()) {
            case "m":
                let p = tokens.point(rel: rel, from: current)
                current = p; start = p; path.move(to: p); lastControl = nil
                lastCmd = rel ? "l" : "L"   // subsequent pairs are implicit line-tos
            case "l":
                current = tokens.point(rel: rel, from: current); path.addLine(to: current); lastControl = nil
            case "h":
                current.x = tokens.coord(rel: rel, base: current.x); path.addLine(to: current); lastControl = nil
            case "v":
                current.y = tokens.coord(rel: rel, base: current.y); path.addLine(to: current); lastControl = nil
            case "c":
                let c1 = tokens.point(rel: rel, from: current)
                let c2 = tokens.point(rel: rel, from: current)
                let end = tokens.point(rel: rel, from: current)
                path.addCurve(to: end, control1: c1, control2: c2); lastControl = c2; current = end
            case "s":
                let c1 = reflect(lastControl, over: current)
                let c2 = tokens.point(rel: rel, from: current)
                let end = tokens.point(rel: rel, from: current)
                path.addCurve(to: end, control1: c1, control2: c2); lastControl = c2; current = end
            case "q":
                let c = tokens.point(rel: rel, from: current)
                let end = tokens.point(rel: rel, from: current)
                path.addQuadCurve(to: end, control: c); lastControl = c; current = end
            case "t":
                let c = reflect(lastControl, over: current)
                let end = tokens.point(rel: rel, from: current)
                path.addQuadCurve(to: end, control: c); lastControl = c; current = end
            case "a":
                let rx = tokens.number(), ry = tokens.number()
                let rot = tokens.number(), large = tokens.number() != 0, sweep = tokens.number() != 0
                let end = tokens.point(rel: rel, from: current)
                appendArc(&path, from: current, to: end, rx: rx, ry: ry, rotationDeg: rot, largeArc: large, sweep: sweep)
                current = end; lastControl = nil
            case "z":
                path.closeSubpath(); current = start; lastControl = nil
            default:
                return path   // unknown command: stop cleanly
            }
        }
        return path
    }

    /// Aspect-fit transform mapping a viewBox into `rect`, centered.
    static func fitTransform(viewBox: CGSize, in rect: CGRect) -> CGAffineTransform {
        guard viewBox.width > 0, viewBox.height > 0 else { return .identity }
        let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
        let dx = rect.minX + (rect.width - viewBox.width * scale) / 2
        let dy = rect.minY + (rect.height - viewBox.height * scale) / 2
        return CGAffineTransform(translationX: dx, y: dy).scaledBy(x: scale, y: scale)
    }

    private static func reflect(_ control: CGPoint?, over point: CGPoint) -> CGPoint {
        guard let c = control else { return point }
        return CGPoint(x: 2 * point.x - c.x, y: 2 * point.y - c.y)
    }

    /// Endpoint elliptical arc → cubic bezier segments (≤ 90° each).
    private static func appendArc(
        _ path: inout Path, from p0: CGPoint, to p1: CGPoint,
        rx: CGFloat, ry: CGFloat, rotationDeg: CGFloat, largeArc: Bool, sweep: Bool
    ) {
        var rx = abs(rx), ry = abs(ry)
        if rx == 0 || ry == 0 { path.addLine(to: p1); return }
        let phi = rotationDeg * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { let s = sqrt(lambda); rx *= s; ry *= s }
        let sign: CGFloat = largeArc == sweep ? -1 : 1
        let num = max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let co = sign * sqrt(den == 0 ? 0 : num / den)
        let cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx
        let cx = cosP * cxp - sinP * cyp + (p0.x + p1.x) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.y + p1.y) / 2
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step = delta / CGFloat(segments)
        let t = 4.0 / 3.0 * tan(step / 4)
        var angleStart = theta1
        for _ in 0..<segments {
            let a1 = angleStart, a2 = angleStart + step
            let e1 = ellipse(cx, cy, rx, ry, cosP, sinP, a1)
            let e2 = ellipse(cx, cy, rx, ry, cosP, sinP, a2)
            let d1 = ellipseDeriv(rx, ry, cosP, sinP, a1)
            let d2 = ellipseDeriv(rx, ry, cosP, sinP, a2)
            path.addCurve(
                to: e2,
                control1: CGPoint(x: e1.x + t * d1.x, y: e1.y + t * d1.y),
                control2: CGPoint(x: e2.x - t * d2.x, y: e2.y - t * d2.y)
            )
            angleStart = a2
        }
    }

    private static func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ cosP: CGFloat, _ sinP: CGFloat, _ a: CGFloat) -> CGPoint {
        let x = rx * cos(a), y = ry * sin(a)
        return CGPoint(x: cx + cosP * x - sinP * y, y: cy + sinP * x + cosP * y)
    }

    private static func ellipseDeriv(_ rx: CGFloat, _ ry: CGFloat, _ cosP: CGFloat, _ sinP: CGFloat, _ a: CGFloat) -> CGPoint {
        let x = -rx * sin(a), y = ry * cos(a)
        return CGPoint(x: cosP * x - sinP * y, y: sinP * x + cosP * y)
    }

    private static func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
        let dot = ux * vx + uy * vy
        let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
        var a = acos(max(-1, min(1, len == 0 ? 1 : dot / len)))
        if ux * vy - uy * vx < 0 { a = -a }
        return a
    }
}

/// Scans a path `d` string into commands and numbers, tolerating comma/space
/// separators, leading-dot numbers, signs, and scientific notation.
private struct Tokenizer {
    private let chars: [Character]
    private var i = 0
    init(_ s: String) { chars = Array(s) }

    /// The next command letter, or (for implicit repeats) `implicit` when more
    /// numbers follow without a fresh command. Returns nil at the end.
    mutating func nextCommand(after implicit: Character) -> Character? {
        skipSeparators()
        guard i < chars.count else { return nil }
        if chars[i].isLetter { let c = chars[i]; i += 1; return c }
        return implicit   // more numbers → repeat the previous command
    }

    mutating func number() -> CGFloat {
        skipSeparators()
        var s = ""
        if i < chars.count, chars[i] == "+" || chars[i] == "-" { s.append(chars[i]); i += 1 }
        var seenDot = false
        while i < chars.count {
            let c = chars[i]
            if c.isNumber { s.append(c); i += 1 }
            else if c == "." && !seenDot { seenDot = true; s.append(c); i += 1 }
            else if c == "e" || c == "E" {
                s.append(c); i += 1
                if i < chars.count, chars[i] == "+" || chars[i] == "-" { s.append(chars[i]); i += 1 }
            } else { break }
        }
        return CGFloat(Double(s) ?? 0)
    }

    mutating func coord(rel: Bool, base: CGFloat) -> CGFloat { (rel ? base : 0) + number() }

    mutating func point(rel: Bool, from p: CGPoint) -> CGPoint {
        CGPoint(x: coord(rel: rel, base: p.x), y: coord(rel: rel, base: p.y))
    }

    private mutating func skipSeparators() {
        while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" || chars[i] == "\t" || chars[i] == "\r" {
            i += 1
        }
    }
}
