//! Share + receive an agent as a single `.houstonagent` file.
//!
//! The on-the-wire payload is opaque zip bytes built by
//! `houston_agent_portable`. This module is the thin engine-core layer that
//! reads live agent state from disk (CLAUDE.md, skills, routines, learnings),
//! shapes it into the portable [`Inventory`], and hands it to the writer.
//! The import counterpart will live in `import` once Chunk 3 lands.

pub mod anonymize;
pub mod export;
pub mod import;
pub mod scan;

#[cfg(test)]
mod tests;
