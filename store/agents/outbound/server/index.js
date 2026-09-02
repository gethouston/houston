/**
 * Outbound A2A Local Server
 *
 * Accepts A2A (Agent-to-Agent protocol v0.3) requests from the Bio marketplace
 * and runs them through a full Claude agent loop with access to local tools:
 * bash (composio CLI, file ops), read/write files.
 *
 * Start with: node index.js
 * Tunnel with: cloudflared tunnel --url http://localhost:3001
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dir = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(__dir, '..');

const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY env var is required.');
  console.error('Set it with: set ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// OAuth tokens (sk-ant-oat...) use Authorization: Bearer
// API keys (sk-ant-api...) use x-api-key via the SDK
const isOAuthToken = ANTHROPIC_API_KEY.startsWith('sk-ant-oat');
const anthropic = isOAuthToken ? null : new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Raw Anthropic API call used when an OAuth token is present (SDK doesn't handle these cleanly)
async function anthropicMessagesCreate(params) {
  if (!isOAuthToken) return anthropic.messages.create(params);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status} ${err}`);
  }
  return res.json();
}

// ─── Tool definitions exposed to Claude ──────────────────────────────────────

const TOOLS = [
  {
    name: 'bash',
    description: 'Run a bash/shell command. Use this to call composio, read files, write files, etc. Working directory is the agent workspace.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path (absolute or relative to workspace).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates parent dirs if needed).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write.' },
        content: { type: 'string', description: 'Content to write.' },
      },
      required: ['path', 'content'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name, input) {
  try {
    if (name === 'bash') {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: WORKSPACE,
        timeout: 120_000,
        env: { ...process.env },
      });
      return (stdout + (stderr ? `\nSTDERR: ${stderr}` : '')).trim();
    }

    if (name === 'read_file') {
      const filePath = resolve(WORKSPACE, input.path);
      return await readFile(filePath, 'utf-8');
    }

    if (name === 'write_file') {
      const filePath = resolve(WORKSPACE, input.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content, 'utf-8');
      return `Written ${filePath}`;
    }

    return `Unknown tool: ${name}`;
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgent(userMessage, onToken) {
  // Build system prompt from CLAUDE.md
  let systemPrompt;
  try {
    systemPrompt = await readFile(join(WORKSPACE, 'CLAUDE.md'), 'utf-8');
    // Append A2A-specific note
    systemPrompt += `\n\n## A2A mode\nYou are currently being called via the A2A protocol from the Bio marketplace. The request comes from an external agent or API call. Run the requested skill autonomously. For the email co-writing step, draft all 3 emails yourself using the James Shields framework and your knowledge of outbound best practices — do not wait for interactive approval. Return a clear summary of everything completed when done.`;
  } catch {
    systemPrompt = 'You are the Outbound agent. Run the requested pipeline.';
  }

  const messages = [{ role: 'user', content: userMessage }];
  let finalText = '';

  // Agentic loop — keep running until end_turn or max iterations
  for (let iteration = 0; iteration < 50; iteration++) {
    const response = await anthropicMessagesCreate({
      model: 'claude-haiku-4-5',
      max_tokens: 8096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Collect any text from this turn
    for (const block of response.content) {
      if (block.type === 'text') {
        finalText += block.text;
        if (onToken) onToken(block.text);
      }
    }

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`[tool] ${block.name}:`, JSON.stringify(block.input).slice(0, 120));
          const result = await executeTool(block.name, block.input);
          console.log(`[result] ${result.slice(0, 200)}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return finalText;
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Health / GET
app.get('/', (req, res) => {
  res.json({ name: 'Outbound', version: '0.1.2', status: 'ok' });
});

// A2A message/send
app.post('/', async (req, res) => {
  const { id, method, params } = req.body || {};

  if (method !== 'message/send') {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }

  const userText = (params?.message?.parts || [])
    .filter(p => p.kind === 'text')
    .map(p => p.text)
    .join('\n');

  if (!userText.trim()) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32600, message: 'No text content in message' },
    });
  }

  console.log(`\n[A2A] message/send — "${userText.slice(0, 120)}"`);

  const taskId = `task-${Date.now()}`;
  const contextId = params?.message?.contextId || `ctx-${Date.now()}`;

  try {
    const result = await runAgent(userText);

    return res.json({
      jsonrpc: '2.0', id,
      result: {
        id: taskId,
        contextId,
        kind: 'task',
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            taskId,
            contextId,
            kind: 'message',
            parts: [{ kind: 'text', text: result }],
          },
        },
      },
    });
  } catch (err) {
    console.error('[agent error]', err.message);
    return res.status(500).json({
      jsonrpc: '2.0', id,
      error: { code: -32603, message: err.message },
    });
  }
});

app.listen(PORT, () => {
  console.log(`\nOutbound A2A server running on http://localhost:${PORT}`);
  console.log(`Workspace: ${WORKSPACE}`);
  console.log(`\nNext: open a second terminal and run:`);
  console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`Then copy the trycloudflare.com URL and run:`);
  console.log(`  node update-tunnel.js <that-url>\n`);
});
