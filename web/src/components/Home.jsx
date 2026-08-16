import React, { useState } from 'react'

// The league ID this site has been running against this whole time -
// shown here so beta testers (Kobe's leaguemates, who are all in this
// same league) can grab it in one click instead of having to go dig
// it out of a Sleeper URL themselves.
const BETA_LEAGUE_ID = '1312658766117744640'

export default function Home({ onSubmit, error }) {
  const [value, setValue] = useState('')
  const [copied, setCopied] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  const copyBeta = async () => {
    try {
      await navigator.clipboard.writeText(BETA_LEAGUE_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be blocked outside a secure context - the ID
      // is right there in the box either way, select-and-copy works.
    }
  }

  return (
    <div id="home">
      <div id="home-card">
        <h1 id="home-title">TRADE TREES</h1>

        <form id="home-form" onSubmit={submit}>
          <label id="home-label" htmlFor="home-input">
            Paste your League ID here
          </label>
          <input
            id="home-input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1312658766117744640"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button type="submit" id="home-submit">
            View trade trees
          </button>
          {error && <div id="home-error">{error}</div>}
        </form>

        <div id="home-beta">
          <div id="home-beta-label">Beta testing with Kobe? Use this league:</div>
          <div id="home-beta-row">
            <code id="home-beta-id">{BETA_LEAGUE_ID}</code>
            <button type="button" id="home-beta-copy" onClick={copyBeta}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
