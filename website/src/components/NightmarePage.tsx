"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { ethers } from "ethers"
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    Coins,
    Eye,
    EyeOff,
    Ghost,
    Heart,
    LogOut,
    RefreshCw,
    Search,
    Shield,
    Skull,
    ScrollText,
    Sword,
    UserPlus,
    X,
    Zap,
} from "lucide-react"
import { Button } from "./ui/button"
import { Checkbox } from "./ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import pepurgeAbi from "../assets/abis/Pepurge.json"
import { createWalletProvider, withReadProvider } from "../lib/providers"

const pepurgeContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS
const PAGE_SIZE = 200
const TARGETS_PER_PAGE = 8
const MAX_ATTACKERS = 20
const BATTLE_LOG_LIMIT = 50
const LOG_BLOCK_CHUNK = 2_000
const LOG_BLOCK_LOOKBACK = 100_000

interface PepurgeNFT {
    tokenId: string
    tokenOwner: string
    type: number
    hp: number
    maxHp: number
    attack: number
    defense: number
    lastActionTimestamp: number
    hiddenUntil: number
    imageUrl: string
}

interface ActionResult {
    success: boolean
    message: string
    type: "attack" | "hide" | "cashIn" | "claim"
    attackerTokenIds?: string[]
    targetTokenId?: string
    damage?: number
    victimHPBefore?: number
    victimHPAfter?: number
    killed?: boolean
    hideSucceeded?: boolean
    healed?: number
    autoHiddenTokenId?: string
    ethReward?: string
    attackerSnapshots?: PepurgeNFT[]
    targetSnapshot?: PepurgeNFT
}

interface BattleLogEntry {
    id: string
    blockNumber: number
    attackerTokenIds: string[]
    targetTokenId: string
    damage: number
    victimHPBefore: number
    victimHPAfter: number
    killed: boolean
    autoHiddenTokenId?: string
    ethReward?: string
}

function toPepurge(row: any): PepurgeNFT {
    const type = Number(row.pepeType ?? row[2])
    return {
        tokenId: (row.tokenId ?? row[0]).toString(),
        tokenOwner: row.tokenOwner ?? row[1],
        type,
        hp: Number(row.hp ?? row[3]),
        lastActionTimestamp: Number(row.lastActionAt ?? row[4]),
        hiddenUntil: Number(row.hiddenUntil ?? row[5]),
        attack: Number(row.attack ?? row[6]),
        defense: Number(row.defense ?? row[7]),
        maxHp: Number(row.maxHp ?? row[8]),
        imageUrl: `/pepes/${type}.png`,
    }
}

export default function NightmarePage() {
    const { open } = useAppKit()
    const { isConnected, address } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")

    const [allPepurges, setAllPepurges] = useState<PepurgeNFT[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isPerformingAction, setIsPerformingAction] = useState(false)
    const [showActionModal, setShowActionModal] = useState(false)
    const [showAttackerPicker, setShowAttackerPicker] = useState(false)
    const [showResultModal, setShowResultModal] = useState(false)
    const [showCashInModal, setShowCashInModal] = useState(false)
    const [showBatchLoadingModal, setShowBatchLoadingModal] = useState(false)
    const [actionType, setActionType] = useState<"attack" | "hide">("attack")
    const [selectedPepurge, setSelectedPepurge] = useState<PepurgeNFT | null>(null)
    const [selectedAttackerIds, setSelectedAttackerIds] = useState<string[]>([])
    const [targetTokenId, setTargetTokenId] = useState("")
    const [searchTokenId, setSearchTokenId] = useState("")
    const [currentTargetPage, setCurrentTargetPage] = useState(0)
    const [actionResult, setActionResult] = useState<ActionResult | null>(null)
    const [cashInPepurge, setCashInPepurge] = useState<PepurgeNFT | null>(null)
    const [cooldownSeconds, setCooldownSeconds] = useState(12 * 60 * 60)
    const [totalMinted, setTotalMinted] = useState(0)
    const [collectionSize, setCollectionSize] = useState(0)
    const [aliveCount, setAliveCount] = useState(0)
    const [endGameThreshold, setEndGameThreshold] = useState(0)
    const [gameActivated, setGameActivated] = useState(false)
    const [pendingReward, setPendingReward] = useState("0")
    const [winnerReward, setWinnerReward] = useState("0")
    const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([])
    const [battleLogLoading, setBattleLogLoading] = useState(false)
    const [battleLogExpanded, setBattleLogExpanded] = useState(false)
    const battleLogRequestInFlight = useRef(false)
    const battleLogLastScannedBlock = useRef<number | null>(null)
    const battleLogChainId = useRef<string | null>(null)
    const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000))
    const [batchProgress, setBatchProgress] = useState({
        currentBatch: 0,
        totalBatches: 0,
        processedTokens: 0,
        totalTokens: 0,
    })

    useEffect(() => {
        const timer = window.setInterval(
            () => setCurrentTime(Math.floor(Date.now() / 1000)),
            15_000,
        )
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        if (isConnected && address && walletProvider) {
            void fetchBattlefield()
        }
    }, [isConnected, address, walletProvider])

    useEffect(() => {
        if (!isConnected || !walletProvider) return
        void fetchBattleLog()
        const timer = window.setInterval(() => void fetchBattleLog(), 15_000)
        return () => window.clearInterval(timer)
    }, [isConnected, walletProvider])

    const normalizedAddress = address?.toLowerCase()
    const ethRewardThreshold = Math.floor(collectionSize / 4)
    const userPepurges = useMemo(
        () =>
            allPepurges.filter(
                (pepurge) => pepurge.tokenOwner.toLowerCase() === normalizedAddress,
            ),
        [allPepurges, normalizedAddress],
    )
    const availableTargets = useMemo(
        () =>
            allPepurges.filter(
                (pepurge) =>
                    pepurge.tokenOwner.toLowerCase() !== normalizedAddress &&
                    !isHidden(pepurge),
            ),
        [allPepurges, normalizedAddress, currentTime, aliveCount, ethRewardThreshold],
    )
    const filteredTargets = useMemo(() => {
        if (!searchTokenId.trim()) return availableTargets
        return availableTargets.filter((target) =>
            target.tokenId.includes(searchTokenId.trim()),
        )
    }, [availableTargets, searchTokenId])
    const targetPageCount = Math.max(
        1,
        Math.ceil(filteredTargets.length / TARGETS_PER_PAGE),
    )
    const visibleTargets = filteredTargets.slice(
        currentTargetPage * TARGETS_PER_PAGE,
        (currentTargetPage + 1) * TARGETS_PER_PAGE,
    )
    const collectionMinting = totalMinted < collectionSize
    const gameEnded =
        collectionSize > 0 &&
        totalMinted >= collectionSize &&
        aliveCount <= endGameThreshold
    const awaitingActivation =
        collectionSize > 0 && totalMinted >= collectionSize && !gameActivated
    function actionInfo(pepurge: PepurgeNFT) {
        const readyAt = pepurge.lastActionTimestamp + cooldownSeconds
        if (pepurge.lastActionTimestamp === 0 || readyAt <= currentTime) {
            return { canAct: true, label: "Ready" }
        }
        const remaining = readyAt - currentTime
        const hours = Math.floor(remaining / 3600)
        const minutes = Math.max(1, Math.ceil((remaining % 3600) / 60))
        return {
            canAct: false,
            label: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
        }
    }

    function isHidden(pepurge: PepurgeNFT) {
        return (
            aliveCount > ethRewardThreshold &&
            pepurge.hiddenUntil > currentTime
        )
    }

    async function fetchBattlefield() {
        if (!walletProvider || !address || !pepurgeContractAddress) return
        setIsLoading(true)
        try {
            await withReadProvider(walletProvider, async (provider) => {
                const contract = new ethers.Contract(
                    pepurgeContractAddress,
                    pepurgeAbi,
                    provider,
                )
                const [
                    minted,
                    size,
                    cooldown,
                    alive,
                    threshold,
                    activated,
                    reward,
                    survivorReward,
                ] = await Promise.all([
                    contract.totalMinted(),
                    contract.collectionSize(),
                    contract.coolDown(),
                    contract.aliveCount(),
                    contract.endGameThreshold(),
                    contract.gameActivated(),
                    contract.pendingRewards(address),
                    contract.winnerReward(),
                ])

                const mintedNumber = Number(minted)
                const totalBatches = Math.ceil(mintedNumber / PAGE_SIZE)
                setTotalMinted(mintedNumber)
                setCollectionSize(Number(size))
                setCooldownSeconds(Number(cooldown))
                setAliveCount(Number(alive))
                setEndGameThreshold(Number(threshold))
                setGameActivated(activated)
                setPendingReward(ethers.formatEther(reward))
                setWinnerReward(ethers.formatEther(survivorReward))
                setBatchProgress({
                    currentBatch: 0,
                    totalBatches,
                    processedTokens: 0,
                    totalTokens: mintedNumber,
                })

                if (mintedNumber === 0) {
                    setAllPepurges([])
                    return
                }

                setShowBatchLoadingModal(true)
                const battlefield: PepurgeNFT[] = []
                let cursor = 1n
                let batch = 0
                do {
                    const [rows, nextCursor] = await contract.getPepurgesPage(
                        cursor,
                        PAGE_SIZE,
                    )
                    battlefield.push(...rows.map(toPepurge))
                    batch += 1
                    setBatchProgress({
                        currentBatch: batch,
                        totalBatches,
                        processedTokens: Math.min(batch * PAGE_SIZE, mintedNumber),
                        totalTokens: mintedNumber,
                    })
                    cursor = BigInt(nextCursor)
                } while (cursor !== 0n)

                setAllPepurges(battlefield)
            })
        } catch (error) {
            console.error("Failed to load battlefield", error)
        } finally {
            setIsLoading(false)
            setShowBatchLoadingModal(false)
        }
    }

    async function fetchBattleLog() {
        if (
            !walletProvider ||
            !pepurgeContractAddress ||
            battleLogRequestInFlight.current
        ) {
            return
        }
        battleLogRequestInFlight.current = true
        setBattleLogLoading(true)
        try {
            await withReadProvider(walletProvider, async (provider) => {
                const contract = new ethers.Contract(
                    pepurgeContractAddress,
                    pepurgeAbi,
                    provider,
                )
                const contractInterface = new ethers.Interface(pepurgeAbi)
                const attackEvent = contractInterface.getEvent("AttackResult")
                const hiddenEvent = contractInterface.getEvent("AutoHideReward")
                const rewardEvent = contractInterface.getEvent("RewardCredited")
                if (!attackEvent || !hiddenEvent || !rewardEvent) return

                const [network, survivorReward] = await Promise.all([
                    provider.getNetwork(),
                    contract.winnerReward(),
                ])
                setWinnerReward(ethers.formatEther(survivorReward))
                const chainId = network.chainId.toString()
                if (battleLogChainId.current !== chainId) {
                    battleLogChainId.current = chainId
                    battleLogLastScannedBlock.current = null
                    setBattleLog([])
                }

                const latestBlock = await provider.getBlockNumber()
                const previousScannedBlock = battleLogLastScannedBlock.current
                const isInitialScan = previousScannedBlock === null
                const minimumBlock = isInitialScan
                    ? Math.max(0, latestBlock - LOG_BLOCK_LOOKBACK)
                    : previousScannedBlock + 1
                if (minimumBlock > latestBlock) return

                const attackLogs: ethers.Log[] = []
                const relatedLogs: ethers.Log[] = []
                let toBlock = latestBlock

                while (
                    toBlock >= minimumBlock &&
                    attackLogs.length < BATTLE_LOG_LIMIT
                ) {
                    const fromBlock = Math.max(
                        minimumBlock,
                        toBlock - LOG_BLOCK_CHUNK + 1,
                    )
                    const chunk = await provider.getLogs({
                        address: pepurgeContractAddress,
                        topics: [[
                            attackEvent.topicHash,
                            hiddenEvent.topicHash,
                            rewardEvent.topicHash,
                        ]],
                        fromBlock,
                        toBlock,
                    })
                    relatedLogs.push(...chunk)
                    attackLogs.push(
                        ...chunk.filter(
                            (log) => log.topics[0] === attackEvent.topicHash,
                        ),
                    )
                    toBlock = fromBlock - 1
                }
                battleLogLastScannedBlock.current = latestBlock

                const selectedAttackLogs = attackLogs
                    .sort(
                        (left, right) =>
                            right.blockNumber - left.blockNumber ||
                            right.index - left.index,
                    )
                    .slice(0, BATTLE_LOG_LIMIT)
                if (selectedAttackLogs.length === 0) {
                    if (isInitialScan) setBattleLog([])
                    return
                }

                const selectedTransactions = new Set(
                    selectedAttackLogs.map((log) => log.transactionHash),
                )
                const hiddenByTransaction = new Map<string, string>()
                const rewardByTransaction = new Map<string, string>()

                for (const log of relatedLogs) {
                    if (!selectedTransactions.has(log.transactionHash)) continue
                    const parsed = contractInterface.parseLog(log)
                    if (parsed?.name === "AutoHideReward") {
                        hiddenByTransaction.set(
                            log.transactionHash,
                            parsed.args.tokenId.toString(),
                        )
                    } else if (parsed?.name === "RewardCredited") {
                        rewardByTransaction.set(
                            log.transactionHash,
                            ethers.formatEther(parsed.args.amount),
                        )
                    }
                }

                const entries = selectedAttackLogs
                    .map((log): BattleLogEntry | null => {
                        const parsed = contractInterface.parseLog(log)
                        if (parsed?.name !== "AttackResult") return null
                        return {
                            id: `${log.transactionHash}-${log.index}`,
                            blockNumber: log.blockNumber,
                            attackerTokenIds: parsed.args.attackerTokenIds.map(
                                (tokenId: bigint) => tokenId.toString(),
                            ),
                            targetTokenId: parsed.args.victimTokenId.toString(),
                            damage: Number(parsed.args.damage),
                            victimHPBefore: Number(parsed.args.victimHPBefore),
                            victimHPAfter: Number(parsed.args.victimHPAfter),
                            killed: parsed.args.killed,
                            autoHiddenTokenId: hiddenByTransaction.get(
                                log.transactionHash,
                            ),
                            ethReward: rewardByTransaction.get(log.transactionHash),
                        }
                    })
                    .filter((entry): entry is BattleLogEntry => entry !== null)
                setBattleLog((current) => {
                    if (isInitialScan) return entries
                    const seen = new Set<string>()
                    return [...entries, ...current]
                        .filter((entry) => {
                            if (seen.has(entry.id)) return false
                            seen.add(entry.id)
                            return true
                        })
                        .slice(0, BATTLE_LOG_LIMIT)
                })
            })
        } catch (error) {
            console.error("Failed to load battle log", error)
        } finally {
            battleLogRequestInFlight.current = false
            setBattleLogLoading(false)
        }
    }

    function openActionModal(pepurge: PepurgeNFT, type: "attack" | "hide") {
        setSelectedPepurge(pepurge)
        setActionType(type)
        setSelectedAttackerIds(type === "attack" ? [pepurge.tokenId] : [])
        setShowAttackerPicker(false)
        setTargetTokenId("")
        setSearchTokenId("")
        setCurrentTargetPage(0)
        setShowActionModal(true)
    }

    function toggleAttacker(tokenId: string, checked: boolean) {
        setSelectedAttackerIds((current) => {
            if (checked) {
                if (current.length >= MAX_ATTACKERS || current.includes(tokenId)) {
                    return current
                }
                return [...current, tokenId]
            }
            if (tokenId === selectedPepurge?.tokenId) return current
            return current.filter((id) => id !== tokenId)
        })
    }

    function openAttackerPicker() {
        setShowActionModal(false)
        setShowAttackerPicker(true)
    }

    function returnToAttackModal() {
        setShowAttackerPicker(false)
        setShowActionModal(true)
    }

    async function handleAction() {
        if (!selectedPepurge || !walletProvider) return
        if (
            actionType === "attack" &&
            (!targetTokenId || selectedAttackerIds.length === 0)
        ) {
            return
        }

        const attackerSnapshots = selectedAttackerIds
            .map((tokenId) =>
                allPepurges.find((pepurge) => pepurge.tokenId === tokenId),
            )
            .filter((pepurge): pepurge is PepurgeNFT => pepurge !== undefined)
        const targetSnapshot = allPepurges.find(
            (pepurge) => pepurge.tokenId === targetTokenId,
        )

        setIsPerformingAction(true)
        try {
            const provider = createWalletProvider(walletProvider)
            const signer = await provider.getSigner()
            const contract = new ethers.Contract(
                pepurgeContractAddress,
                pepurgeAbi,
                signer,
            )
            const tx =
                actionType === "attack"
                    ? await contract.Attack(selectedAttackerIds, targetTokenId)
                    : await contract.Hide(selectedPepurge.tokenId)
            const receipt = await tx.wait()

            if (actionType === "attack") {
                let parsedResult: ActionResult = {
                    success: true,
                    message: "Attack confirmed",
                    type: "attack",
                    attackerTokenIds: selectedAttackerIds,
                    targetTokenId,
                    attackerSnapshots,
                    targetSnapshot,
                }
                for (const log of receipt.logs) {
                    try {
                        const parsed = contract.interface.parseLog(log)
                        if (parsed?.name === "AttackResult") {
                            parsedResult = {
                                ...parsedResult,
                                message: parsed.args.killed
                                    ? "Target eliminated"
                                    : "Damage dealt",
                                damage: Number(parsed.args.damage),
                                victimHPBefore: Number(parsed.args.victimHPBefore),
                                victimHPAfter: Number(parsed.args.victimHPAfter),
                                killed: parsed.args.killed,
                            }
                        } else if (parsed?.name === "AutoHideReward") {
                            parsedResult = {
                                ...parsedResult,
                                autoHiddenTokenId: parsed.args.tokenId.toString(),
                            }
                        } else if (parsed?.name === "RewardCredited") {
                            parsedResult = {
                                ...parsedResult,
                                ethReward: ethers.formatEther(parsed.args.amount),
                            }
                        }
                    } catch {
                        // Ignore unrelated logs in the receipt.
                    }
                }
                if (parsedResult.killed && parsedResult.autoHiddenTokenId) {
                    parsedResult.message = `Target eliminated; Pepurge #${parsedResult.autoHiddenTokenId} auto-hidden`
                } else if (parsedResult.killed && parsedResult.ethReward) {
                    parsedResult.message = "Target eliminated; ETH reward credited"
                }
                setActionResult(parsedResult)
            } else {
                let hideSucceeded = false
                let healed = 0
                for (const log of receipt.logs) {
                    try {
                        const parsed = contract.interface.parseLog(log)
                        if (parsed?.name === "HideAttempt") {
                            hideSucceeded = parsed.args.success
                            healed = Number(parsed.args.healed)
                        }
                    } catch {
                        // Ignore unrelated logs in the receipt.
                    }
                }
                setActionResult({
                    success: true,
                    message: hideSucceeded ? "Hidden successfully" : "Hide failed",
                    type: "hide",
                    attackerTokenIds: [selectedPepurge.tokenId],
                    hideSucceeded,
                    healed,
                })
            }

            setShowActionModal(false)
            setShowResultModal(true)
            await fetchBattlefield()
            await fetchBattleLog()
        } catch (error: any) {
            setActionResult({
                success: false,
                message:
                    error?.revert?.name ||
                    error?.reason ||
                    error?.shortMessage ||
                    "Action failed",
                type: actionType,
                attackerTokenIds: selectedAttackerIds,
                targetTokenId,
                attackerSnapshots,
                targetSnapshot,
            })
            setShowActionModal(false)
            setShowResultModal(true)
        } finally {
            setIsPerformingAction(false)
        }
    }

    async function cashIn(tokenId: string) {
        if (!walletProvider) return
        setIsPerformingAction(true)
        try {
            const provider = createWalletProvider(walletProvider)
            const signer = await provider.getSigner()
            const contract = new ethers.Contract(
                pepurgeContractAddress,
                pepurgeAbi,
                signer,
            )
            await (await contract.cashIn(tokenId)).wait()
            setActionResult({
                success: true,
                message: `Pepurge #${tokenId} burned for ${winnerReward} ETH`,
                type: "cashIn",
            })
            setShowCashInModal(false)
            setCashInPepurge(null)
            setShowResultModal(true)
            await fetchBattlefield()
        } catch (error: any) {
            setActionResult({
                success: false,
                message: error?.shortMessage || "Cash-in failed",
                type: "cashIn",
            })
            setShowCashInModal(false)
            setShowResultModal(true)
        } finally {
            setIsPerformingAction(false)
        }
    }

    async function claimRewards() {
        if (!walletProvider) return
        setIsPerformingAction(true)
        try {
            const provider = createWalletProvider(walletProvider)
            const signer = await provider.getSigner()
            const contract = new ethers.Contract(
                pepurgeContractAddress,
                pepurgeAbi,
                signer,
            )
            await (await contract.claimRewards()).wait()
            setActionResult({
                success: true,
                message: "Reward claimed",
                type: "claim",
            })
            setShowResultModal(true)
            await fetchBattlefield()
        } catch (error: any) {
            setActionResult({
                success: false,
                message: error?.shortMessage || "Claim failed",
                type: "claim",
            })
            setShowResultModal(true)
        } finally {
            setIsPerformingAction(false)
        }
    }

    if (!isConnected) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4 font-nosifer">
                <div className="text-center">
                    <img
                        src="/Pepurge_Text.png"
                        alt="Pepurge"
                        className="w-[60vw] max-w-4xl mx-auto mb-8 drop-shadow-2xl"
                    />
                    <Button
                        onClick={() => open()}
                        className="bg-[#CCFF00] text-black hover:bg-[#D4D0C9] border-4 border-[#CCFF00] text-2xl py-6 px-12"
                    >
                        CONNECT WALLET
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black p-4 font-nosifer text-[#D4D0C9]">
            <div className="mx-auto max-w-[1600px] pt-14">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div>
                        <img
                            src="/Pepurge_Text.png"
                            alt="Pepurge"
                            className="w-[58vw] max-w-xl drop-shadow-2xl"
                        />
                        <p className="text-[#D4D0C9] text-lg mt-2">
                            {aliveCount} OF {collectionSize || "-"} REMAIN
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {Number(pendingReward) > 0 && (
                            <Button
                                onClick={claimRewards}
                                disabled={isPerformingAction}
                                className="bg-[#CCFF00] hover:bg-[#D4D0C9] text-black border-2 border-[#CCFF00]"
                            >
                                <Coins className="w-4 h-4 mr-2" />
                                CLAIM {pendingReward} ETH
                            </Button>
                        )}
                        <Button
                            onClick={() => {
                                void fetchBattlefield()
                                void fetchBattleLog()
                            }}
                            disabled={isLoading}
                            size="icon"
                            title="Refresh battlefield"
                            className="bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                            onClick={() => open()}
                            className="bg-black text-[#D4D0C9] hover:text-[#CCFF00] border-2 border-[#D4D0C9]"
                        >
                            <span>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Wallet"}</span>
                            <LogOut className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </header>

                {collectionMinting && (
                    <div className="border-y-2 border-[#D4D0C9] bg-[#D4D0C9]/10 py-4 text-center text-[#D4D0C9] mb-6">
                        COLLECTION MINTING: {totalMinted} / {collectionSize}
                    </div>
                )}
                {awaitingActivation && (
                    <div className="border-y-2 border-[#CCFF00] bg-[#CCFF00]/10 py-4 text-center text-[#CCFF00] mb-6">
                        COLLECTION FINALIZED: WAITING FOR OWNER ACTIVATION
                    </div>
                )}
                {gameActivated && !gameEnded && (
                    <div className="border-y-2 border-[#CCFF00] bg-black py-3 text-center text-sm text-[#CCFF00] mb-6">
                        {aliveCount - 1 <= ethRewardThreshold
                            ? "NEXT KILL EARNS ETH"
                            : "NEXT KILL AUTO-HIDES ONE ATTACKER"}
                    </div>
                )}
                {gameEnded && (
                    <div className="border-y-2 border-[#CCFF00] bg-[#CCFF00] py-4 text-center text-black mb-6">
                        PURGE COMPLETE: CASH IN EACH SURVIVOR FOR {winnerReward} ETH
                    </div>
                )}

                <div
                    className={`grid gap-8 xl:items-start ${
                        battleLogExpanded
                            ? "xl:grid-cols-[minmax(0,1fr)_22rem]"
                            : "xl:grid-cols-[minmax(0,1fr)_3.5rem]"
                    }`}
                >
                    <main className="min-w-0">
                        {isLoading && allPepurges.length === 0 ? (
                            <div className="text-center py-24 text-[#D4D0C9] text-3xl">
                                <Skull className="w-14 h-14 mx-auto mb-4 animate-spin" />
                                LOADING BATTLEFIELD
                            </div>
                        ) : userPepurges.length === 0 ? (
                            <div className="text-center py-24 text-[#D4D0C9] text-3xl">
                                NO LIVING PEPURGES
                            </div>
                        ) : (
                            <section>
                                <h1 className="text-[#CCFF00] text-2xl mb-5">YOUR ARMY ({userPepurges.length})</h1>
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                                    {userPepurges.map((pepurge) => {
                                const action = actionInfo(pepurge)
                                const hidden = isHidden(pepurge)
                                const actionsDisabled =
                                    collectionMinting ||
                                    awaitingActivation ||
                                    gameEnded ||
                                    !action.canAct
                                return (
                                    <article
                                        key={pepurge.tokenId}
                                        className={`bg-black border-2 md:border-4 p-3 md:p-5 rounded-lg shadow-xl ${
                                            hidden ? "border-[#D4D0C9]" : "border-[#CCFF00]"
                                        }`}
                                    >
                                        <div className="aspect-square overflow-hidden rounded-md border-2 border-[#D4D0C9] mb-3">
                                            <img
                                                src={pepurge.imageUrl}
                                                alt={`Pepurge #${pepurge.tokenId}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="text-[#CCFF00] text-center text-sm md:text-xl mb-3">
                                            PEPURGE #{pepurge.tokenId}
                                        </div>
                                        <div className={`flex justify-center items-center gap-2 py-2 rounded mb-3 ${
                                            hidden
                                                ? "bg-[#D4D0C9] text-black"
                                                : "bg-[#CCFF00] text-black"
                                        }`}>
                                            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            <span className="text-xs">{hidden ? "HIDDEN" : "EXPOSED"}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1 text-center text-xs mb-3">
                                            <Stat icon={<Heart className="w-4 h-4" />} value={`${pepurge.hp}/${pepurge.maxHp}`} color="text-[#D4D0C9]" />
                                            <Stat icon={<Sword className="w-4 h-4" />} value={pepurge.attack} color="text-[#CCFF00]" />
                                            <Stat icon={<Shield className="w-4 h-4" />} value={pepurge.defense} color="text-[#D4D0C9]" />
                                        </div>
                                        <div className={`flex justify-center items-center gap-2 bg-[#D4D0C9]/10 py-2 rounded text-xs mb-3 ${
                                            action.canAct ? "text-[#CCFF00]" : "text-[#D4D0C9]"
                                        }`}>
                                            <Clock className="w-4 h-4" />
                                            {action.label}
                                        </div>
                                        {gameEnded ? (
                                            <Button
                                                onClick={() => {
                                                    setCashInPepurge(pepurge)
                                                    setShowCashInModal(true)
                                                }}
                                                disabled={isPerformingAction}
                                                className="w-full bg-[#CCFF00] hover:bg-[#D4D0C9] text-black border-2 border-[#CCFF00]"
                                            >
                                                <Coins className="w-4 h-4 mr-2" /> CASH IN
                                            </Button>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    onClick={() => openActionModal(pepurge, "attack")}
                                                    disabled={actionsDisabled || hidden}
                                                    className="bg-[#CCFF00] hover:bg-[#D4D0C9] text-black border-2 border-[#CCFF00] disabled:bg-[#D4D0C9]/20 disabled:text-[#D4D0C9]"
                                                >
                                                    <Sword className="w-4 h-4 mr-1" /> ATTACK
                                                </Button>
                                                <Button
                                                    onClick={() => openActionModal(pepurge, "hide")}
                                                    disabled={
                                                        actionsDisabled ||
                                                        hidden ||
                                                        aliveCount <= ethRewardThreshold
                                                    }
                                                    className="bg-black hover:bg-[#D4D0C9] hover:text-black text-[#D4D0C9] border-2 border-[#D4D0C9] disabled:bg-[#D4D0C9]/20 disabled:text-[#D4D0C9]"
                                                >
                                                    <Ghost className="w-4 h-4 mr-1" /> HIDE
                                                </Button>
                                            </div>
                                        )}
                                    </article>
                                )
                                    })}
                                </div>
                            </section>
                        )}
                    </main>

                    <BattleLog
                        entries={battleLog}
                        expanded={battleLogExpanded}
                        loading={battleLogLoading}
                        onRefresh={() => void fetchBattleLog()}
                        onToggle={() => setBattleLogExpanded((expanded) => !expanded)}
                    />
                </div>
            </div>

            <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
                <DialogContent className="bg-black text-[#D4D0C9] border-4 border-[#CCFF00] max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl md:text-3xl text-[#CCFF00] text-center font-nosifer">
                            {actionType === "attack" ? "GANG BANG" : "ATTEMPT TO HIDE"}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedPepurge && actionType === "attack" && (
                        <div className="space-y-6">
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-[#CCFF00]">ATTACKERS</h2>
                                    <span className="text-[#D4D0C9] text-sm">
                                        {selectedAttackerIds.length} / {MAX_ATTACKERS}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {selectedAttackerIds.map((tokenId, index) => {
                                        const pepurge = userPepurges.find(
                                            (candidate) => candidate.tokenId === tokenId,
                                        )
                                        if (!pepurge) return null
                                        return (
                                            <article
                                                key={pepurge.tokenId}
                                                className={`relative bg-black border-2 rounded-md p-2 ${
                                                    index === 0
                                                        ? "border-[#CCFF00]"
                                                        : "border-[#D4D0C9]"
                                                }`}
                                            >
                                                {index > 0 && (
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        title={`Remove Pepurge #${pepurge.tokenId}`}
                                                        aria-label={`Remove Pepurge #${pepurge.tokenId}`}
                                                        onClick={() =>
                                                            toggleAttacker(pepurge.tokenId, false)
                                                        }
                                                        className="absolute top-3 right-3 z-10 h-8 w-8 bg-black/90 text-[#CCFF00] border border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <div className="aspect-square mb-2">
                                                    <img
                                                        src={pepurge.imageUrl}
                                                        alt={`Pepurge #${pepurge.tokenId}`}
                                                        className="w-full h-full object-cover rounded"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <span className="text-[#D4D0C9]">#{pepurge.tokenId}</span>
                                                    <span className="text-[#CCFF00]">ATK {pepurge.attack}</span>
                                                </div>
                                        
                                            </article>
                                        )
                                    })}
                                </div>
                                <Button
                                    type="button"
                                    onClick={openAttackerPicker}
                                    disabled={selectedAttackerIds.length >= MAX_ATTACKERS}
                                    className="mt-3 w-full bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                                >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    {selectedAttackerIds.length >= MAX_ATTACKERS
                                        ? "ATTACKER LIMIT REACHED"
                                        : "ADD ADDITIONAL ATTACKERS"}
                                </Button>
                            </section>

                            <section>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                                    <h2 className="text-[#CCFF00]">TARGET</h2>
                                    <div className="relative md:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4D0C9]" />
                                        <Input
                                            value={searchTokenId}
                                            onChange={(event) => {
                                                setSearchTokenId(event.target.value.replace(/\D/g, ""))
                                                setCurrentTargetPage(0)
                                            }}
                                            placeholder="TOKEN ID"
                                            className="pl-9 bg-black text-[#D4D0C9] border-2 border-[#CCFF00] placeholder:text-[#D4D0C9]/70 focus-visible:ring-[#CCFF00]"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-h-48">
                                    {visibleTargets.map((target) => (
                                        <button
                                            type="button"
                                            key={target.tokenId}
                                            onClick={() => setTargetTokenId(target.tokenId)}
                                            className={`bg-black border-2 rounded-md p-2 text-left cursor-pointer ${
                                                targetTokenId === target.tokenId
                                                    ? "border-[#CCFF00]"
                                                    : "border-[#D4D0C9]"
                                            }`}
                                        >
                                            <div className="relative aspect-square mb-2">
                                                <img src={target.imageUrl} alt={`Pepurge #${target.tokenId}`} className="w-full h-full object-cover rounded" />
                                                {targetTokenId === target.tokenId && (
                                                    <Check className="absolute top-2 right-2 w-6 h-6 text-[#CCFF00] bg-black rounded" />
                                                )}
                                            </div>
                                            <div className="text-[#D4D0C9] text-xs">#{target.tokenId}</div>
                                            <div className="text-[#CCFF00] text-xs">HP {target.hp}/{target.maxHp} DEF {target.defense}</div>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex justify-center items-center gap-3 mt-4">
                                    <Button
                                        size="icon"
                                        title="Previous targets"
                                        onClick={() => setCurrentTargetPage((page) => Math.max(0, page - 1))}
                                        disabled={currentTargetPage === 0}
                                        className="bg-black text-[#CCFF00] border border-[#CCFF00]"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="text-[#D4D0C9] text-sm">
                                        {currentTargetPage + 1} / {targetPageCount}
                                    </span>
                                    <Button
                                        size="icon"
                                        title="Next targets"
                                        onClick={() => setCurrentTargetPage((page) => Math.min(targetPageCount - 1, page + 1))}
                                        disabled={currentTargetPage >= targetPageCount - 1}
                                        className="bg-black text-[#CCFF00] border border-[#CCFF00]"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </section>
                        </div>
                    )}

                    {selectedPepurge && actionType === "hide" && (
                        <div className="bg-black border-2 border-[#CCFF00] rounded-md p-4 flex items-center gap-4">
                            <img src={selectedPepurge.imageUrl} alt="" className="w-24 h-24 object-cover rounded" />
                            <div className="text-[#D4D0C9]">
                                <div className="text-xl mb-2">PEPURGE #{selectedPepurge.tokenId}</div>
                                <div className="text-[#CCFF00]">HP {selectedPepurge.hp}/{selectedPepurge.maxHp}</div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <Button onClick={() => setShowActionModal(false)} className="flex-1 bg-black text-[#D4D0C9] border-2 border-[#D4D0C9] hover:text-[#CCFF00] hover:border-[#CCFF00]">
                            CLOSE
                        </Button>
                        <Button
                            onClick={handleAction}
                            disabled={
                                isPerformingAction ||
                                (actionType === "attack" &&
                                    (!targetTokenId || selectedAttackerIds.length === 0))
                            }
                            className="flex-1 bg-[#CCFF00] hover:bg-black hover:text-[#CCFF00] text-black border-2 border-[#CCFF00]"
                        >
                            {isPerformingAction ? <Zap className="w-4 h-4 mr-2 animate-spin" /> : actionType === "attack" ? <Sword className="w-4 h-4 mr-2" /> : <Ghost className="w-4 h-4 mr-2" />}
                            {isPerformingAction ? "CONFIRMING" : actionType === "attack" ? "ATTACK" : "HIDE"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={showAttackerPicker}
                onOpenChange={(open) => {
                    if (open) {
                        setShowAttackerPicker(true)
                    } else {
                        returnToAttackModal()
                    }
                }}
            >
                <DialogContent className="bg-black text-[#D4D0C9] border-4 border-[#CCFF00] w-[calc(100%-1rem)] max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl md:text-3xl text-[#CCFF00] text-center font-nosifer pr-8">
                            ADD ATTACKERS
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex items-center justify-between gap-3 text-sm mb-3">
                        <span className="text-[#D4D0C9]">
                            READY AND EXPOSED PEPURGES
                        </span>
                        <span className="text-[#CCFF00]">
                            {selectedAttackerIds.length} / {MAX_ATTACKERS}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {userPepurges
                            .filter(
                                (pepurge) =>
                                    pepurge.tokenId !== selectedPepurge?.tokenId,
                            )
                            .map((pepurge) => {
                                const action = actionInfo(pepurge)
                                const eligible = action.canAct && !isHidden(pepurge)
                                const selected = selectedAttackerIds.includes(
                                    pepurge.tokenId,
                                )
                                const limitReached =
                                    selectedAttackerIds.length >= MAX_ATTACKERS &&
                                    !selected
                                return (
                                    <label
                                        key={pepurge.tokenId}
                                        className={`bg-black border-2 rounded-md p-2 ${
                                            selected
                                                ? "border-[#CCFF00]"
                                                : "border-[#D4D0C9]"
                                        } ${
                                            eligible && !limitReached
                                                ? "cursor-pointer"
                                                : "opacity-45"
                                        }`}
                                    >
                                        <div className="relative aspect-square mb-2">
                                            <img
                                                src={pepurge.imageUrl}
                                                alt={`Pepurge #${pepurge.tokenId}`}
                                                className="w-full h-full object-cover rounded"
                                            />
                                            <Checkbox
                                                checked={selected}
                                                disabled={!eligible || limitReached}
                                                onCheckedChange={(checked) =>
                                                    toggleAttacker(
                                                        pepurge.tokenId,
                                                        checked === true,
                                                    )
                                                }
                                                className="absolute top-2 right-2 bg-black border-[#D4D0C9]"
                                                aria-label={`Select Pepurge #${pepurge.tokenId}`}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                            <span className="text-[#D4D0C9]">#{pepurge.tokenId}</span>
                                            <span className="text-[#CCFF00]">ATK {pepurge.attack}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-[#D4D0C9]">
                                            {isHidden(pepurge) ? "HIDDEN" : action.label}
                                        </div>
                                    </label>
                                )
                            })}
                    </div>

                    <Button
                        type="button"
                        onClick={returnToAttackModal}
                        className="mt-4 w-full bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                    >
                        <Check className="w-4 h-4 mr-2" />
                        DONE
                    </Button>
                </DialogContent>
            </Dialog>

            <Dialog
                open={showCashInModal}
                onOpenChange={(open) => {
                    if (isPerformingAction) return
                    setShowCashInModal(open)
                    if (!open) setCashInPepurge(null)
                }}
            >
                <DialogContent className="bg-black text-[#D4D0C9] border-4 border-[#CCFF00] max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-[#CCFF00] text-center font-nosifer">
                            CASH IN SURVIVOR
                        </DialogTitle>
                    </DialogHeader>
                    {cashInPepurge && (
                        <div className="space-y-4 text-center">
                            <div className="mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-md border-2 border-[#CCFF00]">
                                <img
                                    src={cashInPepurge.imageUrl}
                                    alt={`Pepurge #${cashInPepurge.tokenId}`}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <p className="text-[#D4D0C9]">
                                BURN PEPURGE #{cashInPepurge.tokenId} FOR
                            </p>
                            <div className="border-y-2 border-[#CCFF00] py-4 text-2xl text-[#CCFF00]">
                                {winnerReward} ETH
                            </div>
                            <p className="text-sm text-[#D4D0C9]">
                                This permanently burns the NFT. The reward will be credited to your
                                claimable balance.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Button
                                    type="button"
                                    disabled={isPerformingAction}
                                    onClick={() => {
                                        setShowCashInModal(false)
                                        setCashInPepurge(null)
                                    }}
                                    className="bg-black text-[#D4D0C9] border-2 border-[#D4D0C9] hover:border-[#CCFF00] hover:text-[#CCFF00]"
                                >
                                    CANCEL
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isPerformingAction}
                                    onClick={() => cashIn(cashInPepurge.tokenId)}
                                    className="h-auto min-h-10 whitespace-normal bg-[#CCFF00] py-2 text-xs text-black border-2 border-[#CCFF00] hover:bg-[#D4D0C9] sm:text-sm"
                                >
                                    <Coins className="mr-2 h-4 w-4" />
                                    {isPerformingAction
                                        ? "CONFIRMING"
                                        : `BURN NFT FOR ${winnerReward} ETH`}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
                <DialogContent
                    className={`bg-black text-[#D4D0C9] border-4 border-[#CCFF00] max-h-[90vh] overflow-y-auto ${
                        actionResult?.type === "attack" && actionResult.success
                            ? "max-w-5xl"
                            : "max-w-md"
                    }`}
                >
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-[#CCFF00] text-center font-nosifer">
                            {actionResult?.type === "attack" && actionResult.success
                                ? actionResult.killed
                                    ? "TARGET ELIMINATED"
                                    : "ATTACK COMPLETE"
                                : actionResult?.success
                                  ? "ACTION CONFIRMED"
                                  : "ACTION FAILED"}
                        </DialogTitle>
                    </DialogHeader>
                    {actionResult && (
                        <div className="space-y-4 text-center">
                            {actionResult.type === "attack" && actionResult.success && (
                                <AttackResultDetails result={actionResult} />
                            )}
                            {actionResult.type !== "attack" && (
                                <p className="text-[#D4D0C9]">{actionResult.message}</p>
                            )}
                            {actionResult.type === "attack" && !actionResult.success && (
                                <p className="text-[#D4D0C9]">{actionResult.message}</p>
                            )}
                            {actionResult.type === "hide" && actionResult.success && (
                                <div className="bg-black border-2 border-[#CCFF00] rounded p-4 text-[#CCFF00] text-sm">
                                    {actionResult.hideSucceeded
                                        ? `HIDDEN, ${actionResult.healed || 0} HP RECOVERED`
                                        : "REMAINS EXPOSED"}
                                </div>
                            )}
                            <Button onClick={() => setShowResultModal(false)} className="w-full bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black">
                                CLOSE
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={showBatchLoadingModal} onOpenChange={() => undefined}>
                <DialogContent className="bg-black text-[#D4D0C9] border-4 border-[#CCFF00] max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-[#CCFF00] text-center font-nosifer">
                            SCANNING BATTLEFIELD
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex justify-between text-[#D4D0C9] text-sm">
                            <span>{batchProgress.currentBatch} / {batchProgress.totalBatches}</span>
                            <span>{batchProgress.processedTokens} / {batchProgress.totalTokens}</span>
                        </div>
                        <div className="h-4 bg-black border border-black rounded overflow-hidden">
                            <div
                                className="h-full bg-[#CCFF00] transition-[width]"
                                style={{
                                    width: `${batchProgress.totalTokens > 0
                                        ? (batchProgress.processedTokens / batchProgress.totalTokens) * 100
                                        : 0}%`,
                                }}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function BattleLog({
    entries,
    expanded,
    loading,
    onRefresh,
    onToggle,
}: {
    entries: BattleLogEntry[]
    expanded: boolean
    loading: boolean
    onRefresh: () => void
    onToggle: () => void
}) {
    return (
        <section className="border-y-2 border-[#D4D0C9] bg-[#D4D0C9]/5 xl:sticky xl:top-4">
            <header className={`flex h-14 items-center justify-between px-3 md:px-4 ${
                expanded
                    ? "border-b border-[#D4D0C9]/40"
                    : "xl:justify-center xl:px-2"
            }`}>
                <div className={`items-center gap-2 text-[#CCFF00] ${
                    expanded ? "flex" : "flex xl:hidden"
                }`}>
                    <ScrollText className="h-5 w-5" />
                    <h2>BATTLE LOG</h2>
                    <span className="font-sans text-xs text-[#D4D0C9]">LIVE</span>
                </div>
                <div className="flex items-center gap-2">
                    {expanded && (
                        <Button
                            type="button"
                            size="icon"
                            title="Refresh battle log"
                            aria-label="Refresh battle log"
                            disabled={loading}
                            onClick={onRefresh}
                            className="h-9 w-9 bg-black text-[#CCFF00] border border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="icon"
                        title={expanded ? "Hide battle log" : "Show battle log"}
                        aria-label={expanded ? "Hide battle log" : "Show battle log"}
                        aria-expanded={expanded}
                        onClick={onToggle}
                        className="h-9 w-9 bg-black text-[#CCFF00] border border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                    >
                        {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </header>

            {expanded && <div
                className="max-h-72 overflow-y-auto font-sans xl:max-h-[calc(100vh-8rem)]"
                aria-live="polite"
            >
                {entries.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#D4D0C9]">
                        {loading ? "LOADING BATTLES" : "NO BATTLES RECORDED YET"}
                    </div>
                ) : (
                    entries.map((entry) => {
                        const attackerLabel =
                            entry.attackerTokenIds.length === 1
                                ? "TOKEN"
                                : "TOKENS"
                        const attackers = entry.attackerTokenIds
                            .map((tokenId) => `#${tokenId}`)
                            .join(", ")
                        return (
                            <article
                                key={entry.id}
                                className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 border-b border-[#D4D0C9]/20 px-3 py-3 text-left last:border-b-0 md:px-4"
                            >
                                <div className="pt-0.5 text-[#CCFF00]">
                                    {entry.killed ? (
                                        <Skull className="h-5 w-5" />
                                    ) : (
                                        <Sword className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <div className="text-[10px] text-[#D4D0C9]/60">
                                        BLOCK {entry.blockNumber}
                                    </div>
                                    <p className="break-words text-sm text-[#D4D0C9]">
                                        <strong className="text-[#CCFF00]">
                                            {attackerLabel} {attackers}
                                        </strong>{" "}
                                        {entry.killed ? "KILLED" : "INFLICTED"}{" "}
                                        {entry.killed ? null : (
                                            <>
                                                <strong className="text-[#CCFF00]">
                                                    {entry.damage} DAMAGE
                                                </strong>{" "}
                                                TO
                                            </>
                                        )}{" "}
                                        <strong className="text-[#CCFF00]">
                                            TOKEN #{entry.targetTokenId}
                                        </strong>
                                        . HP {entry.victimHPBefore} TO {entry.victimHPAfter}.
                                    </p>
                                    {entry.autoHiddenTokenId && (
                                        <p className="flex items-center gap-1.5 text-xs text-[#CCFF00]">
                                            <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                            TOKEN #{entry.autoHiddenTokenId} WAS REWARDED WITH HIDDEN.
                                        </p>
                                    )}
                                    {entry.ethReward && (
                                        <p className="flex items-center gap-1.5 text-xs text-[#CCFF00]">
                                            <Coins className="h-3.5 w-3.5 shrink-0" />
                                            {entry.ethReward} ETH REWARD CREDITED.
                                        </p>
                                    )}
                                </div>
                            </article>
                        )
                    })
                )}
            </div>}
        </section>
    )
}

function Stat({
    icon,
    value,
    color,
}: {
    icon: React.ReactNode
    value: string | number
    color: string
}) {
    return (
        <div className={`bg-[#D4D0C9]/10 rounded p-2 ${color}`}>
            <div className="flex justify-center mb-1">{icon}</div>
            <div>{value}</div>
        </div>
    )
}

function AttackResultDetails({ result }: { result: ActionResult }) {
    const target = result.targetSnapshot
    const hpBefore = result.victimHPBefore ?? target?.hp ?? 0
    const hpAfter = result.victimHPAfter ?? hpBefore
    const damage = result.damage ?? 0

    return (
        <div className="space-y-5 text-left">
            <p className="text-center text-lg text-[#CCFF00]">
                {result.killed
                    ? `TARGET #${result.targetTokenId} WAS KILLED`
                    : `ATTACK INFLICTED ${damage} DAMAGE`}
            </p>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
                <section>
                    <h2 className="mb-3 text-[#CCFF00]">
                        ATTACKERS ({result.attackerSnapshots?.length ?? 0})
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {result.attackerSnapshots?.map((attacker) => {
                            const autoHidden =
                                attacker.tokenId === result.autoHiddenTokenId
                            return (
                                <article
                                    key={attacker.tokenId}
                                    className={`relative overflow-hidden rounded-md border-2 bg-black p-2 ${
                                        autoHidden
                                            ? "border-[#CCFF00]"
                                            : "border-[#D4D0C9]"
                                    }`}
                                >
                                    <div className="relative aspect-square overflow-hidden rounded">
                                        <img
                                            src={attacker.imageUrl}
                                            alt={`Attacker Pepurge #${attacker.tokenId}`}
                                            className="h-full w-full object-cover"
                                        />
                                        {autoHidden && (
                                            <div
                                                title="Auto-hidden after kill"
                                                className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#CCFF00] bg-black text-[#CCFF00]"
                                            >
                                                <EyeOff className="h-5 w-5" aria-hidden="true" />
                                                <span className="sr-only">Auto-hidden after kill</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                        <span className="text-[#D4D0C9]">#{attacker.tokenId}</span>
                                        <span className="text-[#CCFF00]">ATK {attacker.attack}</span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#D4D0C9]">
                                        <span>DEF {attacker.defense}</span>
                                        <span>HP {attacker.hp}/{attacker.maxHp}</span>
                                    </div>
                                    {autoHidden && (
                                        <div className="mt-2 flex items-center justify-center gap-1 bg-[#CCFF00] py-1 text-xs text-black">
                                            <EyeOff className="h-3 w-3" /> HIDDEN
                                        </div>
                                    )}
                                </article>
                            )
                        })}
                    </div>
                </section>

                <section>
                    <h2 className="mb-3 text-[#CCFF00]">TARGET</h2>
                    <article className="overflow-hidden rounded-md border-2 border-black bg-black p-3">
                        <div className="relative aspect-square overflow-hidden rounded border-2 border-[#D4D0C9]">
                            {target && (
                                <img
                                    src={target.imageUrl}
                                    alt={`Target Pepurge #${target.tokenId}`}
                                    className={`h-full w-full object-cover ${
                                        result.killed ? "grayscale opacity-40" : ""
                                    }`}
                                />
                            )}
                            {result.killed && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                                    <Skull
                                        className="h-20 w-20 text-[#CCFF00] drop-shadow-[0_2px_2px_rgba(0,0,0,1)]"
                                        aria-hidden="true"
                                    />
                                    <span className="sr-only">Target killed</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[#D4D0C9]">
                                PEPURGE #{result.targetTokenId}
                            </span>
                            {target && (
                                <span className="text-xs text-[#CCFF00]">
                                    ATK {target.attack} / DEF {target.defense}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                            <div className="border border-[#D4D0C9] bg-black p-3">
                                <div className="text-xs text-[#D4D0C9]">HP BEFORE</div>
                                <div className="mt-1 text-xl text-[#D4D0C9]">
                                    {hpBefore}/{target?.maxHp ?? hpBefore}
                                </div>
                            </div>
                            <div className="border border-[#CCFF00] bg-black p-3">
                                <div className="text-xs text-[#CCFF00]">HP AFTER</div>
                                <div className="mt-1 text-xl text-[#CCFF00]">
                                    {hpAfter}/{target?.maxHp ?? hpBefore}
                                </div>
                            </div>
                        </div>
                        <p
                            className={`mt-3 text-center text-sm ${
                                result.killed ? "text-[#D4D0C9]" : "text-[#CCFF00]"
                            }`}
                        >
                            {result.killed
                                ? "TARGET WAS KILLED"
                                : `${damage} DAMAGE: ${hpBefore} HP TO ${hpAfter} HP`}
                        </p>
                    </article>
                </section>
            </div>

            {result.autoHiddenTokenId && (
                <div className="flex items-center justify-center gap-2 border-2 border-[#CCFF00] bg-black p-3 text-center text-[#CCFF00]">
                    <EyeOff className="h-5 w-5" />
                    PEPURGE #{result.autoHiddenTokenId} WAS AUTO-HIDDEN
                </div>
            )}
            {result.ethReward && (
                <div className="flex items-center justify-center gap-2 border-2 border-[#CCFF00] bg-black p-3 text-center text-[#CCFF00]">
                    <Coins className="h-5 w-5" />
                    {result.ethReward} ETH CREDITED
                </div>
            )}
        </div>
    )
}
