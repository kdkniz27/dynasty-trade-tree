import React, { useEffect, useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TreeView from './components/TreeView.jsx'

// Trees are fetched one at a time (not bundled into the index) so the
// site only downloads the tree you're actually viewing, and no single
// file gets anywhere near GitHub's 100 MB per-file push limit.
const INDEX_URL = `${import.meta.env.BASE_URL}data/trades.json`
const treeUrl = (tradeId) => `${import.meta.env.BASE_URL}data/trees/${tradeId}.json`

function tradeIdFromHash() {
  const hash = window.location.hash.replace('#', '')
  return hash || null
}

export default function App() {
  const [index, setIndex] = useState(null)
  const [indexError, setIndexError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTradeId, setActiveTradeId] = useState(tradeIdFromHash)
  const [activeTree, setActiveTree] = useState(null)
  const [treeError, setTreeError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const treeCache = useRef(new Map())

  useEffect(() => {
    fetch(INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load trade list (${res.status})`)
        return res.json()
      })
      .then(setIndex)
      .catch((err) => setIndexError(err.message))
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

  useEffect(() => {
    if (!activeTradeId) {
      setActiveTree(null)
      return
    }

    const cached = treeCache.current.get(activeTradeId)
    if (cached) {
      setActiveTree(cached)
      return
    }

    setTreeError(null)
    setActiveTree(null)
    fetch(treeUrl(activeTradeId))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load this trade (${res.status})`)
        return res.json()
      })
      .then((tree) => {
        treeCache.current.set(activeTradeId, tree)
        setActiveTree(tree)
      })
      .catch((err) => setTreeError(err.message))
  }, [activeTradeId])

  if (indexError) {
    return (
      <div id="app-error">
        Couldn't load trade data: {indexError}
        <br />
        If you just set this up, make sure the data generator has run at least once.
      </div>
    )
  }

  if (!index) {
    return <div id="app-loading">Loading trade history…</div>
  }

  return (
    <div id="layout">
      <div id="sidebar-wrap" className={sidebarOpen ? '' : 'collapsed'}>
        <Sidebar
          trades={index.trades}
          activeTradeId={activeTradeId}
          onSelect={selectTrade}
          search={search}
          setSearch={setSearch}
          meta={{ tradeCount: index.trades.length, generatedAt: index.generated_at }}
        />
      </div>
      <button
        id="sidebar-toggle"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={sidebarOpen ? 'Collapse trade list' : 'Expand trade list'}
        title={sidebarOpen ? 'Collapse trade list' : 'Expand trade list'}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>
      <div id="main">
        {!activeTradeId && (
          <div id="placeholder">
            <div id="placeholder-title">Select a trade on the left</div>
            <div id="placeholder-sub">
              Its full tree renders here — every asset, everywhere it went, and every player it
              eventually became.
            </div>
          </div>
        )}
        {activeTradeId && treeError && (
          <div id="placeholder">
            <div id="placeholder-title">Couldn't load this trade</div>
            <div id="placeholder-sub">{treeError}</div>
          </div>
        )}
        {activeTradeId && !treeError && !activeTree && (
          <div id="placeholder">
            <div id="placeholder-title">Loading tree…</div>
          </div>
        )}
        {activeTradeId && activeTree && <TreeView tree={activeTree} />}
      </div>
    </div>
  )
}
