"use client"

import { useState, useEffect } from "react"
import Hand from "./components/Hand"
import BettingPanel from "./components/BettingPanel"
import GameControls from "./components/GameControls"
import GameMessage from "./components/GameMessage"
import InsurancePrompt from "./components/InsurancePrompt"
import { createNewDeck, drawCards } from "./utils/deckApi"
import { calculateHandValue, isBlackjack, isBust, shouldDealerHit, determineWinner, canSplit, canDoubleDown } from "./utils/gameLogic"
import "./App.css"

function App() {
  const [deckId, setDeckId] = useState(null)
  const [playerCards, setPlayerCards] = useState([])
  const [splitCards, setSplitCards] = useState(null)
  const [activeHand, setActiveHand] = useState("main")
  const [dealerCards, setDealerCards] = useState([])
  const [money, setMoney] = useState(1000)
  const [currentBet, setCurrentBet] = useState(0)
  const [splitBet, setSplitBet] = useState(0)
  const [insuranceBet, setInsuranceBet] = useState(0)
  const [gameState, setGameState] = useState("betting") // 'betting', 'insurancePrompt', 'playing', 'dealerTurn', 'gameOver'
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")

  useEffect(() => {
    initializeDeck()
  }, [])

  const initializeDeck = async () => {
    try {
      const newDeckId = await createNewDeck()
      setDeckId(newDeckId)
    } catch (error) {
      console.error("Failed to create deck:", error)
      setMessage("Failed to initialize game. Please refresh.")
      setMessageType("error")
    }
  }

  const placeBet = async (betAmount) => {
    if (betAmount > money) return

    setCurrentBet(betAmount)
    setMoney(money - betAmount)
    await dealInitialCards(betAmount)
  }

  const dealInitialCards = async (initialBet) => {
    try {
      const cards = await drawCards(deckId, 4)
      const playerInitialCards = [cards[0], cards[2]]
      const dealerInitialCards = [cards[1], cards[3]]

      setPlayerCards(playerInitialCards)
      setSplitCards(null)
      setActiveHand("main")
      setSplitBet(0)
      setInsuranceBet(0)
      setDealerCards(dealerInitialCards)
      setMessage("")

      const dealerUpCard = dealerInitialCards[1]
      const dealerShowsAce = dealerUpCard.value === "ACE"
      const maxInsurance = Math.floor(initialBet / 2)

      // Offer insurance if dealer shows Ace and player has funds
      if (dealerShowsAce && money >= maxInsurance) {
        setGameState("insurancePrompt")
        return
      }

      // If no insurance prompt, standard game continuation
      proceedAfterInsurance(playerInitialCards, dealerInitialCards, 0)
    } catch (error) {
      console.error("Failed to deal cards:", error)
      setMessage("Failed to deal cards. Please try again.")
      setMessageType("error")
    }
  }

  const handleInsuranceChoice = (buyInsurance) => {
    let cost = 0
    if (buyInsurance) {
      cost = Math.floor(currentBet / 2)
      setInsuranceBet(cost)
      setMoney((prevMoney) => prevMoney - cost)
    }
    proceedAfterInsurance(playerCards, dealerCards, cost)
  }

  const proceedAfterInsurance = (pCards, dCards, activeInsurance) => {
    const playerHasBJ = isBlackjack(pCards)
    const dealerHasBJ = isBlackjack(dCards)

    // Check immediate Blackjack conditions
    if (playerHasBJ || dealerHasBJ) {
      if (playerHasBJ && dealerHasBJ) {
        endGame("push", activeInsurance, dCards)
      } else if (playerHasBJ) {
        endGame("blackjack", activeInsurance, dCards)
      } else {
        endGame("dealer", activeInsurance, dCards)
      }
    } else {
      setGameState("playing")
    }
  }

  const hit = async () => {
    try {
      const newCards = await drawCards(deckId, 1)
      if (splitCards && activeHand === "split") {
        const updatedSplit = [...splitCards, ...newCards]
        setSplitCards(updatedSplit)
        if (isBust(updatedSplit)) {
          setActiveHand("main")
        }
      } else {
        const updatedPlayerCards = [...playerCards, ...newCards]
        setPlayerCards(updatedPlayerCards)
        if (isBust(updatedPlayerCards)) {
          if (splitCards) {
            setActiveHand("split")
          } else {
            endGame("dealer", insuranceBet, dealerCards)
          }
        }
      }
    } catch (error) {
      console.error("Failed to draw card:", error)
    }
  }

  const stand = () => {
    if (splitCards && activeHand === "main") {
      setActiveHand("split")
    } else {
      setGameState("dealerTurn")
      dealerPlay()
    }
  }

  const dealerPlay = async () => {
    let currentDealerCards = [...dealerCards]

    try {
      while (shouldDealerHit(currentDealerCards)) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const newCards = await drawCards(deckId, 1)
        currentDealerCards = [...currentDealerCards, ...newCards]
        setDealerCards(currentDealerCards)
      }

      if (splitCards) {
        const mainResult = determineWinner(playerCards, currentDealerCards)
        const splitResult = determineWinner(splitCards, currentDealerCards)
        endGame([mainResult, splitResult], insuranceBet, currentDealerCards)
      } else {
        const winner = determineWinner(playerCards, currentDealerCards)
        endGame(winner, insuranceBet, currentDealerCards)
      }
    } catch (error) {
      console.error("Dealer play error:", error)
    }
  }

  const endGame = (winner, currentInsurance = insuranceBet, finalDealerCards = dealerCards) => {
    setGameState("gameOver")

    // Calculate Insurance payout (2:1 if Dealer has Blackjack)
    let insuranceWinnings = 0
    let insuranceMsg = ""
    if (currentInsurance > 0) {
      if (isBlackjack(finalDealerCards)) {
        insuranceWinnings = currentInsurance * 3 // Original insurance bet + 2:1 payout
        insuranceMsg = ` (Insurance Pays +$${currentInsurance * 2})`
      } else {
        insuranceMsg = ` (Insurance Lost -$${currentInsurance})`
      }
    }

    if (Array.isArray(winner)) {
      let winnings = 0
      let msg = []
      let types = []
      const betArr = [currentBet, splitBet]
      ;["Main", "Split"].forEach((label, i) => {
        let w = 0, t = "", m = ""
        switch (winner[i]) {
          case "player":
            w = betArr[i] * 2
            m = `${label} hand wins! +$${betArr[i]}`
            t = "win"
            break
          case "blackjack":
            w = Math.floor(betArr[i] * 2.5)
            m = `${label} hand Blackjack! +$${Math.floor(betArr[i] * 1.5)}`
            t = "blackjack"
            break
          case "dealer":
            w = 0
            m = `${label} hand loses! -$${betArr[i]}`
            t = "lose"
            break
          case "push":
            w = betArr[i]
            m = `${label} hand push. Bet returned.`
            t = "push"
            break
        }
        winnings += w
        msg.push(m)
        types.push(t)
      })
      setMoney((prevMoney) => prevMoney + winnings + insuranceWinnings)
      setMessage(msg.join(" | ") + insuranceMsg)
      setMessageType(types.join(" "))
      return
    }

    let winnings = 0
    let messageText = ""
    let msgType = ""

    switch (winner) {
      case "player":
        winnings = currentBet * 2
        messageText = `You win! +$${currentBet}`
        msgType = "win"
        break
      case "blackjack":
        winnings = Math.floor(currentBet * 2.5)
        messageText = `Blackjack! +$${Math.floor(currentBet * 1.5)}`
        msgType = "blackjack"
        break
      case "dealer":
        winnings = 0
        messageText = `You lose! -$${currentBet}`
        msgType = "lose"
        break
      case "push":
        winnings = currentBet
        messageText = "Push! Bet returned."
        msgType = "push"
        break
    }

    setMoney((prevMoney) => prevMoney + winnings + insuranceWinnings)
    setMessage(messageText + insuranceMsg)
    setMessageType(msgType)
  }

  const newGame = () => {
    setPlayerCards([])
    setSplitCards(null)
    setActiveHand("main")
    setDealerCards([])
    setCurrentBet(0)
    setSplitBet(0)
    setInsuranceBet(0)
    setGameState("betting")
    setMessage("")
    setMessageType("")
  }

  let canHit = false
  if (gameState === "playing") {
    if (splitCards) {
      if (activeHand === "main") {
        canHit = !isBust(playerCards) && calculateHandValue(playerCards) < 21
      } else {
        canHit = !isBust(splitCards) && calculateHandValue(splitCards) < 21
      }
    } else {
      canHit = !isBust(playerCards) && calculateHandValue(playerCards) < 21
    }
  }

  const showSplit = gameState === "playing" && !splitCards && canSplit(playerCards) && money >= currentBet
  const showDoubleDown = gameState === "playing" && (
    (!splitCards && canDoubleDown(playerCards, money, currentBet)) ||
    (splitCards && activeHand === "main" && playerCards.length === 2 && canDoubleDown(playerCards, money, currentBet)) ||
    (splitCards && activeHand === "split" && splitCards.length === 2 && canDoubleDown(splitCards, money, splitBet))
  )
  const canSurrender = gameState === "playing" && playerCards.length === 2 && !splitCards

  const handleSplit = async () => {
    if (!canSplit(playerCards) || money < currentBet) return
    const newCards = await drawCards(deckId, 2)
    setPlayerCards([playerCards[0], newCards[0]])
    setSplitCards([playerCards[1], newCards[1]])
    setSplitBet(currentBet)
    setMoney((prevMoney) => prevMoney - currentBet)
    setActiveHand("main")
  }

  const handleDoubleDown = async () => {
    if (splitCards) {
      if (activeHand === "main" && playerCards.length === 2 && money >= currentBet) {
        const newCards = await drawCards(deckId, 1)
        const updated = [...playerCards, ...newCards]
        setPlayerCards(updated)
        setMoney((prevMoney) => prevMoney - currentBet)
        setCurrentBet(currentBet * 2)
        setActiveHand("split")
      } else if (activeHand === "split" && splitCards.length === 2 && money >= splitBet) {
        const newCards = await drawCards(deckId, 1)
        const updated = [...splitCards, ...newCards]
        setSplitCards(updated)
        setMoney((prevMoney) => prevMoney - splitBet)
        setSplitBet(splitBet * 2)
        setGameState("dealerTurn")
        dealerPlay()
      }
    } else if (playerCards.length === 2 && money >= currentBet) {
      const newCards = await drawCards(deckId, 1)
      const updated = [...playerCards, ...newCards]
      setPlayerCards(updated)
      setMoney((prevMoney) => prevMoney - currentBet)
      setCurrentBet(currentBet * 2)
      setGameState("dealerTurn")
      dealerPlay()
    }
  }

  const handleSurrender = () => {
    const refundAmount = Math.floor(currentBet / 2)
    setMoney((prevMoney) => prevMoney + refundAmount)
    setGameState("gameOver")
    setMessage(`Surrendered! Half bet returned (+$${refundAmount})`)
    setMessageType("push")
  }

  return (
    <div className="app minimalist">
      <div className="center-title">
        <h1>BlackJack</h1>
      </div>
      <div className="main-container">
        <aside className="betting-sidebar">
          <BettingPanel
            money={money}
            currentBet={currentBet}
            onPlaceBet={placeBet}
            gameInProgress={gameState !== "betting"}
          />
        </aside>
        <div className="game-center">
          <header className="game-header minimalist-header"></header>
          <div className="game-area minimalist-area">
            <Hand
              cards={dealerCards}
              title="Dealer"
              hideFirstCard={gameState === "playing" || gameState === "insurancePrompt"}
              showValue={gameState !== "playing" && gameState !== "insurancePrompt"}
            />
            <GameMessage message={message} type={messageType} />
            <Hand cards={playerCards} title={splitCards ? "Player (Main)" : "Player"} />
            {splitCards && <Hand cards={splitCards} title="Player (Split)" />}
          </div>
          <div className="control-area minimalist-controls">
            {gameState === "insurancePrompt" ? (
              <InsurancePrompt
                insuranceAmount={Math.floor(currentBet / 2)}
                onChoice={handleInsuranceChoice}
              />
            ) : (
              <GameControls
                onHit={hit}
                onStand={stand}
                onSplit={handleSplit}
                onDoubleDown={handleDoubleDown}
                onSurrender={handleSurrender}
                onNewGame={newGame}
                gameState={gameState}
                canHit={canHit}
                canSplit={showSplit}
                canDoubleDown={showDoubleDown}
                canSurrender={canSurrender}
              />
            )}
          </div>
        </div>
      </div>
      {money <= 0 && (
        <div className="game-over-overlay">
          <div className="game-over-message">
            <h2>Game Over!</h2>
            <p>You're out of money!</p>
            <button
              onClick={() => {
                setMoney(1000)
                newGame()
              }}
              className="restart-btn"
            >
              Start New Game ($1000)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
