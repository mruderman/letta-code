export PATH="/tmp/letta-tmux-qa/tools/bin:/tmp/letta-tmux-qa/variants/v0111-sdk072/node_modules/.bin:$PATH"
export HOME="/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/home" LETTA_LOCAL_BACKEND_DIR="/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/home/letta-local-backend" LETTA_CODE_TELEM=0
export LETTA_ACP_BACKEND=local LETTA_ACP_MODEL="openai/gpt-5.6-luna" NODE_USE_ENV_PROXY=1
# The OpenAI key never exists here: the session's egress proxy injects it for api.openai.com. A placeholder satisfies the SDK.
export OPENAI_API_KEY=placeholder
unset LETTA_API_KEY LETTA_AGENT_ID
export LETTA_AGENT_ID=agent-local-43852ed1-9278-4426-b4c7-a6f134a03c88
mkdir -p "/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/home" "/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/work"; cd "/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/work"
exec toad acp --title "Letta" --project-dir "/tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/work" "node /home/user/e2e-wt/e2e/tmux-qa/../scripts/acp-tap.mjs --log /tmp/letta-tmux-qa/runs/walk-v0111-sdk072-3/wire-after-restart.ndjson -- letta-acp"
