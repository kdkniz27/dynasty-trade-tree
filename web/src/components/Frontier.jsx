import React from 'react'
import { colorForTeam, truncateId } from '../lib/colors.js'
import { TeamPill } from './Shared.jsx'
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

// A draft selection, rendered as its own column so it sits on the same
// row as any sibling trades rather than stacking above them.
function DraftedColumn({ asset, renderedTrades }) {
  const d = asset.drafted_as
  const color = colorForTeam(d.drafted_by?.name)

  return (
    <div className="hop-column">
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
        renderedTrades={renderedTrades}
      />
    </div>
  )
}

function HopColumn({ group, renderedTrades }) {
  const hopTrade = group[0].trades[0]

  if (renderedTrades.has(hopTrade.trade_id)) {
    const names = group.map((a) => a.name).join(', ')
    return (
      <div className="hop-column">
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
      </div>
    )
  }
  renderedTrades.add(hopTrade.trade_id)

  return (
    <div className="hop-column">
      <div className="hop-label">
        <span className="hop-tag">TRADED</span>
        <span className="hop-date">{hopTrade.date}</span>
        <span className="trade-id-pill" title={hopTrade.trade_id}>
          #{truncateId(hopTrade.trade_id)}
        </span>
      </div>

      {hopTrade.assets?.length > 0 && (
        <TeamGroups assets={hopTrade.assets} renderedTrades={renderedTrades} />
      )}

      {group.map((a) =>
        a.trades.length > 1 ? (
          <React.Fragment key={a.asset_id || a.name}>
            <div className="continuing-label">{a.name} traded again</div>
            <Frontier
              assets={[{ ...a, trades: a.trades.slice(1) }]}
              renderedTrades={renderedTrades}
            />
          </React.Fragment>
        ) : null
      )}
    </div>
  )
}

// Everything that happens NEXT to a set of assets becomes a sibling
// column in one shared fan-out row: draft selections and subsequent
// trades sit side by side at the same level, so a drafted pick never
// looks like it belongs to a neighbouring trade.
export default function Frontier({ assets, renderedTrades }) {
  const columns = []

  assets
    .filter((a) => a.drafted_as)
    .forEach((a) => {
      columns.push(
        <DraftedColumn key={a.asset_id + '-drafted'} asset={a} renderedTrades={renderedTrades} />
      )
    })

  const withNext = assets.filter((a) => a.trades && a.trades.length > 0)
  const byTradeId = groupBy(withNext, (a) => a.trades[0].trade_id)
  Object.entries(byTradeId).forEach(([tradeId, group]) => {
    columns.push(<HopColumn key={tradeId} group={group} renderedTrades={renderedTrades} />)
  })

  if (columns.length === 0) return <div className="frontier" />

  return (
    <div className="frontier">
      <div
        className={'fanout' + (columns.length > 1 ? ' multi' : '')}
        style={columns.length <= 1 ? { paddingTop: 0 } : undefined}
      >
        {columns}
      </div>
    </div>
  )
}
