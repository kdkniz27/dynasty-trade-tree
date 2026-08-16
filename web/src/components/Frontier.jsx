import React from 'react'
import { colorForTeam, truncateId } from '../lib/colors.js'
import TeamGroups from './TeamGroups.jsx'

function groupBy(items, keyFn) {
  const map = {}
  items.forEach((item) => {
    const key = keyFn(item)
    if (!map[key]) map[key] = []
    map[key].push(item)
  })
  return map
}

// A draft selection. Full-width block in the vertical timeline.
function DraftedBlock({ asset }) {
  const d = asset.drafted_as
  const color = colorForTeam(d.drafted_by?.name)

  return (
    <>
      <div className="drafted-card">
        <div className="drafted-tag">🎯 DRAFTED</div>
        <div className="drafted-from">{asset.name}</div>
        <div className="drafted-detail">
          Round {d.round}
          {d.pick_no ? ` · Pick #${d.pick_no} overall` : ''}
        </div>
        <div className="drafted-by" style={{ color }}>
          by {d.drafted_by?.name}
        </div>
        <div className="drafted-player">🏈 {d.player_name}</div>
      </div>

      {/* Keep following the drafted player's own future trades. */}
      <Frontier
        assets={[{ name: d.player_name, type: 'player', trades: d.trades, drafted_as: null }]}
      />
    </>
  )
}

function HopBlock({ group }) {
  const hopTrade = group[0].trades[0]

  // already_shown is computed once, server-side, in generate_data.py -
  // the first branch to reach a given trade_id gets it drawn in full,
  // every other branch that reaches the same trade_id gets this
  // lightweight reference instead. (This used to be tracked with a
  // Set mutated during React's render, which broke under React
  // StrictMode's intentional double-render in development - some
  // branches would vanish depending on render order. Doing the dedup
  // once as pure data sidesteps that entirely.)
  if (hopTrade.already_shown) {
    const names = group.map((a) => a.name).join(', ')
    return (
      <div className="hop-ref">
        <div className="hop-ref-assets">{names}</div>
        <div className="hop-ref-body">
          also moved in{' '}
          <span className="trade-id-pill" title={hopTrade.trade_id}>
            #{truncateId(hopTrade.trade_id)}
          </span>{' '}
          on {hopTrade.date} — that trade is drawn in full elsewhere in this tree
        </div>
      </div>
    )
  }

  return (
    <div className="hop-block">
      <div className="hop-label">
        <span className="hop-tag">TRADED</span>
        <span className="hop-date">{hopTrade.date}</span>
        <span className="trade-id-pill" title={hopTrade.trade_id}>
          #{truncateId(hopTrade.trade_id)}
        </span>
      </div>

      {hopTrade.assets?.length > 0 && <TeamGroups assets={hopTrade.assets} />}

      {group.map((a) =>
        a.trades.length > 1 ? (
          <React.Fragment key={a.asset_id || a.name}>
            <div className="continuing-label">{a.name} traded again</div>
            <Frontier assets={[{ ...a, trades: a.trades.slice(1) }]} />
          </React.Fragment>
        ) : null
      )}
    </div>
  )
}

// Everything that happens NEXT to a set of assets stacks in one
// vertical timeline, top to bottom in chronological order - a draft
// selection, then a subsequent trade, then whatever happened after
// that. When the SAME team's assets fork into genuinely independent
// futures (e.g. it traded two of its four new pieces separately),
// those futures stack as separate blocks in this same column rather
// than sprawling sideways. The only place this tree still branches
// horizontally is a trade itself having multiple destination teams
// (see TeamGroups) - a true fork in a single moment, not a timeline.
export default function Frontier({ assets }) {
  const items = []

  assets
    .filter((a) => a.drafted_as)
    .forEach((a) => {
      items.push({ key: a.asset_id + '-drafted', node: <DraftedBlock asset={a} /> })
    })

  const withNext = assets.filter((a) => a.trades && a.trades.length > 0)
  const byTradeId = groupBy(withNext, (a) => a.trades[0].trade_id)
  Object.entries(byTradeId).forEach(([tradeId, group]) => {
    items.push({ key: tradeId, node: <HopBlock group={group} /> })
  })

  if (items.length === 0) return null

  return (
    <div className="timeline">
      {items.map(({ key, node }) => (
        <div className="timeline-item" key={key}>
          <div className="stem" />
          {node}
        </div>
      ))}
    </div>
  )
}
