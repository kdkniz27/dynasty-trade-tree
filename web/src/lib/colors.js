// Deterministic color-per-team, matching the original app so every
// team keeps the same color everywhere it appears in a tree.

const TEAM_PALETTE = [
  '#5b8def', '#4caf7d', '#d99a3d', '#e5566d', '#f2c94c',
  '#3dbccb', '#e084c4', '#e0a458', '#6fcf97', '#f26d6d',
  '#7d9df2', '#57c2a8',
]
// NOTE: violet (#a56bf2, the "drafted" accent) is deliberately excluded
// so it never collides with a team's assigned color - it always means
// one specific thing: "this pick became a player."

export function colorForTeam(name) {
  if (!name) return '#8b93a3'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TEAM_PALETTE[Math.abs(hash) % TEAM_PALETTE.length]
}

export function truncateId(id) {
  return id && id.length > 8 ? '…' + id.slice(-6) : id
}
