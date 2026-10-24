#!/usr/bin/env bash
# Tests for the Academy red-flag hooks: feed sample hook inputs, check the decision.
# Run: plugins/academy/tests/test-hooks.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
scripts="$here/../scripts"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

project="$work/project"
mkdir -p "$project/.academy"
echo '{"language": "es", "course": "0"}' >"$project/.academy/profile.json"
git -C "$project" init -q
export CLAUDE_PROJECT_DIR="$project"

fails=0
expect() { # expect NAME SCRIPT EXIT_CODE INPUT [STDOUT_PATTERN]
	out=$(printf '%s' "$4" | "$scripts/$2" 2>/dev/null)
	code=$?
	if [ "$code" != "$3" ] || { [ -n "${5:-}" ] && ! printf '%s' "$out" | grep -q "$5"; }; then
		echo "FAIL $1 (exit $code)"
		fails=$((fails + 1))
	else
		echo "ok   $1"
	fi
}
# Built from parts so secret scanners don't flag this fake key.
key="sk-ant-"'api03-'"Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0"

expect 'key written into a page is blocked' guard-secrets.sh 2 "{\"tool_input\":{\"file_path\":\"$project/index.html\",\"content\":\"const KEY='$key'\"}}"
expect 'generic apiKey assignment is blocked' guard-secrets.sh 2 "{\"tool_input\":{\"file_path\":\"$project/app.js\",\"content\":\"const apiKey = \\\"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8\\\";\"}}"
expect 'key in .env.example is blocked' guard-secrets.sh 2 "{\"tool_input\":{\"file_path\":\"$project/.env.example\",\"content\":\"KEY=$key\"}}"
expect 'key in .env is allowed' guard-secrets.sh 0 "{\"tool_input\":{\"file_path\":\"$project/.env\",\"content\":\"KEY=$key\"}}"
expect 'removing a key is allowed' guard-secrets.sh 0 "{\"tool_input\":{\"file_path\":\"$project/index.html\",\"old_string\":\"const KEY=\\\"$key\\\"\",\"new_string\":\"\"}}"
expect 'normal page is allowed' guard-secrets.sh 0 "{\"tool_input\":{\"file_path\":\"$project/index.html\",\"content\":\"<h1>task-manager-for-teams-and-everyone</h1>\"}}"
CLAUDE_PROJECT_DIR="$work" expect 'non-Academy folders are ignored' guard-secrets.sh 0 "{\"cwd\":\"$work\",\"tool_input\":{\"file_path\":\"$work/x.html\",\"content\":\"$key\"}}"

expect 'force-push asks the learner' guard-git.sh 0 "{\"tool_input\":{\"command\":\"git push --force origin main\"}}" '"permissionDecision":"ask"'
expect 'push -f asks the learner' guard-git.sh 0 "{\"tool_input\":{\"command\":\"git push -f\"}}" '"permissionDecision":"ask"'
expect 'normal push is allowed' guard-git.sh 0 "{\"tool_input\":{\"command\":\"git push origin main\"}}"
echo 'X=1' >"$project/.env"
expect 'git add with an unignored .env is blocked' guard-git.sh 2 "{\"tool_input\":{\"command\":\"git add -A\"}}"
echo '.env' >"$project/.gitignore"
expect 'git add with .env ignored is allowed' guard-git.sh 0 "{\"tool_input\":{\"command\":\"git add -A && git commit -m init\"}}"
expect 'other commands are allowed' guard-git.sh 0 "{\"tool_input\":{\"command\":\"ls -la\"}}"

# The force-push reason must be valid JSON
printf '%s' '{"tool_input":{"command":"git push -f"}}' | "$scripts/guard-git.sh" | python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null &&
	echo "ok   force-push output is valid JSON" || { echo "FAIL force-push output is valid JSON"; fails=$((fails + 1)); }

[ "$fails" = 0 ] && echo "all hook tests passed" || { echo "$fails failed"; exit 1; }
