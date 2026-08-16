import React, { useMemo } from 'react'
import { truncateId } from '../lib/colors.js'
import TeamGroups from './TeamGroups.jsx'

function Legend() {
  return (
    <div id="legend">
      <span className="key">🏈 Player</span>
      <span className="key">🎫 Draft Pick</span>
      <span className="key">
        <span className="swatch" style={{ background: '#a56bf2' }}></span>
        Drafted with a traded pick (always this color)
      </span>
      <span className="key">Team pill color = that team, consistent throughout</span>
    </div>
  )
}

export default function TreeView({ tree }) {
  // Tracks which trade_ids have already been drawn anywhere in this
  // tree, so a trade that touches two branches we're already tracking
  // (e.g. two picks traded straight-up for each other) only gets drawn
  // once instead of twice. Rebuilt fresh every time the selected trade
  // changes.
  const renderedTrades = useMemo(() => {
    const s = new Set()
    s.add(tree.trade_id) // the root trade is already "shown" via the header
    return s
  }, [tree.trade_id])

  return (
    <div className="tree-wrap" key={tree.trade_id}>
      <div id="tree-header">
        <div id="tree-title">Trade {truncateId(tree.trade_id)}</div>
        <div id="tree-subtitle">
          {tree.date} &middot; full ID: {tree.trade_id}
        </div>
      </div>

      <Legend />

      <div className="title-stem" />

      <TeamGroups assets={tree.assets} renderedTrades={renderedTrades} />
    </div>
  )
}
