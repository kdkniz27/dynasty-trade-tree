import React from 'react'
import { colorForTeam } from '../lib/colors.js'

export function TeamPill({ team }) {
  if (!team || !team.name) return null
  const color = colorForTeam(team.name)
  return (
    <span className="team-pill" style={{ background: color + '30', color }}>
      {team.avatar && <img className="team-pill-avatar" src={team.avatar} alt="" />}
      {team.name}
    </span>
  )
}

function assetIcon(type) {
  return type === 'player' ? '🏈' : '🎫'
}

export function AssetRow({ asset, showCounterparty, counterpartyKey }) {
  const other = showCounterparty ? asset[counterpartyKey] : null
  return (
    <div className={'asset-row ' + (asset.type || 'player')}>
      <span className="asset-icon">{assetIcon(asset.type)}</span>
      <span className="asset-name">
        {asset.name}
        {asset.player?.position && (
          <span className="asset-subtext">
            {' '}
            {asset.player.position}
            {asset.player.team ? ` · ${asset.player.team}` : ''}
          </span>
        )}
      </span>
      {other && other.name && <TeamPill team={other} />}
    </div>
  )
}

export function AssetGroupBox({ assets, muted, showCounterparty, counterpartyKey }) {
  return (
    <div className={'asset-group-box' + (muted ? ' muted' : '')}>
      {assets.map((asset) => (
        <AssetRow
          key={asset.asset_id + (asset.to_team?.name || '') + (asset.from_team?.name || '')}
          asset={asset}
          showCounterparty={showCounterparty}
          counterpartyKey={counterpartyKey}
        />
      ))}
    </div>
  )
}

export function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>
}
