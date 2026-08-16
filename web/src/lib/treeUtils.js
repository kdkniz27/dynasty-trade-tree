// Shared helpers for measuring how much of the tree sits beneath a
// given branch, so a collapsed branch can show "12 more" instead of
// just vanishing without a trace. Deliberately kept free of any
// component imports (Frontier.jsx and TeamGroups.jsx both need this,
// and they already import each other, so a third file is easier than
// sorting out a circular import).
//
// Mirrors the same grouping logic Frontier.jsx uses to decide what
// counts as its own separate step: assets that share a trade_id are
// one node, not several, and an already-shown trade's own content
// isn't counted again here either - it's drawn in full elsewhere.
function groupByTradeId(items) {
  const map = {}
  items.forEach((item) => {
    const key = item.trades[0].trade_id
    if (!map[key]) map[key] = []
    map[key].push(item)
  })
  return map
}

export function hasFrontier(assets) {
  if (!assets) return false
  return assets.some((a) => a.drafted_as || (a.trades && a.trades.length > 0))
}

export function countFrontier(assets) {
  if (!assets || assets.length === 0) return 0
  let count = 0

  assets
    .filter((a) => a.drafted_as)
    .forEach((a) => {
      const d = a.drafted_as
      count +=
        1 +
        countFrontier([
          { name: d.player_name, type: 'player', trades: d.trades, drafted_as: null },
        ])
    })

  const withNext = assets.filter((a) => a.trades && a.trades.length > 0)
  const byTradeId = groupByTradeId(withNext)
  Object.values(byTradeId).forEach((group) => {
    const hopTrade = group[0].trades[0]
    count += 1
    if (hopTrade.already_shown) return
    count += countFrontier(hopTrade.assets || [])
    group.forEach((a) => {
      if (a.trades.length > 1) count += countFrontier([{ ...a, trades: a.trades.slice(1) }])
    })
  })

  return count
}
