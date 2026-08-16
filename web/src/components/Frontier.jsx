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

// A draft selection. Its own independent branch - if the drafted
// player was never traded again, this is a dead end (Frontier below
// returns nothing), not a step leading into whatever else happens to
// be nearby.
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

      {/* Keep following the drafted player's own future trades, if any. */}
      <Frontier
        assets={[{ name: d.player_name, type: 'player', trades: d.trades, drafted_as: null }]}
      />
    </>
  )
}

function HopBlock({ group }) {
  const hopTrade = group[0].trades[0]
  const names = group.map((a) => a.name).join(', ')

  // already_shown is computed once, server-side, in generate_data.py -
  // the first branch to reach a given trade_id gets it drawn in full,
  // every other branch that reaches the same trade_id gets this
  // lightweight reference instead. (This used to be tracked with a
  // Set mutated during React's render, which broke under React
  // StrictMode's intentional double-render in development - some
  // branches would vanish depending on render order. Doing the dedup
  // once as pure data sidesteps that entirely.)
  if (hopTrade.already_shown) {
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
      <div className="hop-tag">🔁 TRADED</div>
      <div className="hop-meta">
        <span>{hopTrade.date}</span>
        <span className="trade-id-pill" title={hopTrade.trade_id}>
          #{truncateId(hopTrade.trade_id)}
        </span>
      </div>
      <div className="hop-assets">{names}</div>

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

// Everything that happens NEXT to a set of assets: a draft selection,
// a subsequent trade, whatever comes after that. These are genuinely
// PARALLEL, independent branches (the team held onto 4 things and did
// 4 different things with them later) - so they sit side by side, in
// chronological order left to right, exactly like the two sides of a
// single trade do. What's NOT parallel is the deeper future of any
// ONE of these branches - that continues straight down, nested inside
// its own branch, which is what actually keeps this tree from
// sprawling sideways as it goes deeper.
export default function Frontier({ assets }) {
  const items = []

  assets
    .filter((a) => a.drafted_as)
    .forEach((a) => {
      items.push({
        key: a.asset_id + '-drafted',
        date: a.drafted_as.date || '',
        node: <DraftedBlock asset={a} />,
      })
    })

  const withNext = assets.filter((a) => a.trades && a.trades.length > 0)
  const byTradeId = groupBy(withNext, (a) => a.trades[0].trade_id)
  Object.entries(byTradeId).forEach(([tradeId, group]) => {
    items.push({ key: tradeId, date: group[0].trades[0].date || '', node: <HopBlock group={group} /> })
  })

  if (items.length === 0) return null

  items.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="fanout">
      {items.map(({ key, node }) => (
        <div className="branch frontier-branch" key={key}>
          {node}
        </div>
      ))}
    </div>
  )
}
