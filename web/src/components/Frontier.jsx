import React, { useState } from 'react'
import { colorForTeam, truncateId } from '../lib/colors.js'
import { hasFrontier, countFrontier } from '../lib/treeUtils.js'
import { CollapseIndicator } from './Shared.jsx'
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
  const [collapsed, setCollapsed] = useState(false)
  const downstream = [{ name: d.player_name, type: 'player', trades: d.trades, drafted_as: null }]
  const canCollapse = hasFrontier(downstream)

  return (
    <>
      <div
        className={'drafted-card' + (canCollapse ? ' collapsible' : '') + (collapsed ? ' is-collapsed' : '')}
        onClick={canCollapse ? () => setCollapsed((c) => !c) : undefined}
        role={canCollapse ? 'button' : undefined}
        tabIndex={canCollapse ? 0 : undefined}
      >
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
        {canCollapse && (
          <CollapseIndicator collapsed={collapsed} count={collapsed ? countFrontier(downstream) : 0} />
        )}
      </div>

      {/* Keep following the drafted player's own future trades, if any. */}
      {!collapsed && <Frontier assets={downstream} />}
    </>
  )
}

function HopBlock({ group }) {
  const hopTrade = group[0].trades[0]
  const names = group.map((a) => a.name).join(', ')
  const [collapsed, setCollapsed] = useState(false)

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

  // The hop-block card itself only shows what happened IN THIS TRADE -
  // who was involved and what moved. Everything that happens AFTER it
  // (the trade's own two-sided split, or an asset traded yet again)
  // renders as siblings BELOW the card, not nested inside it - nesting
  // them inside .hop-block was making the bordered card stretch to
  // wrap every future generation, so one trade card could end up
  // hundreds of pixels tall with three unrelated "levels" glued inside
  // a single box. Each level now gets its own card, stacked top to
  // bottom, exactly like the root trade does.
  const continuing = group.filter((a) => a.trades.length > 1)
  const downstreamCount =
    countFrontier(hopTrade.assets || []) +
    continuing.reduce((sum, a) => sum + countFrontier([{ ...a, trades: a.trades.slice(1) }]), 0)
  const canCollapse = downstreamCount > 0

  return (
    <>
      <div
        className={'hop-block' + (canCollapse ? ' collapsible' : '') + (collapsed ? ' is-collapsed' : '')}
        onClick={canCollapse ? () => setCollapsed((c) => !c) : undefined}
        role={canCollapse ? 'button' : undefined}
        tabIndex={canCollapse ? 0 : undefined}
      >
        <div className="hop-tag">🔁 TRADED</div>
        <div className="hop-meta">
          <span>{hopTrade.date}</span>
          <span className="trade-id-pill" title={hopTrade.trade_id}>
            #{truncateId(hopTrade.trade_id)}
          </span>
        </div>
        <div className="hop-assets">{names}</div>
        {canCollapse && (
          <CollapseIndicator collapsed={collapsed} count={collapsed ? downstreamCount : 0} />
        )}
      </div>

      {!collapsed && hopTrade.assets?.length > 0 && <TeamGroups assets={hopTrade.assets} />}

      {!collapsed &&
        continuing.map((a) => (
          <React.Fragment key={a.asset_id || a.name}>
            <div className="continuing-label">{a.name} traded again</div>
            <Frontier assets={[{ ...a, trades: a.trades.slice(1) }]} />
          </React.Fragment>
        ))}
    </>
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
    <div className={items.length > 1 ? 'fanout multi' : 'fanout'}>
      {items.map(({ key, node }) => (
        <div className="branch frontier-branch" key={key}>
          {node}
        </div>
      ))}
    </div>
  )
}
