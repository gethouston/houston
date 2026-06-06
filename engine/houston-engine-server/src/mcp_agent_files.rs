//! Stdio MCP server exposing Houston-controlled project-file tools.
//!
//! Launched by Claude Code from a generated `--mcp-config` when an agent uses
//! `tool_mode: "restricted"`. All filesystem operations go through
//! `houston_engine_core::agents::files`, which enforces `.houston/policy.json`.

use houston_engine_core::agents::files;
use houston_engine_core::paths::expand_tilde;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

pub fn run_from_args(args: &[String]) -> i32 {
    let Some(agent_root) = parse_agent_root(args) else {
        eprintln!("missing required --agent-root <path>");
        return 2;
    };
    run(agent_root)
}

fn parse_agent_root(args: &[String]) -> Option<PathBuf> {
    args.windows(2)
        .find(|pair| pair[0] == "--agent-root")
        .map(|pair| expand_tilde(std::path::Path::new(&pair[1])))
}

fn run(agent_root: PathBuf) -> i32 {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            return 1;
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(id) = req.get("id").cloned() else {
            continue;
        };
        let method = req.get("method").and_then(Value::as_str).unwrap_or("");
        let result = match method {
            "initialize" => Ok(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "houston_files", "version": env!("CARGO_PKG_VERSION") }
            })),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => call_tool(&agent_root, req.get("params").unwrap_or(&Value::Null)),
            _ => Err(format!("unsupported method: {method}")),
        };
        let response = match result {
            Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
            Err(message) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32000, "message": message }
            }),
        };
        if writeln!(stdout, "{}", response).is_err() {
            return 1;
        }
        if stdout.flush().is_err() {
            return 1;
        }
    }
    0
}

fn tools() -> Vec<Value> {
    vec![
        json!({
            "name": "list_allowed_files",
            "description": "List user-facing files and folders the current Houston agent is allowed to access.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_allowed_file",
            "description": "Read a text file by relative path, only if it is inside this agent's allowed roots.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path from the agent folder." }
                },
                "required": ["path"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "write_allowed_file",
            "description": "Write a text file by relative path, only if it is inside this agent's allowed roots.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path from the agent folder." },
                    "content": { "type": "string", "description": "Full text content to write." }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "search_allowed_files",
            "description": "Search allowed user-facing text files by path, file name, and line content.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
                },
                "required": ["query"],
                "additionalProperties": false
            }
        }),
    ]
}

fn call_tool(agent_root: &PathBuf, params: &Value) -> Result<Value, String> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "tool name is required".to_string())?;
    let args = params.get("arguments").unwrap_or(&Value::Null);
    match name {
        "list_allowed_files" => text_result(list_allowed_files(agent_root)?),
        "read_allowed_file" => {
            let path = string_arg(args, "path")?;
            text_result(files::read_project_file(agent_root, path).map_err(|e| e.to_string())?)
        }
        "write_allowed_file" => {
            let path = string_arg(args, "path")?;
            let content = string_arg(args, "content")?;
            files::write_project_file(agent_root, path, content).map_err(|e| e.to_string())?;
            text_result(format!("wrote {path}"))
        }
        "search_allowed_files" => {
            let query = string_arg(args, "query")?;
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .clamp(1, 50) as usize;
            let matches =
                files::search_project_files(agent_root, query, limit).map_err(|e| e.to_string())?;
            text_result(serde_json::to_string_pretty(&matches).map_err(|e| e.to_string())?)
        }
        _ => Err(format!("unknown tool: {name}")),
    }
}

fn list_allowed_files(agent_root: &PathBuf) -> Result<String, String> {
    let files = files::list_project_files(agent_root).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&files).map_err(|e| e.to_string())
}

fn string_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("{key} is required"))
}

fn text_result(text: String) -> Result<Value, String> {
    Ok(json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_agent_root_arg() {
        let args = vec![
            "mcp-agent-files".into(),
            "--agent-root".into(),
            "C:/tmp/agent".into(),
        ];
        assert!(parse_agent_root(&args).is_some());
    }
}
