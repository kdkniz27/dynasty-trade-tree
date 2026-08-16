import React, { useState } from 'react'
import { colorForTeam } from '../lib/colors.js'
import { AssetGroupBox, SectionLabel, CollapseIndicator } from './Shared.jsx'
import { hasFrontier, countFrontier } from '../lib/treeUtils.js'
import Frontier from './Frontier.jsx'

// A team banner showing what that team RECEIVED and what it SENT in
// a single trade, then whatever happens next to the assets it
// received. Only received assets continue down the tree - the team
// no longer holds what it sent away.
//
// Clicking the card collapses everything below it (what this team
// went on to do with what it received) without hiding the trade
// itself - useful for zooming out on a big tree without losing track
// of who was actually in it.
export function TeamBranch({ team, receives, sends }) {
  const color = colorForTeam(team)
  const [collapsed, setCollapsed] = useState(false)
  const canCollapse = hasFrontier(receives)

  return (
    <div className="branch">
      <div
        className="branch-header"
        style={{ color, background: color + '22', borderColor: color + '55' }}
      >
        {team}
      </div>

      <div
        className={'team-card' + (canCollapse ? ' collapsible' : '') + (collapsed ? ' is-collapsed' : '')}
        style={{ borderColor: color + '44' }}
        onClick={canCollapse ? () => setCollapsed((c) => !c) : undefined}
        role={canCollapse ? 'button' : undefined}
        tabIndex={canCollapse ? 0 : undefined}
      >
        {receives.length > 0 && (
          <>
            <SectionLabel>↓ RECEIVES</SectionLabel>
            <AssetGroupBox assets={receives} />
          </>
        )}
        {sends.length > 0 && (
          <>
            <SectionLabel>↑ SENDS</SectionLabel>
            <AssetGroupBox
              assets={sends}
              muted
              showCounterparty
              counterpartyKey="to_team"
            />
          </>
        )}
        {canCollapse && (
          <CollapseIndicator collapsed={collapsed} count={collapsed ? countFrontier(receives) : 0} />
        )}
      </div>

      {!collapsed && <Frontier assets={receives} />}
    </div>
  )
}

// Splits a set of traded assets into per-team views. A team appears if
// it received OR sent anything in this trade, and each team's card
// shows both sides.
export default function TeamGroups({ assets }) {
  const teams = []
  const seen = new Set()
  assets.forEach((a) => {
    ;[a.to_team?.name, a.from_team?.name].forEach((t) => {
      if (t && !seen.has(t)) {
        seen.add(t)
        teams.push(t)
      }
    })
  })

  const fanoutClass = ['fanout', 'team-fanout', teams.length > 1 ? 'multi' : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fanoutClass}>
      {teams.map((team) => (
        <TeamBranch
          key={team}
          team={team}
          receives={assets.filter((a) => a.to_team?.name === team)}
          sends={assets.filter((a) => a.from_team?.name === team)}
        />
      ))}
    </div>
  )
}
