import React from 'react'
import PlayTrivia from './trivia/PlayTrivia'
import ScavengerHuntPlayer from './scavenger/ScavengerHuntPlayer'

export default function GameSlot({ gameType }) {
  if (!gameType) {
    return null
  }

  switch (gameType.toLowerCase()) {
    case 'trivia':
      return <PlayTrivia />
    case 'scavenger':
      return <ScavengerHuntPlayer />
    default:
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p>Unknown game: <strong>{gameType}</strong></p>
          <p>Please wait for the host to select a game.</p>
        </div>
      )
  }
}
