import React, { useEffect, useState, useCallback, useRef } from 'react'
import Home from './components/Home.jsx'
import Sidebar from './components/Sidebar.jsx'
import TreeView from './components/TreeView.jsx'

// Trees are fetched one at a time (not bundled into the index) so the
// site only downloads the tree you're actually viewing, and no single
// file gets anywhere near GitHub's 100 MB per-file push limit.
//
// Everything is namespaced by league ID (?league=... in the URL) so
// the site can serve more than one Sleeper league - see
// data/generate_data.py for how a league's data gets generated in
// the first place. A league ID that was never generated will just
// 404 here, which is handled below as "not available yet" rather
// than a generic error.
const indexUrl = (leagueId) => `${import.meta.env.BASE_URL}data/${leagueId}/trades.json`
const treeUrl = (leagueId, tradeId) =>
  `${import.meta.env.BASE_URL}data/${leagueId}/trees/${tradeId}.json`

function leagueIdFromUrl() {
  return new URLSearchParams(window.location.search).get('league')
}

function tradeIdFromHash() {
  const hash = window.location.hash.replace('#', '')
  return hash || null
}

export default function App() {
  const [leagueId, setLeagueId] = useState(leagueIdFromUrl)
  const [index, setIndex] = useState(null)
  const [indexError, setIndexError] = useState(null)
  const [indexNotFound, setIndexNotFound] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTradeId, setActiveTradeId] = useState(tradeIdFromHash)
  const [activeTree, setActiveTree] = useState(null)
  const [treeError, setTreeError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const treeCache = useRef(new Map())

  // Picking a league (from the home screen, or switching later) puts
  // it in the URL so the link is shareable, and clears anything tied
  // to whatever league was previously loaded.
  const selectLeague = useCallback((id) => {
    treeCache.current = new Map()
    setIndex(null)
    setIndexError(null)
    setIndexNotFound(false)
    setActiveTradeId(null)
    setActiveTree(null)
    setLeagueId(id)

    const url = new URL(window.location.href)
    url.searchParams.set('league', id)
    url.hash = ''
    window.history.pushState(null, '', url)
  }, [])

  const goHome = useCallback(() => {
    setLeagueId(null)
    setIndex(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('league')
    url.hash = ''
    window.history.pushState(null, '', url)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setLeagueId(leagueIdFromUrl())
      setActiveTradeId(tradeIdFromHash())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!leagueId) return

    fetch(indexUrl(leagueId))
      .then((res) => {
        if (res.status === 404) {
          setIndexNotFound(true)
          throw new Error('not found')
        }
        if (!res.ok) throw new Error(`Failed to load trade list (${res.status})`)
        return res.json()
      })
      .then(setIndex)
      .catch((err) => {
        if (err.message !== 'not found') setIndexError(err.message)
      })
  }, [leagueId])

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
    if (!activeTradeId || !leagueId) {
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
    fetch(treeUrl(leagueId, activeTradeId))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load this trade (${res.status})`)
        return res.json()
      })
      .then((tree) => {
        treeCache.current.set(activeTradeId, tree)
        setActiveTree(tree)
      })
      .catch((err) => setTreeError(err.message))
  }, [activeTradeId, leagueId])

  if (!leagueId) {
    return <Home onSubmit={selectLeague} />
  }

  if (indexNotFound) {
    return (
      <Home
        onSubmit={selectLeague}
        error={`League ${leagueId} hasn't been added to this site yet. Ask Kobe to add it, or try the beta league below.`}
      />
    )
  }

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
          onSwitchLeague={goHome}
          meta={{
            tradeCount: index.trades.length,
            generatedAt: index.generated_at,
            leagueName: index.league_name,
          }}
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
