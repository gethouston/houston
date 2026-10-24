# Shared helpers for the Academy hooks. Plain POSIX tools only: these run under bash on macOS
# (bash 3.2) and under Git Bash on Windows, with no jq or node.

# json_field NAME: first string value of "NAME" in the hook input ($input).
json_field() {
	printf '%s' "$input" | tr '\n' ' ' | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# academy_dir: the Academy project this hook is running in, or nothing.
academy_dir() {
	for d in "$CLAUDE_PROJECT_DIR" "$(json_field cwd)"; do
		[ -n "$d" ] && [ -d "$d/.academy" ] && { printf '%s' "$d"; return; }
	done
}

# academy_lang DIR: "es" or "en", from .academy/profile.json.
academy_lang() {
	if grep -q '"language"[[:space:]]*:[[:space:]]*"es"' "$1/.academy/profile.json" 2>/dev/null; then
		printf 'es'
	else
		printf 'en'
	fi
}
