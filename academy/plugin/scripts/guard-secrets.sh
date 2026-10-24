#!/usr/bin/env bash
# Red flag: a secret (API key, token, private key) written into a project file.
# Secrets belong in a .env file that is never published or committed, or in the host's settings.
input=$(cat)
. "$(dirname "$0")/common.sh"

project=$(academy_dir)
[ -n "$project" ] || exit 0

file=$(json_field file_path)
case "$(basename "$file")" in
	.env.example | .env.sample | .env.template) ;; # shared templates must not hold real values
	.env | .env.*) exit 0 ;;                           # the right place for a secret
esac

patterns='sk-ant-[A-Za-z0-9_-]{20,}|(^|[^A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{20,}|[rs]k_live_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|token)[A-Za-z_]*[^A-Za-z0-9]{1,8}[:=][^A-Za-z0-9]{0,8}[A-Za-z0-9_-]{32,}'
# Only what is being written counts: drop old_string values, so removing a secret is allowed.
written=$(printf '%s' "$input" | tr '\n' ' ' | sed -E 's/"old_string"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"//g')
printf '%s' "$written" | grep -Eqi "$patterns" || exit 0

lang=$(academy_lang "$project")
langname=English; [ "$lang" = es ] && langname=Spanish
cat >&2 <<MSG
Houston Academy tutor blocked this edit: it looks like it writes a secret (an API key, token or private key) into ${file:-a project file}. Files like this can be published or shared, and then anyone can copy the secret and use it, while the bill goes to the learner.
Do not retry with the secret in any file other than a .env file. Explain to the learner, in ${langname} and in plain words: what just happened, why a key must never live in the page or in shared files (Course 1, lesson 7 "API keys"), and the safe place for it (a .env file that is never published or committed, or the hosting company's secret settings). Then propose the safe way and ask before continuing. If the learner pasted a real key into the chat, tell them to treat it as exposed: revoke it in the company's dashboard and create a new one.
MSG
exit 2
