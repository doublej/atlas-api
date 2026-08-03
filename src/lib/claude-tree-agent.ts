// Server-only: drives the chosen agent SDK to carry out a CLAUDE.md action.
// Both SDKs spawn the user's already-authenticated local CLI (claude / codex),
// so no API keys are needed. The agent runs tool-free and returns text only —
// atlas applies the result to the editor buffer, keeping the save/history
// sidecar the sole writer to disk.

import { dirname } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { Codex } from '@openai/codex-sdk'
import {
  type ActionMode,
  type AgentAction,
  type AgentEngine,
  buildPrompt,
  extractResult,
  type PromptParams,
} from './claude-tree-actions'

export interface AgentRunParams extends PromptParams {
  engine: AgentEngine
}
export interface AgentRunResult {
  kind: ActionMode
  text: string
  engine: AgentEngine
}

/** Claude Agent SDK: single tool-free turn; collect the final result text. */
async function runClaude(system: string, user: string): Promise<string> {
  const conversation = query({
    prompt: user,
    options: {
      systemPrompt: system,
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'default',
      settingSources: [], // ignore on-disk project settings — context is supplied in the prompt
    },
  })
  for await (const msg of conversation) {
    if (msg.type === 'result' && msg.subtype === 'success') return msg.result
    if (msg.type === 'result') throw new Error(`claude: ${msg.subtype}`)
  }
  throw new Error('claude: no result')
}

/** Codex SDK: read-only sandbox, no approvals — it can only read, never write. */
async function runCodex(system: string, user: string, cwd: string): Promise<string> {
  const thread = new Codex().startThread({
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    skipGitRepoCheck: true,
    workingDirectory: cwd,
    networkAccessEnabled: false,
    webSearchEnabled: false,
  })
  const turn = await thread.run(`${system}\n\n${user}`)
  if (!turn.finalResponse) throw new Error('codex: empty response')
  return turn.finalResponse
}

const dispatch = (
  engine: AgentEngine,
  system: string,
  user: string,
  cwd: string,
): Promise<string> => (engine === 'codex' ? runCodex(system, user, cwd) : runClaude(system, user))

/** Run one entity action end-to-end and return the buffer edit or the prose answer. */
export async function runAction(params: AgentRunParams): Promise<AgentRunResult> {
  const { system, user } = buildPrompt(params)
  const raw = await dispatch(params.engine, system, user, dirname(params.filePath))
  const action: AgentAction = params.action
  return {
    kind: action.mode,
    text: action.mode === 'edit' ? extractResult(raw) : raw.trim(),
    engine: params.engine,
  }
}
