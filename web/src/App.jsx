import React, { useEffect, useState, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TreeView from './components/TreeView.jsx'

const DATA_URL = `${import.meta.env.BASE_URL}data/trades.json`

function tradeIdFromHash() {
  const hash = window.location.hash.replace('#', '')
  return hash || null
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTradeId, setActiveTradeId] = useState(tradeIdFromHash)

  useEffect(() => {
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load trade data (${res.status})`)
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  // Keep the URL hash and selection in sync, so a specific tree is
  // shareable/bookmarkable.
  const selectTrade = useCallback((tradeId) => {
    setActiveTradeId(tradeId)
    window.location.hash = tradeId
  }, [])

  useEffect(() => {
    const onHashChange = () => setActiveTradeId(tradeIdFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (error) {
    return (
      <div id="app-error">
        Couldn't load trade data: {error}
        <br />
        If you just set this up, make sure the data generator has run at least once.
      </div>
    )
  }

  if (!data) {
    return <div id="app-loading">Loading trade history…</div>
  }

  const activeTree = activeTradeId ? data.trees[activeTradeId] : null

  return (
    <div id="layout">
      <Sidebar
        trades={data.trades}
        activeTradeId={activeTradeId}
        onSelect={selectTrade}
        search={search}
        setSearch={setSearch}
        meta={{ tradeCount: data.trades.length, generatedAt: data.generated_at }}
      />
      <div id="main">
        {activeTree ? (
          <TreeView tree={activeTree} />
        ) : (
          <div id="placeholder">
            <div id="placeholder-title">Select a trade on the left</div>
            <div id="placeholder-sub">
              Its full tree renders here — every asset, everywhere it went, and every player it
              eventually became.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
