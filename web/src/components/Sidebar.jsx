import React from 'react'

export default function Sidebar({ trades, activeTradeId, onSelect, search, setSearch, meta }) {
  const q = search.toLowerCase()
  const filtered = trades.filter(
    (t) =>
      t.summary.toLowerCase().includes(q) ||
      t.date.includes(q) ||
      (t.teams || []).some((team) => team.toLowerCase().includes(q))
  )

  return (
    <div id="sidebar">
      <div id="sidebar-header">
        <h1>Dynasty Trade Tree</h1>
        {meta && (
          <div id="meta-line">
            {meta.tradeCount} trades &middot; updated{' '}
            {meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString() : '—'}
          </div>
        )}
        <input
          id="search"
          type="text"
          placeholder="Search player, team, pick..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div id="trade-list">
        {filtered.map((trade) => (
          <div
            key={trade.trade_id}
            className={'trade-item' + (trade.trade_id === activeTradeId ? ' active' : '')}
            onClick={() => onSelect(trade.trade_id)}
          >
            <div className="date">
              {trade.date} &middot; {trade.season}
            </div>
            <div className="summary">{trade.summary}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="no-results">No trades match "{search}".</div>}
      </div>
    </div>
  )
}
