//! Parse and validate workflow plan JSON from an AI planner.

use crate::error::{CoreError, CoreResult};
use crate::workflows::types::{WorkflowPlan, WorkflowStep};
use std::collections::{HashMap, HashSet};

/// Deserialize `raw` as a [`WorkflowPlan`] and validate structure.
pub fn parse_plan(raw: &str) -> CoreResult<WorkflowPlan> {
    let mut plan: WorkflowPlan = serde_json::from_str(raw)?;
    normalize_plan(&mut plan);
    validate_plan(&plan)?;
    Ok(plan)
}

/// Pull a JSON object out of a planner model response (raw JSON or fenced block).
pub fn extract_plan_json(raw: &str) -> Option<&str> {
    crate::workflows::plan_extract::extract_plan_json(raw)
}

fn planner_parse_error(raw: &str) -> CoreError {
    if raw.trim().is_empty() {
        return CoreError::BadRequest(
            "planner returned no text. The model may have used tools instead of replying with a plan."
                .into(),
        );
    }
    let preview: String = raw.chars().take(240).collect();
    CoreError::BadRequest(format!(
        "planner response did not contain a JSON object. Start of response: {preview}"
    ))
}

/// Parse a planner turn response: extract JSON, validate DAG, apply run guards.
pub fn parse_plan_from_response(raw: &str) -> CoreResult<WorkflowPlan> {
    let json = extract_plan_json(raw).ok_or_else(|| planner_parse_error(raw))?;
    validate_stored_plan(&parse_plan(json)?)
}

/// Validate a plan already deserialized (saved on a workflow def or run).
pub fn validate_stored_plan(plan: &WorkflowPlan) -> CoreResult<WorkflowPlan> {
    let mut plan = plan.clone();
    normalize_plan(&mut plan);
    validate_plan(&plan)?;
    crate::workflows::guards::enforce_run_limits(&plan)?;
    Ok(plan)
}

fn normalize_plan(plan: &mut WorkflowPlan) {
    for step in &mut plan.steps {
        let mut seen = std::collections::HashSet::new();
        step.toolkits = step
            .toolkits
            .iter()
            .map(|t| t.trim().to_lowercase())
            .filter(|t| !t.is_empty())
            .filter(|t| seen.insert(t.clone()))
            .collect();
    }
}

fn validate_plan(plan: &WorkflowPlan) -> CoreResult<()> {
    if plan.steps.is_empty() {
        return Err(CoreError::BadRequest(
            "workflow plan must contain at least one step".into(),
        ));
    }

    let mut ids = HashSet::new();
    for step in &plan.steps {
        if step.id.trim().is_empty() {
            return Err(CoreError::BadRequest(
                "workflow step id must not be empty".into(),
            ));
        }
        if !ids.insert(step.id.clone()) {
            return Err(CoreError::BadRequest(format!(
                "duplicate workflow step id: {}",
                step.id
            )));
        }
        if step.task.trim().is_empty() {
            return Err(CoreError::BadRequest(format!(
                "workflow step {} task must not be empty",
                step.id
            )));
        }
    }

    for step in &plan.steps {
        for dep in &step.depends_on {
            if !ids.contains(dep) {
                return Err(CoreError::BadRequest(format!(
                    "workflow step {} depends on unknown step id: {dep}",
                    step.id
                )));
            }
        }
    }

    if has_cycle(&plan.steps) {
        return Err(CoreError::BadRequest(
            "workflow plan contains a dependency cycle".into(),
        ));
    }

    Ok(())
}

fn has_cycle(steps: &[WorkflowStep]) -> bool {
    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();
    for step in steps {
        graph.insert(
            step.id.as_str(),
            step.depends_on.iter().map(String::as_str).collect(),
        );
    }

    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();

    for step in steps {
        if dfs_cycle(step.id.as_str(), &graph, &mut visiting, &mut visited) {
            return true;
        }
    }
    false
}

fn dfs_cycle<'a>(
    node: &'a str,
    graph: &HashMap<&'a str, Vec<&'a str>>,
    visiting: &mut HashSet<&'a str>,
    visited: &mut HashSet<&'a str>,
) -> bool {
    if visiting.contains(node) {
        return true;
    }
    if visited.contains(node) {
        return false;
    }
    visiting.insert(node);
    if let Some(deps) = graph.get(node) {
        for dep in deps {
            if dfs_cycle(dep, graph, visiting, visited) {
                return true;
            }
        }
    }
    visiting.remove(node);
    visited.insert(node);
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_json() -> &'static str {
        r#"{"steps":[
          {"id":"a","task":"scan src"},
          {"id":"b","task":"scan tests","depends_on":["a"]}
        ]}"#
    }

    #[test]
    fn valid_plan_round_trips() {
        let plan = parse_plan(sample_json()).unwrap();
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.steps[1].depends_on, vec!["a"]);
    }

    #[test]
    fn duplicate_ids_rejected() {
        let raw = r#"{"steps":[
          {"id":"a","task":"one"},
          {"id":"a","task":"two"}
        ]}"#;
        assert!(matches!(
            parse_plan(raw).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn empty_task_rejected() {
        let raw = r#"{"steps":[{"id":"a","task":"  "}]}"#;
        assert!(matches!(
            parse_plan(raw).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn dangling_dep_rejected() {
        let raw = r#"{"steps":[{"id":"a","task":"x","depends_on":["missing"]}]}"#;
        assert!(matches!(
            parse_plan(raw).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn cycle_rejected() {
        let raw = r#"{"steps":[
          {"id":"a","task":"x","depends_on":["b"]},
          {"id":"b","task":"y","depends_on":["a"]}
        ]}"#;
        assert!(matches!(
            parse_plan(raw).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn empty_steps_rejected() {
        let raw = r#"{"steps":[]}"#;
        assert!(matches!(
            parse_plan(raw).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn parse_plan_from_fenced_response() {
        let raw = format!("```json\n{}\n```", sample_json());
        let plan = super::parse_plan_from_response(&raw).unwrap();
        assert_eq!(plan.steps.len(), 2);
    }

    #[test]
    fn parse_plan_from_prose_prefix() {
        let raw = format!("Here is the workflow plan:\n{}", sample_json());
        let plan = super::parse_plan_from_response(&raw).unwrap();
        assert_eq!(plan.steps.len(), 2);
    }

    #[test]
    fn normalizes_toolkit_slugs() {
        let raw = r#"{"steps":[{"id":"a","task":"create folder","toolkits":[" Gmail ","GOOGLEDRIVE","gmail",""]}]}"#;
        let plan = parse_plan(raw).unwrap();
        assert_eq!(plan.steps[0].toolkits, vec!["gmail", "googledrive"]);
    }
}
